/**
 * PDF.js rendering helpers. Runs inside the engine Web Worker.
 * Used for page thumbnails (Organize) and later PDF->JPG export.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ProgressFn } from './pdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ThumbResult {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

/**
 * Render low-res JPEG thumbnails for every page, one at a time
 * (page is released before the next renders — memory guard).
 */
export async function renderThumbs(buffer: ArrayBuffer, onProgress?: ProgressFn): Promise<ThumbResult[]> {
  const data = new Uint8Array(buffer.slice(0));
  const loadingTask = pdfjsLib.getDocument({ data, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const thumbs: ThumbResult[] = [];
  try {
    const n = doc.numPages;
    const scale = n > 300 ? 0.22 : 0.4;
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      try {
        const viewport = page.getViewport({ scale });
        const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        const ctx = canvas.getContext('2d')!;
        // white background so transparent PDFs don't thumbnail as black
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
        thumbs.push({ index: i - 1, dataUrl: await blobToDataUrl(blob), width: viewport.width, height: viewport.height });
      } finally {
        page.cleanup();
      }
      onProgress?.(i, n, `Loading pages… ${i}/${n}`);
      // yield so progress paints and long docs stay responsive
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    await loadingTask.destroy();
  }
  return thumbs;
}

export interface PageImageOpts {
  /** 'jpg' | 'png' */
  format: 'jpg' | 'png';
  /** 0..1, JPG only */
  quality: number;
  /** 1 = ~96dpi, 2 = ~192dpi */
  scale: 1 | 2;
  /** 0-based page indices to render */
  pages: number[];
}

export interface PageImageResult {
  index: number;
  buffer: ArrayBuffer;
}

/**
 * Render selected pages to full images, one at a time
 * (each page is released before the next renders — memory guard).
 */
export async function renderPageImages(
  buffer: ArrayBuffer,
  opts: PageImageOpts,
  onProgress?: ProgressFn,
): Promise<PageImageResult[]> {
  const data = new Uint8Array(buffer.slice(0));
  const loadingTask = pdfjsLib.getDocument({ data, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const out: PageImageResult[] = [];
  try {
    const total = opts.pages.length;
    for (let k = 0; k < total; k++) {
      const pageNum = opts.pages[k] + 1;
      const page = await doc.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale: opts.scale });
        const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob =
          opts.format === 'jpg'
            ? await canvas.convertToBlob({ type: 'image/jpeg', quality: opts.quality })
            : await canvas.convertToBlob({ type: 'image/png' });
        const ab = await blob.arrayBuffer();
        out.push({ index: opts.pages[k], buffer: ab });
      } finally {
        page.cleanup();
      }
      onProgress?.(k + 1, total, `Rendering page ${k + 1} of ${total}…`);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    await loadingTask.destroy();
  }
  return out;
}
