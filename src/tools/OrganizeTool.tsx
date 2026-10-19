import { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash, CheckCircle, DownloadSimple,
  ArrowClockwise,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

interface PageItem {
  srcIndex: number;
  rotation: number;
  thumb: string;
  w: number;
  h: number;
}

type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 100;
const RELATED = ['merge', 'split', 'rotate'];

export default function OrganizeTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const to = dict.tools.organize as unknown as Record<string, string>;

  const [fileName, setFileName] = useState('');
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    engineRef.current = new EngineClient();
    return () => {
      engineRef.current?.terminate();
      if (result) URL.revokeObjectURL(result.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFile(f: File) {
    if (!(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
      setError(te.badType);
      setPhase('error');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      setPhase('error');
      return;
    }
    const buf = await f.arrayBuffer();
    setFileName(f.name);
    setSrcFile(f);
    setPhase('loading');
    setError('');
    try {
      // NOTE: thumbs transfers buf; organize re-reads from srcFile later
      const thumbs = await engineRef.current!.thumbs(
        buf,
        (done, total, status) => setProgress({ done, total, status }),
      );
      setPages(thumbs.map((th) => ({ srcIndex: th.index, rotation: 0, thumb: th.dataUrl, w: th.width, h: th.height })));
      setPhase('ready');
    } catch {
      setError(te.generic);
      setPhase('error');
    }
  }

  function rotatePage(i: number) {
    setPages((prev) => prev.map((p, j) => (j === i ? { ...p, rotation: (p.rotation + 90) % 360 } : p)));
  }

  function deletePage(i: number) {
    if (pages.length <= 1) {
      setError(te.deleteAll);
      return;
    }
    setPages((prev) => prev.filter((_, j) => j !== i));
  }

  function movePage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function onDropCard(to: number) {
    if (dragIdx === null || dragIdx === to) {
      setDragIdx(null);
      setDropIdx(null);
      return;
    }
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDropIdx(null);
  }

  async function doOrganize() {
    if (!srcFile || pages.length === 0) return;
    setPhase('processing');
    setError('');
    try {
      // Fresh read: the thumbs buffer was transferred (detached) to the worker
      const buf = await srcFile.arrayBuffer();
      const { blob, name } = await engineRef.current!.organize(
        buf,
        pages.map((p) => ({ index: p.srcIndex, rotation: p.rotation })),
        fileName,
        (done, total, status) => setProgress({ done, total, status }),
      );
      setResult({ url: URL.createObjectURL(blob), name, size: blob.size });
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function startOver() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setPages([]);
    setSrcFile(null);
    setFileName('');
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  /* ---------- DONE ---------- */
  if (phase === 'done' && result) {
    return (
      <div className="max-w-2xl mx-auto text-center px-4">
        <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
        <h2 className="mt-4 text-2xl font-bold">{result.name}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
          {(result.size / 1048576).toFixed(1)} MB · {fmt(t.pages, { n: pages.length })}
        </p>
        <a
          href={result.url}
          download={result.name}
          className="mt-6 inline-flex items-center gap-2 rounded-[10px] px-12 py-4 text-[17px] font-semibold text-white"
          style={{ background: 'var(--primary)' }}
        >
          <DownloadSimple size={20} weight="bold" /> {t.download}
        </a>
        <div className="mt-4">
          <button onClick={startOver} className="text-sm font-medium underline" style={{ color: 'var(--text-2)' }}>
            {t.startOver}
          </button>
        </div>
        <h3 className="mt-12 mb-4 text-lg font-semibold text-start">{t.relatedTools}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-start">
          {RELATED.map((k) => (
            <a
              key={k}
              href={toolUrl(locale, toolByKey[k].slug)}
              className="rounded-xl border p-4 hover:shadow-md"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="font-semibold text-[15px]">{(dict.tools as any)[k].name}</div>
              <div className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-2)' }}>{(dict.tools as any)[k].desc}</div>
            </a>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- MAIN ---------- */
  return (
    <div className="max-w-5xl mx-auto px-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        aria-label={t.selectFiles}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ''; }}
      />

      {phase === 'idle' && (
        <div className="max-w-2xl mx-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) addFile(f); }}
            className="rounded-2xl border-2 p-12 text-center transition-colors"
            style={{
              borderStyle: 'dashed',
              borderColor: dragOver ? 'var(--primary)' : 'var(--border)',
              background: dragOver ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--bg-soft)',
            }}
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-[10px] px-12 py-4 text-[17px] font-semibold text-white shadow-md hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              <Plus size={20} weight="bold" /> {t.selectFiles}
            </button>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-3)' }}>{t.dropHint}</p>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="mx-auto w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} aria-hidden="true" />
          <p className="mt-4 font-semibold">{to.loadingPages}</p>
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-soft)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={to.loadingPages}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>{progress.status}</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error') && pages.length > 0 && (
        <>
          <p className="mb-4 text-sm font-medium" style={{ color: 'var(--text-2)' }}>
            {fileName} · {fmt(t.pages, { n: pages.length })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" role="list" aria-label={to.h1}>
            {pages.map((p, i) => {
              const sideways = p.rotation === 90 || p.rotation === 270;
              return (
                <div
                  key={`${p.srcIndex}-${i}`}
                  role="listitem"
                  draggable
                  tabIndex={0}
                  aria-label={fmt(to.pageBadge, { n: i + 1 })}
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDropIdx(i); }}
                  onDrop={() => onDropCard(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') { e.preventDefault(); movePage(i, -1); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); movePage(i, 1); }
                  }}
                  className="group relative rounded-xl border p-2 cursor-grab"
                  style={{
                    background: 'var(--surface)',
                    borderColor: dropIdx === i ? 'var(--primary)' : 'var(--border)',
                    opacity: dragIdx === i ? 0.5 : 1,
                  }}
                >
                  <div
                    className="w-full overflow-hidden rounded-lg flex items-center justify-center"
                    style={{ aspectRatio: sideways ? `${p.h}/${p.w}` : `${p.w}/${p.h}`, background: 'var(--bg-soft)' }}
                  >
                    <img
                      src={p.thumb}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="max-w-full max-h-full pointer-events-none"
                      style={{ transform: `rotate(${p.rotation}deg)` }}
                    />
                  </div>
                  <span
                    className="absolute top-3 start-3 text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                  >
                    {i + 1}
                  </span>
                  <div className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => rotatePage(i)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                      aria-label={fmt(to.rotatePage, { n: i + 1 })}
                      title={fmt(to.rotatePage, { n: i + 1 })}
                    >
                      <ArrowClockwise size={15} />
                    </button>
                    <button
                      onClick={() => deletePage(i)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                      aria-label={fmt(to.deletePage, { n: i + 1 })}
                      title={fmt(to.deletePage, { n: i + 1 })}
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {t.startOver}
            </button>
            <button
              onClick={doOrganize}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white"
              style={{ background: 'var(--primary)' }}
            >
              {to.action}
            </button>
          </div>
        </>
      )}

      {phase === 'error' && error && (
        <div role="alert" className="mt-4 max-w-2xl mx-auto rounded-xl border p-4 text-sm flex items-start gap-3" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="font-semibold underline shrink-0">OK</button>
        </div>
      )}

      {phase === 'processing' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true" aria-label={t.processing}>
          <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: 'var(--surface)' }}>
            <div className="mx-auto w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} aria-hidden="true" />
            <p className="mt-4 font-semibold">{progress.status || t.processing}</p>
            <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-soft)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t.processing}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>{pct}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
