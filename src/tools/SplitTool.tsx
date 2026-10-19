import { useEffect, useRef, useState } from 'react';
import {
  Plus, Trash, CheckCircle, DownloadSimple,
  FilePdf, Scissors,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import { parsePageRanges } from '../engine/pdf';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

type Phase = 'idle' | 'ready' | 'processing' | 'done' | 'error';
type Mode = 'extract' | 'range';

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
const MAX_MB = 100;
const RELATED = ['merge', 'compress', 'organize'];

export default function SplitTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const ts = dict.tools.split as unknown as Record<string, string>;

  const [file, setFile] = useState<{ name: string; size: number; pages: number; buffer: ArrayBuffer } | null>(null);
  const [mode, setMode] = useState<Mode>('extract');
  const [rangeInput, setRangeInput] = useState('');
  const [every, setEvery] = useState(1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [results, setResults] = useState<{ url: string; name: string; size: number }[]>([]);
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
    const buffer = await f.arrayBuffer();
    try {
      const counts = await engineRef.current!.probe([buffer]);
      setFile({ name: f.name, size: f.size, pages: counts[0], buffer });
      setEvery(1);
      setRangeInput('');
      setWarning('');
      setPhase('ready');
    } catch {
      setError(te.generic);
      setPhase('error');
    }
  }

  function addFileList(list: FileList | File[]) {
    const f = Array.from(list)[0];
    if (f) addFile(f);
  }

  const parsed = file ? parsePageRanges(rangeInput, file.pages) : null;
  const rangeError =
    !parsed || parsed.error === undefined
      ? ''
      : parsed.error === 'reversed'
        ? te.rangeReversed
        : te.badRange;
  const validExtract = mode === 'extract' && parsed && !parsed.error && parsed.pages.length > 0;
  const validRange = mode === 'range' && file && every >= 1 && every <= file.pages;
  const canSplit = !!file && (validExtract || validRange);

  async function doSplit() {
    if (!file || !canSplit) return;
    setPhase('processing');
    setError('');
    setWarning('');
    try {
      const pages = mode === 'extract' ? parsed!.pages : [];
      if (parsed && parsed.warnings.length) setWarning(te.rangeClamped);
      const outs = await engineRef.current!.split(
        file.buffer,
        { mode, pages, every, baseName: file.name },
        (done, total, status) => setProgress({ done, total, status }),
      );
      setResults(
        outs.map((o) => ({ url: URL.createObjectURL(o.blob), name: o.name, size: o.blob.size })),
      );
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function downloadAll() {
    results.forEach((r, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = r.url;
        a.download = r.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  }

  function startOver() {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);
    setFile(null);
    setRangeInput('');
    setWarning('');
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center">
          <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
          <h2 className="mt-4 text-2xl font-bold">
            {results.length === 1 ? results[0].name : `${results.length} PDFs created`}
          </h2>
        </div>
        <ul className="mt-6 space-y-2">
          {results.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between rounded-xl border px-4 py-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{mb(r.size)}</span>
              </span>
              <a
                href={r.url}
                download={r.name}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shrink-0 ms-3"
                style={{ background: 'var(--primary)' }}
              >
                <DownloadSimple size={16} weight="bold" /> {t.download}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
          {results.length > 1 && (
            <button
              onClick={downloadAll}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] px-8 py-3 text-[15px] font-semibold text-white"
              style={{ background: 'var(--primary)' }}
            >
              <DownloadSimple size={18} weight="bold" /> Download all
            </button>
          )}
          <button onClick={startOver} className="text-sm font-medium underline self-center" style={{ color: 'var(--text-2)' }}>
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
        className="hidden"
        aria-label={t.selectFiles}
        onChange={(e) => { if (e.target.files) addFileList(e.target.files); e.target.value = ''; }}
      />

      {!file ? (
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
            <div
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <span className="w-14 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#ffe9e4', color: '#d63d2a' }}>
                <FilePdf size={28} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{file.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {fmt(t.pages, { n: file.pages })} · {mb(file.size)}
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setPhase('idle'); }}
                className="p-2 rounded-lg hover:opacity-70 shrink-0"
                aria-label={fmt(t.removeFile, { name: file.name })}
              >
                <Trash size={18} />
              </button>
            </div>

            {mode === 'extract' && (
              <div className="mt-4">
                <label htmlFor="split-range" className="block text-sm font-semibold mb-1.5">{ts.rangeLabel}</label>
                <input
                  id="split-range"
                  type="text"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder={ts.rangePlaceholder}
                  inputMode="text"
                  autoComplete="off"
                  className="w-full rounded-[10px] border px-4 py-3 text-[15px]"
                  style={{ background: 'var(--surface)', borderColor: rangeError ? 'var(--danger)' : 'var(--border)', color: 'var(--text)' }}
                  aria-invalid={!!rangeError}
                  aria-describedby="split-range-hint"
                />
                <p id="split-range-hint" className="mt-1.5 text-sm" style={{ color: rangeError ? 'var(--danger)' : 'var(--text-3)' }}>
                  {rangeError || (parsed && !parsed.error && rangeInput.trim()
                    ? fmt(ts.selectedCount, { n: parsed.pages.length, total: file.pages })
                    : ts.rangePlaceholder)}
                </p>
                {warning && <p className="mt-1.5 text-sm" style={{ color: 'var(--warning)' }}>{warning}</p>}
              </div>
            )}

            {mode === 'range' && (
              <div className="mt-4">
                <label htmlFor="split-every" className="block text-sm font-semibold mb-1.5">{ts.everyLabel}</label>
                <input
                  id="split-every"
                  type="number"
                  min={1}
                  max={file.pages}
                  value={every}
                  onChange={(e) => setEvery(Math.max(1, Math.min(file.pages, parseInt(e.target.value, 10) || 1)))}
                  className="w-32 rounded-[10px] border px-4 py-3 text-[15px]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <p className="mt-1.5 text-sm" style={{ color: 'var(--text-3)' }}>
                  {Math.ceil(file.pages / every)} {Math.ceil(file.pages / every) === 1 ? 'PDF' : 'PDFs'}
                </p>
              </div>
            )}

            <button
              onClick={doSplit}
              disabled={!canSplit}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-6 py-3.5 text-[17px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              <Scissors size={20} /> {ts.action}
            </button>
          </div>

          <aside
            className="rounded-2xl border p-2 h-fit"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            aria-label="Split options"
          >
            {(['extract', 'range'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className="w-full text-start rounded-xl p-4 transition-colors"
                style={mode === m ? { background: 'color-mix(in srgb, var(--primary) 10%, transparent)' } : {}}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: mode === m ? 'var(--primary)' : 'var(--text-3)' }}
                  >
                    {mode === m && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }} />}
                  </span>
                  <span className="font-semibold text-[15px]">{m === 'extract' ? ts.modeExtract : ts.modeRange}</span>
                </span>
                <span className="block mt-1 text-sm ps-[26px]" style={{ color: 'var(--text-2)' }}>
                  {m === 'extract' ? ts.modeExtractHint : ts.modeRangeHint}
                </span>
              </button>
            ))}
          </aside>
        </div>
      )}

      {phase === 'error' && error && (
        <div role="alert" className="mt-4 rounded-xl border p-4 text-sm flex items-start gap-3" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(''); setPhase(file ? 'ready' : 'idle'); }} className="font-semibold underline shrink-0">OK</button>
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
