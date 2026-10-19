import { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash, ArrowClockwise, ArrowCounterClockwise,
  DotsSixVertical, CheckCircle, DownloadSimple, ArrowLeft,
  FilePdf, CaretUp, CaretDown,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import { checkMergeLimits } from '../engine/limits';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface CardFile {
  uid: string;
  name: string;
  size: number;
  pages: number | null;
  rotation: number;
  buffer: ArrayBuffer;
}

type Phase = 'idle' | 'ready' | 'processing' | 'done' | 'error';

interface Props {
  locale: string;
  dict: Dict;
}

let uidSeq = 0;
const uid = () => `f-${Date.now()}-${uidSeq++}`;
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

const RELATED = ['split', 'compress', 'organize'];

export default function MergeTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const [files, setFiles] = useState<CardFile[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragUid, setDragUid] = useState<string | null>(null);
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

  async function addFileList(list: FileList | File[]) {
    const pdfs = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (pdfs.length === 0) {
      setError(te.badType);
      setPhase('error');
      return;
    }
    const next = [...files, ...pdfs.map((f) => ({ uid: uid(), name: f.name, size: f.size, pages: null as number | null, rotation: 0, buffer: null as unknown as ArrayBuffer, _f: f as File }))];
    const chk = checkMergeLimits(
      next,
      (l) => fmt(te.tooBig, { limit: l }),
      (n) => fmt(te.tooMany, { n }),
    );
    if (!chk.ok) {
      setError(chk.error!);
      setPhase('error');
      return;
    }
    // Read buffers
    const withBuffers: CardFile[] = await Promise.all(
      next.map(async (f: any) => {
        if (f.buffer) return f as CardFile;
        const buffer = await f._f.arrayBuffer();
        const { uid: u, name, size } = f;
        return { uid: u, name, size, pages: null, rotation: 0, buffer } as CardFile;
      }),
    );
    setFiles(withBuffers);
    setPhase('ready');
    // Probe page counts in worker (non-blocking)
    try {
      const counts = await engineRef.current!.probe(withBuffers.map((f) => f.buffer));
      setFiles((prev) => prev.map((f, i) => ({ ...f, pages: counts[i] ?? f.pages })));
    } catch {
      /* page counts are nice-to-have */
    }
  }

  function removeFile(u: string) {
    setFiles((prev) => {
      const next = prev.filter((f) => f.uid !== u);
      if (next.length === 0) setPhase('idle');
      return next;
    });
  }

  function rotateFile(u: string, dir: 90 | -90) {
    setFiles((prev) => prev.map((f) => (f.uid === u ? { ...f, rotation: (f.rotation + dir + 360) % 360 } : f)));
  }

  function moveFile(u: string, dir: -1 | 1) {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.uid === u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function doMerge() {
    if (files.length < 2) {
      setError(te.needTwo);
      setPhase('error');
      return;
    }
    setPhase('processing');
    setError('');
    try {
      const { blob, name } = await engineRef.current!.merge(
        files.map((f) => ({ buffer: f.buffer, rotation: f.rotation, name: f.name })),
        (done, total, status) => setProgress({ done, total, status }),
      );
      const url = URL.createObjectURL(blob);
      setResult({ url, name, size: blob.size });
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function startOver() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setFiles([]);
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
        <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>{mb(result.size)}</p>
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
    <div className="max-w-3xl mx-auto px-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        aria-label={t.selectFiles}
        onChange={(e) => { if (e.target.files) addFileList(e.target.files); e.target.value = ''; }}
      />

      {phase === 'idle' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFileList(e.dataTransfer.files); }}
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
      ) : (
        <>
          <ul className="space-y-3" aria-label="Selected files">
            {files.map((f, i) => (
              <li
                key={f.uid}
                draggable
                onDragStart={() => setDragUid(f.uid)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragUid || dragUid === f.uid) return;
                  setFiles((prev) => {
                    const from = prev.findIndex((x) => x.uid === dragUid);
                    const to = prev.findIndex((x) => x.uid === f.uid);
                    const next = [...prev];
                    const [moved] = next.splice(from, 1);
                    next.splice(to, 0, moved);
                    return next;
                  });
                  setDragUid(null);
                }}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', opacity: dragUid === f.uid ? 0.5 : 1 }}
              >
                <span className="cursor-grab px-1" style={{ color: 'var(--text-3)' }} aria-hidden="true">
                  <DotsSixVertical size={18} />
                </span>
                <span
                  className="w-14 h-16 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#ffe9e4', color: '#d63d2a', transform: `rotate(${f.rotation}deg)` }}
                >
                  <FilePdf size={28} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{f.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {f.pages !== null ? fmt(t.pages, { n: f.pages }) : '…'} · {mb(f.size)}
                    {f.rotation ? ` · ${f.rotation}°` : ''}
                  </div>
                  <div className="flex gap-1 mt-1 sm:hidden">
                    <button onClick={() => moveFile(f.uid, -1)} disabled={i === 0} className="p-1 disabled:opacity-30" aria-label={t.moveUp}><CaretUp size={16} /></button>
                    <button onClick={() => moveFile(f.uid, 1)} disabled={i === files.length - 1} className="p-1 disabled:opacity-30" aria-label={t.moveDown}><CaretDown size={16} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => rotateFile(f.uid, -90)} className="p-2 rounded-lg hover:opacity-70" aria-label={t.rotateCcw} title={t.rotateCcw}>
                    <ArrowCounterClockwise size={18} />
                  </button>
                  <button onClick={() => rotateFile(f.uid, 90)} className="p-2 rounded-lg hover:opacity-70" aria-label={t.rotateCw} title={t.rotateCw}>
                    <ArrowClockwise size={18} />
                  </button>
                  <button onClick={() => removeFile(f.uid)} className="p-2 rounded-lg hover:opacity-70" aria-label={fmt(t.removeFile, { name: f.name })} title={fmt(t.removeFile, { name: f.name })}>
                    <Trash size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <Plus size={18} weight="bold" /> {t.addMore}
            </button>
            <button
              onClick={doMerge}
              disabled={files.length < 2}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {dict.tools.merge.action}
            </button>
          </div>
          {files.length === 1 && (
            <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>{te.needTwo}</p>
          )}
        </>
      )}

      {phase === 'error' && error && (
        <div role="alert" className="mt-4 rounded-xl border p-4 text-sm flex items-start gap-3" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(''); setPhase(files.length ? 'ready' : 'idle'); }} className="font-semibold underline shrink-0">
            OK
          </button>
        </div>
      )}

      {phase === 'processing' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true" aria-label={t.processing}>
          <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: 'var(--surface)' }}>
            <div
              className="mx-auto w-10 h-10 rounded-full border-4 animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }}
              aria-hidden="true"
            />
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
