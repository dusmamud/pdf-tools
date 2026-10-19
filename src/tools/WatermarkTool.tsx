import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple, X, Image as ImageIcon,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import type { WatermarkOpts } from '../engine/pdf';
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
  name: string;
}

type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 100;
const MAX_FILES = 25;
const MAX_IMG_MB = 5;
const RELATED = ['pageNumbers', 'organize', 'merge'];

export default function WatermarkTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tw = dict.tools.watermark as unknown as Record<string, string>;

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [results, setResults] = useState<DoneFile[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [wmType, setWmType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(30);
  const [rotation, setRotation] = useState(-45);
  const [position, setPosition] = useState<'tiled' | 'center'>('tiled');
  const [imageScale, setImageScale] = useState(40);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    engineRef.current = new EngineClient();
    return () => {
      engineRef.current?.terminate();
      results.forEach((r) => URL.revokeObjectURL(r.url));
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPreview(f: File) {
    try {
      const buf = await f.arrayBuffer();
      const thumbs = await engineRef.current!.thumbs(buf, () => {});
      if (thumbs.length > 0) setPreview({ dataUrl: thumbs[0].dataUrl, name: f.name });
    } catch {
      /* preview is best-effort */
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
      setError(fmt(tw.tooMany, { n: MAX_FILES }));
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
    if (!preview) {
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
        setPreview(null);
        void loadPreview(next[0]);
      }
      return next;
    });
  }

  function pickImage(f: File | undefined) {
    if (!f) return;
    const okType = f.type === 'image/png' || f.type === 'image/jpeg' || /\.(png|jpe?g)$/i.test(f.name);
    if (!okType || f.size > MAX_IMG_MB * 1024 * 1024) {
      setError(tw.badImage);
      return;
    }
    setError('');
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgFile(f);
    setImgUrl(URL.createObjectURL(f));
  }

  async function doWatermark() {
    if (files.length === 0) return;
    if (wmType === 'text' && !text.trim()) {
      setError(tw.needText);
      return;
    }
    if (wmType === 'image' && !imgFile) {
      setError(tw.badImage);
      return;
    }
    const opts: WatermarkOpts = {
      type: wmType,
      text: text.trim(),
      fontSize,
      opacity: opacity / 100,
      rotation,
      position,
      imageScale: imageScale / 100,
    };
    setPhase('processing');
    setError('');
    try {
      const imgBuf = imgFile ? await imgFile.arrayBuffer() : null;
      const out: DoneFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const buf = await f.arrayBuffer();
        const { blob, name } = await engineRef.current!.watermark(
          buf,
          opts,
          imgBuf ? imgBuf.slice(0) : null,
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
  const scaledFont = Math.max(8, Math.min(22, fontSize * 0.32));

  function renderOverlay() {
    const op = opacity / 100;
    if (wmType === 'image' && imgUrl) {
      const wPct = position === 'center' ? imageScale : Math.min(imageScale, 33);
      if (position === 'center') {
        return (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              style={{ width: `${wPct}%`, opacity: op, transform: `rotate(${rotation}deg)` }}
            />
          </div>
        );
      }
      return (
        <div className="absolute overflow-hidden pointer-events-none" style={{ inset: '-30%' }}>
          <div
            className="w-full h-full flex flex-wrap items-center justify-center"
            style={{ transform: `rotate(${rotation}deg)`, gap: 14, opacity: op }}
          >
            {Array.from({ length: 30 }).map((_, i) => (
              <img key={i} src={imgUrl} alt="" draggable={false} style={{ width: `${wPct * 0.5}%` }} />
            ))}
          </div>
        </div>
      );
    }
    const label = text.trim() || 'WATERMARK';
    if (position === 'center') {
      return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            style={{
              fontSize: scaledFont,
              fontWeight: 800,
              color: '#595959',
              opacity: op,
              transform: `rotate(${rotation}deg)`,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        </div>
      );
    }
    return (
      <div className="absolute overflow-hidden pointer-events-none" style={{ inset: '-30%' }}>
        <div
          className="w-full h-full flex flex-wrap items-center justify-center"
          style={{ transform: `rotate(${rotation}deg)`, gap: '16px 26px', opacity: op }}
        >
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              style={{ fontSize: scaledFont, fontWeight: 800, color: '#595959', whiteSpace: 'nowrap' }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto text-center px-4">
        <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
        <h2 className="mt-4 text-2xl font-bold">{tw.action}</h2>
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
      <input
        ref={imgInputRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        className="hidden"
        aria-label={tw.chooseImage}
        onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }}
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
              <Plus size={20} weight="bold" /> {t.selectImages}
            </button>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-3)' }}>{t.orDropImagesHere}</p>
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error' || phase === 'loading') && files.length > 0 && (
        <div className="grid md:grid-cols-[320px_1fr] gap-8">
          {/* options */}
          <div className="space-y-6">
            <div>
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="watermark type">
                {(['text', 'image'] as const).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={wmType === k}
                    onClick={() => setWmType(k)}
                    className="rounded-[10px] border px-4 py-2.5 text-sm font-semibold"
                    style={{
                      borderColor: wmType === k ? 'var(--primary)' : 'var(--border)',
                      background: wmType === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: wmType === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tw[k === 'text' ? 'typeText' : 'typeImage']}
                  </button>
                ))}
              </div>
            </div>

            {wmType === 'text' ? (
              <div>
                <label htmlFor="wm-text" className="text-sm font-semibold mb-2 block">{tw.watermarkText}</label>
                <input
                  id="wm-text"
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={tw.watermarkTextPh}
                  maxLength={40}
                  className="w-full rounded-[10px] border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
                />
                <label htmlFor="wm-size" className="text-sm font-semibold mt-4 mb-2 block">
                  {tw.fontSize}: <span style={{ color: 'var(--text-2)' }}>{fontSize} pt</span>
                </label>
                <input
                  id="wm-size"
                  type="range"
                  min={16}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full"
                  style={{ accentColor: 'var(--primary)' }}
                />
              </div>
            ) : (
              <div>
                <button
                  onClick={() => imgInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-semibold"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <ImageIcon size={16} /> {imgFile ? imgFile.name : tw.chooseImage}
                </button>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>{tw.imageHint}</p>
                <label htmlFor="wm-imgscale" className="text-sm font-semibold mt-4 mb-2 block">
                  {tw.imageSize}: <span style={{ color: 'var(--text-2)' }}>{imageScale}%</span>
                </label>
                <input
                  id="wm-imgscale"
                  type="range"
                  min={10}
                  max={100}
                  value={imageScale}
                  onChange={(e) => setImageScale(parseInt(e.target.value, 10))}
                  className="w-full"
                  style={{ accentColor: 'var(--primary)' }}
                />
              </div>
            )}

            <div>
              <label htmlFor="wm-opacity" className="text-sm font-semibold mb-2 block">
                {tw.opacity}: <span style={{ color: 'var(--text-2)' }}>{opacity}%</span>
              </label>
              <input
                id="wm-opacity"
                type="range"
                min={5}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
                className="w-full"
                style={{ accentColor: 'var(--primary)' }}
              />
            </div>

            <div>
              <label htmlFor="wm-rot" className="text-sm font-semibold mb-2 block">
                {tw.rotation}: <span style={{ color: 'var(--text-2)' }}>{rotation}°</span>
              </label>
              <input
                id="wm-rot"
                type="range"
                min={-90}
                max={90}
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                className="w-full"
                style={{ accentColor: 'var(--primary)' }}
              />
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">{tw.position}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tw.position}>
                {(['tiled', 'center'] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={position === k}
                    onClick={() => setPosition(k)}
                    className="rounded-[10px] border px-4 py-2.5 text-sm font-semibold"
                    style={{
                      borderColor: position === k ? 'var(--primary)' : 'var(--border)',
                      background: position === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: position === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tw[k === 'tiled' ? 'posTiled' : 'posCenter']}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* files + preview */}
          <div>
            <div className="mb-4">
              <button
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <Plus size={16} /> {tw.addMore}
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
                    aria-label={fmt(tw.removeFile, { name: f.name })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-sm font-semibold mb-2">{tw.preview}</p>
            {preview ? (
              <div
                className="relative inline-block rounded-xl border overflow-hidden"
                style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)', maxWidth: 300 }}
              >
                <img src={preview.dataUrl} alt={fmt(tw.firstPage, { name: preview.name })} className="block w-full" draggable={false} />
                {renderOverlay()}
              </div>
            ) : (
              <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                {tw.loadingPages}
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
                onClick={doWatermark}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white"
                style={{ background: 'var(--primary)' }}
              >
                {tw.action}
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
