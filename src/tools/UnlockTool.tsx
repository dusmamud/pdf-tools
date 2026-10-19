import { useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle, DownloadSimple, Eye, EyeSlash, LockKeyOpen,
} from '@phosphor-icons/react';
import { EngineClient } from '../engine/client';
import { type Dict } from '../i18n';
import { toolUrl } from '../i18n/urls';
import { toolByKey } from '../tools';

interface Props {
  locale: string;
  dict: Dict;
}

type Phase = 'idle' | 'ready' | 'processing' | 'done' | 'error';

const MAX_MB = 100;
const RELATED = ['protect', 'merge', 'compress'];

export default function UnlockTool({ locale, dict }: Props) {
  const t = dict.workspace;
  const te = dict.errors;
  const tu = dict.tools.unlock as unknown as Record<string, string>;

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, status: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const doneLinkRef = useRef<HTMLAnchorElement>(null);
  const engineRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    engineRef.current = new EngineClient();
    return () => {
      engineRef.current?.terminate();
      if (result) URL.revokeObjectURL(result.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-download on success (the link stays as a fallback)
  useEffect(() => {
    if (phase === 'done' && doneLinkRef.current) doneLinkRef.current.click();
  }, [phase]);

  function addFile(f: File) {
    if (!(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
      setError(te.badType);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(tu.tooBig ?? te.tooBig);
      return;
    }
    setError('');
    setFile(f);
    setResult(null);
    setPhase('ready');
  }

  async function doUnlock() {
    if (!file || !password) return;
    setPhase('processing');
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const { blob, name } = await engineRef.current!.unlock(
        buf,
        password,
        file.name,
        (done, total, status) => setProgress({ done, total, status }),
      );
      setResult({ url: URL.createObjectURL(blob), name, size: blob.size });
      setPhase('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg === 'WRONG_PASSWORD' ? tu.wrongPassword : te.generic);
      // keep the file so the user can retry with another password
      setPhase('ready');
    }
  }

  function startOver() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setFile(null);
    setPassword('');
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
          {(result.size / 1048576).toFixed(1)} MB
        </p>
        <a
          ref={doneLinkRef}
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
    <div className="max-w-2xl mx-auto px-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        aria-label={t.selectFiles}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ''; }}
      />

      {phase === 'idle' && (
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
      )}

      {(phase === 'ready' || phase === 'processing' || phase === 'error') && file && (
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
            >
              <LockKeyOpen size={22} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{file.name}</p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                {(file.size / 1048576).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={startOver}
              className="ms-auto text-sm font-medium underline shrink-0"
              style={{ color: 'var(--text-3)' }}
            >
              {t.startOver}
            </button>
          </div>

          <label htmlFor="unlock-pw" className="mt-6 mb-2 block text-sm font-semibold">
            {tu.passwordLabel}
          </label>
          <div className="relative">
            <input
              id="unlock-pw"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void doUnlock(); }}
              placeholder={tu.passwordPh}
              autoComplete="off"
              className="w-full rounded-[10px] border px-4 py-3 text-[15px] pe-12"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-1)' }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-3)' }}
              aria-label={showPw ? tu.hidePassword : tu.showPassword}
            >
              {showPw ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}>
              {error}
            </div>
          )}

          <button
            onClick={doUnlock}
            disabled={!password || phase === 'processing'}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {phase === 'processing' ? `${pct}%` : tu.action}
          </button>
          <p className="mt-3 text-xs text-center" style={{ color: 'var(--text-3)' }}>
            {tu.localNote}
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
