import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple,
  ArrowClockwise, ArrowCounterClockwise, X,
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

interface FileJob {
  file: File;
  pages: PageItem[];
}

interface DoneFile {
  url: string;
  name: string;
  size: number;
}

type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 100;
const MAX_FILES = 25;
const RELATED = ['organize', 'merge', 'split'];

export default function RotateTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tr = dict.tools.rotate as unknown as Record<string, string>;

  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [results, setResults] = useState<DoneFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    engineRef.current = new EngineClient();
    return () => {
      engineRef.current?.terminate();
      results.forEach((r) => URL.revokeObjectURL(r.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (incoming.length === 0) {
      setError(te.badType);
      return;
    }
    if (jobs.length + incoming.length > MAX_FILES) {
      setError(fmt(tr.tooMany, { n: MAX_FILES }));
      return;
    }
    const currentTotal = jobs.reduce((s, j) => s + j.file.size, 0);
    const newTotal = incoming.reduce((s, f) => s + f.size, 0);
    if (currentTotal + newTotal > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      return;
    }
    setError('');
    setPhase('loading');
    try {
      for (const f of incoming) {
        // NOTE: thumbs transfers the buffer; doRotate re-reads from the File
        const buf = await f.arrayBuffer();
        const thumbs = await engineRef.current!.thumbs(
          buf,
          (done, total, status) => setProgress({ done, total, status }),
        );
        setJobs((prev) => [
          ...prev,
          {
            file: f,
            pages: thumbs.map((th) => ({
              srcIndex: th.index,
              rotation: 0,
              thumb: th.dataUrl,
              w: th.width,
              h: th.height,
            })),
          },
        ]);
      }
      setPhase('ready');
    } catch {
      setError(te.generic);
      setPhase(jobs.length > 0 ? 'ready' : 'error');
    }
  }

  function rotatePage(jobIdx: number, pageIdx: number, delta: number) {
    setJobs((prev) =>
      prev.map((j, ji) =>
        ji !== jobIdx
          ? j
          : {
              ...j,
              pages: j.pages.map((p, pi) =>
                pi !== pageIdx ? p : { ...p, rotation: (p.rotation + delta + 360) % 360 },
              ),
            },
      ),
    );
  }

  function rotateAll(delta: number) {
    setJobs((prev) =>
      prev.map((j) => ({
        ...j,
        pages: j.pages.map((p) => ({ ...p, rotation: (p.rotation + delta + 360) % 360 })),
      })),
    );
  }

  function removeFile(jobIdx: number) {
    setJobs((prev) => {
      const next = prev.filter((_, i) => i !== jobIdx);
      if (next.length === 0) setPhase('idle');
      return next;
    });
  }

  async function doRotate() {
    if (jobs.length === 0) return;
    setPhase('processing');
    setError('');
    try {
      const out: DoneFile[] = [];
      for (let ji = 0; ji < jobs.length; ji++) {
        const job = jobs[ji];
        const buf = await job.file.arrayBuffer();
        const { blob, name } = await engineRef.current!.organize(
          buf,
          job.pages.map((p) => ({ index: p.srcIndex, rotation: p.rotation })),
          job.file.name,
          (done, total, status) => setProgress({ done: ji + done / Math.max(total, 1), total: jobs.length, status }),
        );
        out.push({
          url: URL.createObjectURL(blob),
          name: name.replace(/_organized\.pdf$/i, '_rotated.pdf'),
          size: blob.size,
        });
      }
      setResults(out);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function startOver() {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);
    setJobs([]);
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto text-center px-4">
        <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
        <h2 className="mt-4 text-2xl font-bold">{tr.action}</h2>
        <div className="mt-6 space-y-3 text-start">
          {results.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-3 rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{r.name}</div>
                <div className="text-sm" style={{ color: 'var(--text-3)' }}>
                  {(r.size / 1048576).toFixed(1)} MB
                </div>
              </div>
              <a
                href={r.url}
                download={r.name}
                className="inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-[15px] font-semibold text-white shrink-0"
                style={{ background: 'var(--primary)' }}
              >
                <DownloadSimple size={18} weight="bold" /> {t.download}
              </a>
            </div>
          ))}
        </div>
        <div className="mt-6">
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
        multiple
        className="hidden"
        aria-label={t.selectFiles}
        onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
      />

      {phase === 'idle' && (
        <div className="max-w-2xl mx-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
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

      {phase === 'loading' && jobs.length === 0 && (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="mx-auto w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} aria-hidden="true" />
          <p className="mt-4 font-semibold">{tr.loadingPages}</p>
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-soft)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tr.loadingPages}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>{progress.status}</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error') && jobs.length > 0 && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => rotateAll(-90)}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <ArrowCounterClockwise size={16} /> {tr.rotateAllLeft}
            </button>
            <button
              onClick={() => rotateAll(90)}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <ArrowClockwise size={16} /> {tr.rotateAllRight}
            </button>
            <button
              onClick={() => rotateAll(180)}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {tr.rotateAll180}
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border ms-auto"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <Plus size={16} /> {tr.addMore}
            </button>
          </div>

          {jobs.map((job, ji) => (
            <section key={job.file.name + ji} className="mb-8" aria-label={job.file.name}>
              <div className="mb-3 flex items-center gap-2">
                <p className="text-sm font-semibold truncate">
                  {job.file.name} · {fmt(t.pages, { n: job.pages.length })}
                </p>
                <button
                  onClick={() => removeFile(ji)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0"
                  style={{ background: 'var(--bg-soft)', color: 'var(--text-3)' }}
                  aria-label={fmt(tr.removeFile, { name: job.file.name })}
                  title={fmt(tr.removeFile, { name: job.file.name })}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" role="list" aria-label={job.file.name}>
                {job.pages.map((p, pi) => {
                  const sideways = p.rotation === 90 || p.rotation === 270;
                  return (
                    <div
                      key={`${p.srcIndex}-${pi}`}
                      role="listitem"
                      tabIndex={0}
                      aria-label={fmt(tr.pageBadge, { n: pi + 1 })}
                      className="group relative rounded-xl border p-2"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
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
                        {pi + 1}{p.rotation > 0 ? ` · ${p.rotation}°` : ''}
                      </span>
                      <div className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => rotatePage(ji, pi, -90)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                          style={{ background: 'rgba(0,0,0,0.6)' }}
                          aria-label={fmt(tr.rotateLeft, { n: pi + 1 })}
                          title={fmt(tr.rotateLeft, { n: pi + 1 })}
                        >
                          <ArrowCounterClockwise size={15} />
                        </button>
                        <button
                          onClick={() => rotatePage(ji, pi, 90)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                          style={{ background: 'rgba(0,0,0,0.6)' }}
                          aria-label={fmt(tr.rotateRight, { n: pi + 1 })}
                          title={fmt(tr.rotateRight, { n: pi + 1 })}
                        >
                          <ArrowClockwise size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="mt-2 flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
            <button
              onClick={startOver}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {t.startOver}
            </button>
            <button
              onClick={doRotate}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white"
              style={{ background: 'var(--primary)' }}
            >
              {tr.action}
            </button>
          </div>
        </>
      )}

      {error && (
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
