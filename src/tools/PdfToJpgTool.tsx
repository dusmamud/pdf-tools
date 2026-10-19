import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import { parsePageRanges } from '../engine/pdf';
import type { PageImageOpts } from '../engine/render';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

interface ImgFile {
  url: string;
  name: string;
  size: number;
}

type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 25;
const BIG_WARN = 50;
const RELATED = ['jpgToPdf', 'compress', 'merge'];

export default function PdfToJpgTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tj = dict.tools.pdfToJpg as unknown as Record<string, string>;

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [results, setResults] = useState<ImgFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [format, setFormat] = useState<'jpg' | 'png'>('jpg');
  const [quality, setQuality] = useState(85);
  const [scale, setScale] = useState<1 | 2>(1);
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all');
  const [rangeInput, setRangeInput] = useState('');

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
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      return;
    }
    setError('');
    setFile(f);
    setResults([]);
    setThumbs([]);
    setPhase('loading');
    try {
      const buf = await f.arrayBuffer();
      const [counts] = await engineRef.current!.probe([buf.slice(0)]);
      setPageCount(counts);
      // thumbnails transfer their own copy
      const th = await engineRef.current!.thumbs(buf, () => {});
      setThumbs(th.map((x) => x.dataUrl));
      setPhase('ready');
    } catch {
      setError(te.generic);
      setPhase('error');
    }
  }

  const parsed = pageCount > 0 ? parsePageRanges(rangeInput, pageCount) : null;
  const rangeError = rangeMode === 'custom' && parsed && parsed.error ? tj.rangeInvalid : '';
  const selectedPages =
    rangeMode === 'all'
      ? Array.from({ length: pageCount }, (_, i) => i)
      : parsed && !parsed.error
        ? parsed.pages
        : [];
  const canConvert = file && selectedPages.length > 0 && !rangeError;

  async function doConvert() {
    if (!file || !canConvert) return;
    setPhase('processing');
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const opts: PageImageOpts = {
        format,
        quality: quality / 100,
        scale,
        pages: selectedPages,
      };
      const { files } = await engineRef.current!.pdfToJpg(
        buf,
        opts,
        file.name,
        (done, total, status) => setProgress({ done, total, status }),
      );
      setResults(
        files.map((f) => ({ url: URL.createObjectURL(f.blob), name: f.name, size: f.blob.size })),
      );
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function downloadAll() {
    // sequential downloads (no zip lib in v1) — staggered so browsers allow multiples
    results.forEach((r, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = r.url;
        a.download = r.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 600);
    });
  }

  function startOver() {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);
    setFile(null);
    setThumbs([]);
    setPageCount(0);
    setRangeInput('');
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center">
          <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
          <h2 className="mt-4 text-2xl font-bold">
            {fmt(tj.rangeHint, { n: results.length, total: results.length })}
          </h2>
          <button
            onClick={downloadAll}
            className="mt-6 inline-flex items-center gap-2 rounded-[10px] px-12 py-4 text-[17px] font-semibold text-white"
            style={{ background: 'var(--primary)' }}
          >
            <DownloadSimple size={20} weight="bold" /> {tj.downloadAll}
          </button>
          <div className="mt-4">
            <button onClick={startOver} className="text-sm font-medium underline" style={{ color: 'var(--text-2)' }}>
              {t.startOver}
            </button>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {results.map((r) => (
            <div key={r.name} className="rounded-xl border p-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="rounded-lg overflow-hidden flex items-center justify-center" style={{ aspectRatio: '3/4', background: 'var(--bg-soft)' }}>
                <img src={r.url} alt={r.name} loading="lazy" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="mt-2 flex items-center gap-2 px-1 pb-1">
                <span className="flex-1 truncate text-xs font-medium">{r.name}</span>
                <a href={r.url} download={r.name} className="shrink-0" style={{ color: 'var(--primary)' }} aria-label={`${t.download} ${r.name}`}>
                  <DownloadSimple size={18} weight="bold" />
                </a>
              </div>
            </div>
          ))}
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = ''; }}
      />

      {phase === 'idle' && (
        <div className="max-w-2xl mx-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void addFile(f); }}
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
          <p className="mt-4 font-semibold">{tj.loadingPages}</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error') && file && (
        <div className="grid md:grid-cols-[280px_1fr] gap-8">
          {/* options */}
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold mb-2">{tj.format}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tj.format}>
                {(['jpg', 'png'] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={format === k}
                    onClick={() => setFormat(k)}
                    className="rounded-[10px] border px-4 py-2.5 text-sm font-semibold"
                    style={{
                      borderColor: format === k ? 'var(--primary)' : 'var(--border)',
                      background: format === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: format === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tj[k === 'jpg' ? 'formatJpg' : 'formatPng']}
                  </button>
                ))}
              </div>
            </div>

            {format === 'jpg' && (
              <div>
                <label htmlFor="pj-q" className="text-sm font-semibold mb-2 block">
                  {tj.quality}: <span style={{ color: 'var(--text-2)' }}>{quality}%</span>
                </label>
                <input
                  id="pj-q"
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                  className="w-full"
                  style={{ accentColor: 'var(--primary)' }}
                />
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2">{tj.scale}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tj.scale}>
                {([1, 2] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={scale === k}
                    onClick={() => setScale(k)}
                    className="rounded-[10px] border px-4 py-2.5 text-sm font-semibold"
                    style={{
                      borderColor: scale === k ? 'var(--primary)' : 'var(--border)',
                      background: scale === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: scale === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tj[k === 1 ? 'scale1' : 'scale2']}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">{tj.range}</p>
              <div className="grid grid-cols-2 gap-2 mb-2" role="radiogroup" aria-label={tj.range}>
                {(['all', 'custom'] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={rangeMode === k}
                    onClick={() => setRangeMode(k)}
                    className="rounded-[10px] border px-4 py-2.5 text-sm font-semibold"
                    style={{
                      borderColor: rangeMode === k ? 'var(--primary)' : 'var(--border)',
                      background: rangeMode === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: rangeMode === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tj[k === 'all' ? 'rangeAll' : 'rangeCustom']}
                  </button>
                ))}
              </div>
              {rangeMode === 'custom' && (
                <>
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder={tj.rangePlaceholder}
                    aria-label={tj.rangeCustom}
                    className="w-full rounded-[10px] border px-3 py-2 text-sm"
                    style={{ borderColor: rangeError ? 'var(--danger)' : 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
                  />
                  <p className="mt-1 text-xs" style={{ color: rangeError ? 'var(--danger)' : 'var(--text-3)' }}>
                    {rangeError || fmt(tj.rangeHint, { n: selectedPages.length, total: pageCount })}
                  </p>
                </>
              )}
            </div>

            {pageCount > BIG_WARN && (
              <p className="text-xs rounded-lg border p-3" style={{ borderColor: 'var(--warn, #e6a23c)', color: 'var(--text-2)' }}>
                {fmt(tj.bigFileWarn, { n: pageCount })}
              </p>
            )}
          </div>

          {/* preview */}
          <div>
            <p className="mb-3 text-sm font-medium" style={{ color: 'var(--text-2)' }}>
              {file.name} · {fmt(t.pages, { n: pageCount })}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3" role="list" aria-label={tj.preview}>
              {thumbs.slice(0, 20).map((src, i) => (
                <div key={i} role="listitem" className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}>
                  <img src={src} alt="" loading="lazy" className="w-full block" draggable={false} />
                </div>
              ))}
            </div>
            {thumbs.length > 20 && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>+{thumbs.length - 20} more</p>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 max-w-xl">
              <button
                onClick={startOver}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-semibold border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {t.startOver}
              </button>
              <button
                onClick={doConvert}
                disabled={!canConvert}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--primary)' }}
              >
                {tj.action}
              </button>
            </div>
          </div>
        </div>
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
