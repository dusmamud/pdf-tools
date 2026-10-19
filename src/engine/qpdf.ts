/**
 * qpdf-wasm helpers for Unlock / Protect. Runs inside the engine Web Worker.
 * Single-threaded WASM build — no COOP/COEP headers needed.
 */
import { configure, encrypt, decrypt, inspect, QpdfError } from '@arshad-shah/qpdf-wasm';
import qpdfWasmUrl from '@arshad-shah/qpdf-wasm/qpdf.wasm?url';

let configured = false;

function ensureWasm(): void {
  if (!configured) {
    configure({ wasmUrl: qpdfWasmUrl });
    configured = true;
  }
}

export interface PdfInspection {
  encrypted: boolean;
  needsPassword: boolean;
  pageCount: number | null;
}

/** Inspect without needing the password (pageCount is null when a password is required). */
export async function inspectPdf(buffer: ArrayBuffer): Promise<PdfInspection> {
  ensureWasm();
  const r = await inspect(new Uint8Array(buffer));
  return { encrypted: r.encrypted, needsPassword: r.needsPassword, pageCount: r.pageCount };
}

/** Remove password protection. Throws Error('WRONG_PASSWORD') on a bad password. */
export async function unlockPdf(buffer: ArrayBuffer, password: string): Promise<Uint8Array> {
  ensureWasm();
  try {
    const r = await decrypt(new Uint8Array(buffer), password);
    return r.bytes;
  } catch (e) {
    if (e instanceof QpdfError && e.code === 'WRONG_PASSWORD') {
      throw new Error('WRONG_PASSWORD');
    }
    throw e;
  }
}

/** Add password protection (AES-256). */
export async function protectPdf(
  buffer: ArrayBuffer,
  userPassword: string,
  ownerPassword: string,
): Promise<Uint8Array> {
  ensureWasm();
  const r = await encrypt(new Uint8Array(buffer), {
    userPassword,
    ownerPassword,
  });
  return r.bytes;
}
