import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple, X,
  ArrowLeft, ArrowRight,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import type { JpgToPdfOpts } from '../engine/pdf';
import { fmt, type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

interface ImgItem {
  file: File;
  url: string;
}

interface DoneFile {
  url: string;
  name: string;
  size: number;
  pages: number;
}

type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 40;
const MAX_FILES = 25;
const RELATED = ['pdfToJpg', 'merge', 'compress'];

export default function JpgToPdfTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tj = dict.tools.jpgToPdf as unknown as Record<string, string>;

  const [imgs, setImgs] = useState<ImgItem[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState<DoneFile | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const [pageSize, setPageSize] = useState<JpgToPdfOpts['pageSize']>('fit');
  const [orientation, setOrientation] = useState<JpgToPdfOpts['orientation']>('auto');
  const [margin, setMargin] = useState<JpgToPdfOpts['margin']>('none');

  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    engineRef.current = new EngineClient();
    return () => {
      engineRef.current?.terminate();
      imgs.forEach((im) => URL.revokeObjectURL(im.url));
      if (result) URL.revokeObjectURL(result.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) =>
      /^(image\/(jpeg|png|webp))$/i.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name),
    );
    if (incoming.length === 0) {
      setError(tj.badType);
      return;
    }
    if (imgs.length + incoming.length > MAX_FILES) {
      setError(fmt(tj.tooMany, { n: MAX_FILES }));
      return;
    }
    const total = [...imgs.map((i) => i.file), ...incoming].reduce((s, f) => s + f.size, 0);
    if (total > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      return;
    }
    setError('');
    setImgs((prev) => [...prev, ...incoming.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setPhase('ready');
  }

  function removeImg(idx: number) {
    setImgs((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      URL.revokeObjectURL(prev[idx].url);
      if (next.length === 0) setPhase('idle');
      return next;
    });
  }

  function moveImg(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    setImgs((prev) => {
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
    setImgs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDropIdx(null);
  }

  async function doConvert() {
    if (imgs.length === 0) return;
    setPhase('processing');
    setError('');
    try {
      const buffers: ArrayBuffer[] = [];
      for (const im of imgs) buffers.push(await im.file.arrayBuffer());
      const { blob, name } = await engineRef.current!.jpgToPdf(
        buffers,
        { pageSize, orientation, margin },
        imgs[0].file.name,
        (done, total, status) => setProgress({ done, total, status }),
      );
      setResult({ url: URL.createObjectURL(blob), name, size: blob.size, pages: imgs.length });
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : te.generic);
      setPhase('error');
    }
  }

  function startOver() {
    if (result) URL.revokeObjectURL(result.url);
    imgs.forEach((im) => URL.revokeObjectURL(im.url));
    setResult(null);
    setImgs([]);
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
          {(result.size / 1048576).toFixed(1)} MB · {fmt(t.pages, { n: result.pages })}
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
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        aria-label={t.selectImages}
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
              <Plus size={20} weight="bold" /> {t.selectImages}
            </button>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-3)' }}>{t.orDropImagesHere}</p>
          </div>
        </div>
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error') && imgs.length > 0 && (
        <div className="grid md:grid-cols-[280px_1fr] gap-8">
          {/* options */}
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold mb-2">{tj.pageSize}</p>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tj.pageSize}>
                {(['fit', 'a4', 'letter'] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={pageSize === k}
                    onClick={() => setPageSize(k)}
                    className="rounded-[10px] border px-2 py-2.5 text-xs font-semibold"
                    style={{
                      borderColor: pageSize === k ? 'var(--primary)' : 'var(--border)',
                      background: pageSize === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: pageSize === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tj[k === 'fit' ? 'sizeFit' : k === 'a4' ? 'sizeA4' : 'sizeLetter']}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">{tj.orientation}</p>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tj.orientation}>
                {(['auto', 'portrait', 'landscape'] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={orientation === k}
                    onClick={() => setOrientation(k)}
                    className="rounded-[10px] border px-2 py-2.5 text-xs font-semibold"
                    style={{
                      borderColor: orientation === k ? 'var(--primary)' : 'var(--border)',
                      background: orientation === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: orientation === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tj[k === 'auto' ? 'orientAuto' : k === 'portrait' ? 'orientPortrait' : 'orientLandscape']}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">{tj.margin}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tj.margin}>
                {(['none', 'small'] as const).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={margin === k}
                    onClick={() => setMargin(k)}
                    className="rounded-[10px] border px-2 py-2.5 text-xs font-semibold"
                    style={{
                      borderColor: margin === k ? 'var(--primary)' : 'var(--border)',
                      background: margin === k ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface)',
                      color: margin === k ? 'var(--primary)' : 'var(--text-1)',
                    }}
                  >
                    {tj[k === 'none' ? 'marginNone' : 'marginSmall']}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* images */}
          <div>
            <div className="mb-4">
              <button
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <Plus size={16} /> {tj.addMore}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" role="list" aria-label={tj.h1}>
              {imgs.map((im, i) => (
                <div
                  key={im.url}
                  role="listitem"
                  draggable
                  tabIndex={0}
                  aria-label={fmt(tj.imageBadge, { n: i + 1 })}
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDropIdx(i); }}
                  onDrop={() => onDropCard(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') { e.preventDefault(); moveImg(i, -1); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); moveImg(i, 1); }
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
                    style={{ aspectRatio: '4/3', background: 'var(--bg-soft)' }}
                  >
                    <img src={im.url} alt="" loading="lazy" draggable={false} className="max-w-full max-h-full object-contain pointer-events-none" />
                  </div>
                  <span
                    className="absolute top-3 start-3 text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                  >
                    {i + 1}
                  </span>
                  <div className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveImg(i, -1)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                      aria-label={fmt(tj.moveLeft, { n: i + 1 })}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      onClick={() => moveImg(i, 1)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                      aria-label={fmt(tj.moveRight, { n: i + 1 })}
                    >
                      <ArrowRight size={15} />
                    </button>
                    <button
                      onClick={() => removeImg(i)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                      aria-label={fmt(tj.removeImage, { name: im.file.name })}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[17px] font-semibold text-white"
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
