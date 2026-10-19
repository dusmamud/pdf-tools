import { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash, CheckCircle, DownloadSimple,
  FilePdf, Archive,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import type { CompressStats } from '../engine/worker';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

type Phase = 'idle' | 'ready' | 'processing' | 'done' | 'error';
type PresetKey = 'extreme' | 'recommended' | 'less';

interface InFile {
  uid: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
}

interface OutFile {
  url: string;
  name: string;
  stats: CompressStats;
}

const mb = (b: number) => (b / 1048576 >= 10 ? `${(b / 1048576).toFixed(0)} MB` : `${(b / 1048576).toFixed(1)} MB`);
const MAX_MB = 200;
const MAX_FILES = 10;
const RELATED = ['merge', 'split', 'pdfToJpg'];
const PRESETS: PresetKey[] = ['extreme', 'recommended', 'less'];

let uidSeq = 0;
const uid = () => `c-${Date.now()}-${uidSeq++}`;

export default function CompressTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tc = dict.tools.compress as unknown as Record<string, string>;

  const [files, setFiles] = useState<InFile[]>([]);
  const [preset, setPreset] = useState<PresetKey>('recommended');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '', file: '' });
  const [error, setError] = useState('');
  const [results, setResults] = useState<OutFile[]>([]);
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

  async function addFileList(list: FileList | File[]) {
    const pdfs = Array.from(list)
      .filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .slice(0, MAX_FILES - files.length);
    if (pdfs.length === 0) {
      setError(pdfs.length === 0 && files.length >= MAX_FILES ? fmt(te.tooMany, { n: MAX_FILES }) : te.badType);
      setPhase('error');
      return;
    }
    const total = [...files, ...pdfs].reduce((s, f) => s + f.size, 0);
    if (total > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      setPhase('error');
      return;
    }
    const withBuffers = await Promise.all(
      pdfs.map(async (f) => ({ uid: uid(), name: f.name, size: f.size, buffer: await f.arrayBuffer() })),
    );
    setFiles((prev) => [...prev, ...withBuffers]);
    setPhase('ready');
  }

  function removeFile(u: string) {
    setFiles((prev) => {
      const next = prev.filter((f) => f.uid !== u);
      if (next.length === 0) setPhase('idle');
      return next;
    });
  }

  async function doCompress() {
    if (files.length === 0) return;
    setPhase('processing');
    setError('');
    const outs: OutFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress({ done: 0, total: 0, status: '', file: `${i + 1}/${files.length} · ${f.name}` });
        const { blob, name, stats } = await engineRef.current!.compress(
          f.buffer,
          preset,
          f.name,
          (done, total, status) => setProgress({ done, total, status, file: `${i + 1}/${files.length} · ${f.name}` }),
        );
        outs.push({ url: URL.createObjectURL(blob), name, stats });
      }
      setResults(outs);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function startOver() {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);
    setFiles([]);
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const presetTitle = { extreme: tc.presetExtreme, recommended: tc.presetRecommended, less: tc.presetLess };
  const presetHint = { extreme: tc.presetExtremeHint, recommended: tc.presetRecommendedHint, less: tc.presetLessHint };

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center">
          <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
          <h2 className="mt-4 text-2xl font-bold">Compression complete</h2>
        </div>
        <ul className="mt-6 space-y-2">
          {results.map((r) => {
            const savedPct = Math.round((1 - r.stats.compressed / r.stats.original) * 100);
            return (
              <li
                key={r.name}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {tc.original}: {mb(r.stats.original)} → {tc.compressed}: {mb(r.stats.compressed)}
                    {r.stats.notSmaller ? (
                      <span className="ms-2" style={{ color: 'var(--warning)' }}>{tc.notSmaller}</span>
                    ) : (
                      <span className="ms-2 font-semibold" style={{ color: 'var(--success)' }}>
                        {fmt(tc.saved, { pct: savedPct })}
                      </span>
                    )}
                  </span>
                </span>
                <a
                  href={r.url}
                  download={r.name}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shrink-0"
                  style={{ background: 'var(--primary)' }}
                >
                  <DownloadSimple size={16} weight="bold" /> {t.download}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 text-center">
          <button onClick={startOver} className="text-sm font-medium underline" style={{ color: 'var(--text-2)' }}>
            {t.startOver}
          </button>
        </div>
        <h3 className="mt-12 mb-4 text-lg font-semibold">{t.relatedTools}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {files.length === 0 ? (
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
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div>
            <ul className="space-y-3" aria-label="Selected files">
              {files.map((f) => (
                <li
                  key={f.uid}
                  className="flex items-center gap-3 rounded-xl border p-3"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <span className="w-14 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#e2f5e9', color: '#1d7a3d' }}>
                    <FilePdf size={28} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{f.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{mb(f.size)}</div>
                  </div>
                  <button
                    onClick={() => removeFile(f.uid)}
                    className="p-2 rounded-lg hover:opacity-70 shrink-0"
                    aria-label={fmt(t.removeFile, { name: f.name })}
                  >
                    <Trash size={18} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              {files.length < MAX_FILES && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-semibold border"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <Plus size={18} weight="bold" /> {t.addMore}
                </button>
              )}
              <button
                onClick={doCompress}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white"
                style={{ background: 'var(--primary)' }}
              >
                <Archive size={20} /> {tc.action}
              </button>
            </div>
          </div>

          <aside
            className="rounded-2xl border p-2 h-fit"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            aria-label="Compression level"
          >
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                aria-pressed={preset === p}
                className="w-full text-start rounded-xl p-4 transition-colors"
                style={preset === p ? { background: 'color-mix(in srgb, var(--primary) 10%, transparent)' } : {}}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: preset === p ? 'var(--primary)' : 'var(--text-3)' }}
                  >
                    {preset === p && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }} />}
                  </span>
                  <span className="font-semibold text-[15px]">{presetTitle[p]}</span>
                </span>
                <span className="block mt-1 text-sm ps-[26px]" style={{ color: 'var(--text-2)' }}>
                  {presetHint[p]}
                </span>
              </button>
            ))}
          </aside>
        </div>
      )}

      {phase === 'error' && error && (
        <div role="alert" className="mt-4 rounded-xl border p-4 text-sm flex items-start gap-3" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(''); setPhase(files.length ? 'ready' : 'idle'); }} className="font-semibold underline shrink-0">OK</button>
        </div>
      )}

      {phase === 'processing' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true" aria-label={t.processing}>
          <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: 'var(--surface)' }}>
            <div className="mx-auto w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} aria-hidden="true" />
            <p className="mt-4 font-semibold">{progress.file}</p>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>{progress.status || t.processing}</p>
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
