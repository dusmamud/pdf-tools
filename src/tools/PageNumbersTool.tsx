import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple, X,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import type { PageNumberOpts } from '../engine/pdf';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

interface DoneFile {
  url: string;
  name: string;
  size: number;
}

interface Preview {
  dataUrl: string;
  w: number;
  h: number;
  pages: number;
  name: string;
}

type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 100;
const MAX_FILES = 25;
const RELATED = ['watermark', 'organize', 'merge'];
const POSITIONS: PageNumberOpts['position'][] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];

export default function PageNumbersTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tn = dict.tools.pageNumbers as unknown as Record<string, string>;

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [results, setResults] = useState<DoneFile[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [position, setPosition] = useState<PageNumberOpts['position']>('bc');
  const [format, setFormat] = useState<PageNumberOpts['format']>('n');
  const [start, setStart] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [margin, setMargin] = useState(24);

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

  async function loadPreview(f: File) {
    try {
      const buf = await f.arrayBuffer();
      const thumbs = await engineRef.current!.thumbs(buf, () => {});
      if (thumbs.length > 0) {
        setPreview({
          dataUrl: thumbs[0].dataUrl,
          w: thumbs[0].width,
          h: thumbs[0].height,
          pages: thumbs.length,
          name: f.name,
        });
      }
    } catch {
      /* preview is best-effort; numbering still works */
    }
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (incoming.length === 0) {
      setError(te.badType);
      return;
    }
    if (files.length + incoming.length > MAX_FILES) {
      setError(fmt(tn.tooMany, { n: MAX_FILES }));
      return;
    }
    const total = [...files, ...incoming].reduce((s, f) => s + f.size, 0);
    if (total > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      return;
    }
    setError('');
    const next = [...files, ...incoming];
    setFiles(next);
    setPhase('ready');
    if (!preview && next.length > 0) {
      setPhase('loading');
      await loadPreview(next[0]);
      setPhase('ready');
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) {
        setPhase('idle');
        setPreview(null);
      } else if (preview && idx === 0) {
        // removed file was the preview source — reload preview async
        setPreview(null);
        void loadPreview(next[0]);
      }
      return next;
    });
  }

  async function doNumber() {
    if (files.length === 0) return;
    const opts: PageNumberOpts = {
      position,
      format,
      start: Math.max(1, Math.floor(start) || 1),
      fontSize,
      margin,
    };
    setPhase('processing');
    setError('');
    try {
      const out: DoneFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const buf = await f.arrayBuffer();
        const { blob, name } = await engineRef.current!.pageNumbers(
          buf,
          opts,
          f.name,
          (done, total, status) =>
            setProgress({ done: i + done / Math.max(total, 1), total: files.length, status }),
        );
        out.push({ url: URL.createObjectURL(blob), name, size: blob.size });
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
    setFiles([]);
    setPreview(null);
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const sampleText =
    format === 'n' ? `${start}` : format === 'nTotal' ? `${start} / ${preview?.pages ?? '–'}` : `Page ${start}`;

  function overlayStyle(): React.CSSProperties {
    const m = Math.max(4, margin * 0.35);
    const s: React.CSSProperties = { position: 'absolute', fontWeight: 600 };
    if (position[0] === 't') s.top = m;
    else s.bottom = m;
    if (position[1] === 'l') s.left = m;
    else if (position[1] === 'c') { s.left = '50%'; s.transform = 'translateX(-50%)'; }
    else s.right = m;
    return s;
  }

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto text-center px-4">
        <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
        <h2 className="mt-4 text-2xl font-bold">{tn.action}</h2>
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
        onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ''; }}
      />

      {phase === 'idle' && (
        <div className="max-w-2xl mx-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files); }}
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

      {(phase === 'ready' || phase === 'processing' || phase === 'error' || phase === 'loading') && files.length > 0 && (
        <div className="grid md:grid-cols-[320px_1fr] gap-8">
          {/* options */}
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold mb-2">{tn.position}</p>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tn.position}>
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    role="radio"
                    aria-checked={position === p}
                    onClick={() => setPosition(p)}
                    className="rounded-[10px] border px-2 py-2.5 text-xs font-semibold"
                    style={{
                      borderColor: position === p ? 'var(--primary)' : 'var(--border)',
                      background: position === p ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: position === p ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tn['pos' + p.toUpperCase()]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">{tn.format}</p>
              <div className="space-y-2" role="radiogroup" aria-label={tn.format}>
                {(['n', 'nTotal', 'pageN'] as const).map((f) => (
                  <label
                    key={f}
                    className="flex items-center gap-3 rounded-[10px] border px-4 py-2.5 text-sm font-medium cursor-pointer"
                    style={{
                      borderColor: format === f ? 'var(--primary)' : 'var(--border)',
                      background: format === f ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'var(--surface)',
                    }}
                  >
                    <input
                      type="radio"
                      name="pn-format"
                      checked={format === f}
                      onChange={() => setFormat(f)}
                      className="accent-current"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    {tn['format' + (f === 'n' ? 'N' : f === 'nTotal' ? 'NTotal' : 'PageN')]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="pn-start" className="text-sm font-semibold mb-2 block">{tn.startFrom}</label>
              <input
                id="pn-start"
                type="number"
                min={1}
                value={start}
                onChange={(e) => setStart(parseInt(e.target.value, 10))}
                className="w-28 rounded-[10px] border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
              />
            </div>

            <div>
              <label htmlFor="pn-size" className="text-sm font-semibold mb-2 block">
                {tn.fontSize}: <span style={{ color: 'var(--text-2)' }}>{fontSize} pt</span>
              </label>
              <input
                id="pn-size"
                type="range"
                min={8}
                max={24}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-full"
                style={{ accentColor: 'var(--primary)' }}
              />
            </div>

            <div>
              <label htmlFor="pn-margin" className="text-sm font-semibold mb-2 block">
                {tn.margin}: <span style={{ color: 'var(--text-2)' }}>{margin} pt</span>
              </label>
              <input
                id="pn-margin"
                type="range"
                min={10}
                max={80}
                value={margin}
                onChange={(e) => setMargin(parseInt(e.target.value, 10))}
                className="w-full"
                style={{ accentColor: 'var(--primary)' }}
              />
            </div>

            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{tn.overlayNote}</p>
          </div>

          {/* files + preview */}
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <Plus size={16} /> {tn.addMore}
              </button>
            </div>

            <div className="space-y-2 mb-6">
              {files.map((f, i) => (
                <div
                  key={f.name + i}
                  className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <span className="flex-1 truncate text-sm font-medium">{f.name}</span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {(f.size / 1048576).toFixed(1)} MB
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full"
                    style={{ background: 'var(--bg-soft)', color: 'var(--text-3)' }}
                    aria-label={fmt(tn.removeFile, { name: f.name })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-sm font-semibold mb-2">{tn.preview}</p>
            {preview ? (
              <div
                className="relative inline-block rounded-xl border overflow-hidden"
                style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)', maxWidth: 280 }}
              >
                <img src={preview.dataUrl} alt={fmt(tn.firstPage, { name: preview.name })} className="block w-full" draggable={false} />
                <span style={{ ...overlayStyle(), fontSize: Math.max(9, fontSize * 0.7) }}>{sampleText}</span>
              </div>
            ) : (
              <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                {tn.loadingPages}
              </div>
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
                onClick={doNumber}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white"
                style={{ background: 'var(--primary)' }}
              >
                {tn.action}
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
