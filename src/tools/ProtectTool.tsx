import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple, Eye, EyeSlash, LockKey, X,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
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

type Phase = 'idle' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 100;
const MAX_FILES = 25;
const RELATED = ['unlock', 'merge', 'compress'];

export default function ProtectTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tp = dict.tools.protect as unknown as Record<string, string>;

  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
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

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (incoming.length === 0) {
      setError(te.badType);
      return;
    }
    if (files.length + incoming.length > MAX_FILES) {
      setError(fmt(tp.tooMany, { n: MAX_FILES }));
      return;
    }
    const total = [...files, ...incoming].reduce((s, f) => s + f.size, 0);
    if (total > MAX_MB * 1024 * 1024) {
      setError(fmt(te.tooBig, { limit: MAX_MB }));
      return;
    }
    setError('');
    setFiles((prev) => [...prev, ...incoming]);
    setPhase('ready');
  }

  function removeFile(idx: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setPhase('idle');
      return next;
    });
  }

  const mismatch = password !== confirm;
  const tooShort = password.length > 0 && password.length < 4;
  const canProtect = files.length > 0 && password.length >= 4 && !mismatch;

  async function doProtect() {
    if (!canProtect) {
      if (mismatch) setError(tp.mismatch);
      else if (password.length < 4) setError(tp.tooShort);
      return;
    }
    setPhase('processing');
    setError('');
    try {
      const out: DoneFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const buf = await f.arrayBuffer();
        const { blob, name } = await engineRef.current!.protect(
          buf,
          password,
          password,
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
    setPassword('');
    setConfirm('');
    setError('');
    setPhase('idle');
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  /* ---------- DONE ---------- */
  if (phase === 'done') {
    return (
      <div className="max-w-2xl mx-auto text-center px-4">
        <CheckCircle size={64} weight="fill" style={{ color: 'var(--success)' }} className="mx-auto" />
        <h2 className="mt-4 text-2xl font-bold">{tp.action}</h2>
        <div className="mt-6 space-y-3 text-start">
          {results.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-3 rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
              >
                <LockKey size={20} />
              </span>
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
    <div className="max-w-2xl mx-auto px-4">
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
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error') && files.length > 0 && (
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="mb-4">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <Plus size={16} /> {tp.addMore}
            </button>
          </div>

          <div className="space-y-2 mb-6">
            {files.map((f, i) => (
              <div
                key={f.name + i}
                className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
                style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)' }}
              >
                <LockKey size={18} style={{ color: 'var(--text-3)' }} className="shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">{f.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {(f.size / 1048576).toFixed(1)} MB
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0"
                  style={{ background: 'var(--surface)', color: 'var(--text-3)' }}
                  aria-label={fmt(tp.removeFile, { name: f.name })}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <label htmlFor="protect-pw" className="mb-2 block text-sm font-semibold">
            {tp.passwordLabel}
          </label>
          <div className="relative">
            <input
              id="protect-pw"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tp.passwordPh}
              autoComplete="new-password"
              className="w-full rounded-[10px] border px-4 py-3 text-[15px] pe-12"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-1)' }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-3)' }}
              aria-label={showPw ? tp.hidePassword : tp.showPassword}
            >
              {showPw ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <label htmlFor="protect-pw2" className="mt-4 mb-2 block text-sm font-semibold">
            {tp.confirmLabel}
          </label>
          <input
            id="protect-pw2"
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doProtect(); }}
            autoComplete="new-password"
            className="w-full rounded-[10px] border px-4 py-3 text-[15px]"
            style={{
              borderColor: mismatch && confirm ? 'var(--danger)' : 'var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-1)',
            }}
          />
          {mismatch && confirm && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{tp.mismatch}</p>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
              {error}
            </div>
          )}

          <button
            onClick={doProtect}
            disabled={phase === 'processing'}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {phase === 'processing' ? `${pct}%` : tp.action}
          </button>
          <p className="mt-3 text-xs text-center" style={{ color: 'var(--text-3)' }}>
            {tp.localNote}
          </p>
        </div>
      )}

      {phase === 'processing' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="dialog" aria-modal="true" aria-label={t.processing}>
          <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: 'var(--surface)' }}>
            <div className="mx-auto w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} aria-hidden="true" />
            <p className="mt-4 font-semibold">{progress.status || t.processing}</p>
          </div>
        </div>
      )}
    </div>
  );
}
