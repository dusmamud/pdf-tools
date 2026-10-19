import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

export interface MergeInput {
  buffer: ArrayBuffer;
  /** per-file rotation to apply to all its pages: 0 | 90 | 180 | 270 */
  rotation?: number;
}

export type ProgressFn = (done: number, total: number, status: string) => void;

/**
 * Merge PDFs in order. Runs inside the Web Worker (see worker.ts).
 * Pure function over ArrayBuffers — also importable in Node for tests.
 */
export async function mergePdfs(inputs: MergeInput[], onProgress?: ProgressFn): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const total = inputs.length;

  for (let i = 0; i < inputs.length; i++) {
    const { buffer, rotation = 0 } = inputs[i];
    onProgress?.(i, total, `Reading file ${i + 1} of ${total}…`);
    const src = await PDFDocument.load(buffer, { ignoreEncryption: false });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) {
      if (rotation) p.setRotation(degrees(rotation));
      out.addPage(p);
    }
    onProgress?.(i + 1, total, `Merged file ${i + 1} of ${total}…`);
    // Let the event loop breathe between files so progress paints.
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.(total, total, 'Saving…');
  return out.save();
}

/** Page counts without full merge — used for file cards. */
export async function getPageCounts(buffers: ArrayBuffer[]): Promise<number[]> {
  const counts: number[] = [];
  for (const b of buffers) {
    const doc = await PDFDocument.load(b);
    counts.push(doc.getPageCount());
  }
  return counts;
}

export interface ParsedRanges {
  pages: number[];
  warnings: string[];
  error?: string;
}

/**
 * Parse "1-3, 5, 8-10" into 0-indexed page indices.
 * Out-of-range pages are clamped with a warning; reversed ranges are an error.
 */
export function parsePageRanges(input: string, pageCount: number): ParsedRanges {
  const warnings: string[] = [];
  const picked = new Set<number>();
  const parts = input
    .replace(/\s*-\s*/g, '-') // tolerate "1 - 3"
    .split(/[,;\s]+/)
    .filter(Boolean);

  if (parts.length === 0) return { pages: [], warnings, error: 'empty' };

  for (const part of parts) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return { pages: [], warnings, error: 'syntax' };
    const a = parseInt(m[1], 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1) return { pages: [], warnings, error: 'syntax' };
    if (b < a) return { pages: [], warnings, error: 'reversed' };
    for (let p = a; p <= b; p++) {
      if (p > pageCount) {
        warnings.push('clamped');
        break;
      }
      picked.add(p - 1);
    }
  }

  const pages = [...picked].sort((x, y) => x - y);
  if (pages.length === 0) return { pages: [], warnings, error: 'empty' };
  return { pages, warnings: [...new Set(warnings)] };
}

/** Extract selected pages into one PDF. */
export async function extractPages(buffer: ArrayBuffer, pages: number[], onProgress?: ProgressFn): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages);
  copied.forEach((p, i) => {
    out.addPage(p);
    onProgress?.(i + 1, pages.length, `Extracting page ${i + 1} of ${pages.length}…`);
  });
  return out.save();
}

/** Split into chunks of n pages each. Returns one PDF per chunk. */
export async function splitByRange(buffer: ArrayBuffer, n: number, onProgress?: ProgressFn): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(buffer);
  const total = src.getPageCount();
  const chunks: Uint8Array[] = [];
  let done = 0;
  for (let start = 0; start < total; start += n) {
    const out = await PDFDocument.create();
    const idx = Array.from({ length: Math.min(n, total - start) }, (_, k) => start + k);
    const copied = await out.copyPages(src, idx);
    copied.forEach((p) => out.addPage(p));
    chunks.push(await out.save());
    done += idx.length;
    onProgress?.(done, total, `Splitting… ${done} of ${total} pages`);
    await new Promise((r) => setTimeout(r, 0));
  }
  return chunks;
}

export interface OrganizePage {
  /** 0-indexed source page */
  index: number;
  /** rotation to apply: 0 | 90 | 180 | 270 */
  rotation: number;
}

/** Rebuild a PDF in the given page order with per-page rotations. */
export async function organizePdf(
  buffer: ArrayBuffer,
  pages: OrganizePage[],
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const out = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const { index, rotation } = pages[i];
    const [copied] = await out.copyPages(src, [index]);
    if (rotation) copied.setRotation(degrees(rotation));
    out.addPage(copied);
    onProgress?.(i + 1, pages.length, `Organizing… ${i + 1}/${pages.length}`);
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
  }
  return out.save({ useObjectStreams: true });
}

export interface PageNumberOpts {
  /** tl|tc|tr = top row, bl|bc|br = bottom row */
  position: 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';
  /** 'n' → "1", 'nTotal' → "1 / 10", 'pageN' → "Page 1" */
  format: 'n' | 'nTotal' | 'pageN';
  start: number;
  fontSize: number;
  margin: number;
}

/**
 * Stamp page numbers on every page. Runs inside the Web Worker.
 * Uses built-in Helvetica (no font embedding cost). Numbers overlay
 * existing content — callers should note this in the UI.
 */
export async function addPageNumbers(
  buffer: ArrayBuffer,
  opts: PageNumberOpts,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const n = pages.length;
  for (let i = 0; i < n; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const num = opts.start + i;
    const text =
      opts.format === 'n' ? `${num}` : opts.format === 'nTotal' ? `${num} / ${n}` : `Page ${num}`;
    const tw = font.widthOfTextAtSize(text, opts.fontSize);
    const m = Math.min(opts.margin, width / 2 - tw / 2 - 2, height / 2 - opts.fontSize);
    const margin = Math.max(m, 2);
    const col = opts.position[1];
    const x = col === 'l' ? margin : col === 'c' ? width / 2 - tw / 2 : width - margin - tw;
    const y = opts.position[0] === 't' ? height - margin - opts.fontSize : margin;
    page.drawText(text, { x, y, size: opts.fontSize, font, color: rgb(0, 0, 0) });
    onProgress?.(i + 1, n, `Numbering… ${i + 1}/${n}`);
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
  }
  return doc.save({ useObjectStreams: true });
}

export interface WatermarkOpts {
  type: 'text' | 'image';
  text: string;
  fontSize: number;
  /** 0..1 */
  opacity: number;
  rotation: number;
  position: 'tiled' | 'center';
  /** image width as fraction of page width (0.1..1) */
  imageScale: number;
}

/**
 * Stamp a text or image watermark over every page. Runs in the Web Worker.
 * Text uses built-in Helvetica; image must be PNG or JPG bytes.
 */
export async function addWatermark(
  buffer: ArrayBuffer,
  opts: WatermarkOpts,
  imageBytes: ArrayBuffer | null,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const pages = doc.getPages();
  const n = pages.length;
  const rot = degrees(opts.rotation);

  let drawOne: (page: import('pdf-lib').PDFPage, w: number, h: number) => void;
  if (opts.type === 'image' && imageBytes) {
    const bytes = new Uint8Array(imageBytes);
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const img = isPng ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
    const iw = img.width;
    const ih = img.height;
    drawOne = (page, w, h) => {
      if (opts.position === 'center') {
        const dw = w * opts.imageScale;
        const dh = (dw * ih) / iw;
        page.drawImage(img, {
          x: w / 2 - dw / 2,
          y: h / 2 - dh / 2,
          width: dw,
          height: dh,
          rotate: rot,
          opacity: opts.opacity,
        });
      } else {
        const dw = Math.min(w * opts.imageScale, w / 3);
        const dh = (dw * ih) / iw;
        const stepX = dw * 1.8;
        const stepY = dh * 2.2;
        for (let y = -dh; y < h + dh; y += stepY) {
          for (let x = -dw; x < w + dw; x += stepX) {
            page.drawImage(img, { x, y, width: dw, height: dh, rotate: rot, opacity: opts.opacity });
          }
        }
      }
    };
  } else {
    const text = opts.text.trim() || 'WATERMARK';
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const size = opts.fontSize;
    const tw = font.widthOfTextAtSize(text, size);
    drawOne = (page, w, h) => {
      const drawOpts = { size, font, rotate: rot, opacity: opts.opacity, color: rgb(0.35, 0.35, 0.35) };
      if (opts.position === 'center') {
        page.drawText(text, { ...drawOpts, x: w / 2 - tw / 2, y: h / 2 - size / 2 });
      } else {
        const stepX = tw * 1.4;
        const stepY = size * 3.2;
        for (let y = -size; y < h + size; y += stepY) {
          for (let x = -tw; x < w + tw; x += stepX) {
            page.drawText(text, { ...drawOpts, x, y });
          }
        }
      }
    };
  }

  for (let i = 0; i < n; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    drawOne(page, width, height);
    onProgress?.(i + 1, n, `Watermarking… ${i + 1}/${n}`);
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
  }
  return doc.save({ useObjectStreams: true });
}

export interface JpgToPdfOpts {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: 'none' | 'small';
}

const A4 = { w: 595.28, h: 841.89 };
const LETTER = { w: 612, h: 792 };

/** Decode any image format the browser supports (WebP etc.) to PNG bytes. Runs in the worker. */
async function decodeToPng(bytes: ArrayBuffer): Promise<{ data: ArrayBuffer; w: number; h: number }> {
  const bmp = await createImageBitmap(new Blob([bytes]));
  // Memory guard: cap longest side at 3000px
  const MAX = 3000;
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const data = await blob.arrayBuffer();
  return { data, w, h };
}

/**
 * Build one PDF page per image. Runs in the Web Worker.
 * JPG/PNG embed directly; anything else (WebP) is decoded to PNG first.
 */
export async function imagesToPdf(
  images: ArrayBuffer[],
  opts: JpgToPdfOpts,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const marginPt = opts.margin === 'small' ? 36 : 0;
  for (let i = 0; i < images.length; i++) {
    const raw = new Uint8Array(images[i]);
    const isJpg = raw[0] === 0xff && raw[1] === 0xd8;
    const isPng = raw[0] === 0x89 && raw[1] === 0x50;
    let imgW: number;
    let imgH: number;
    let embedded: import('pdf-lib').PDFImage;
    if (isJpg) {
      embedded = await doc.embedJpg(images[i]);
      imgW = embedded.width;
      imgH = embedded.height;
    } else if (isPng) {
      embedded = await doc.embedPng(images[i]);
      imgW = embedded.width;
      imgH = embedded.height;
    } else {
      const dec = await decodeToPng(images[i]);
      embedded = await doc.embedPng(dec.data);
      imgW = dec.w;
      imgH = dec.h;
    }

    let pageW: number;
    let pageH: number;
    if (opts.pageSize === 'fit') {
      // 1px = 1pt can make giant pages; cap at 1440pt on the long side
      const cap = 1440 / Math.max(imgW, imgH);
      const s = Math.min(1, cap);
      pageW = imgW * s;
      pageH = imgH * s;
    } else {
      const base = opts.pageSize === 'a4' ? A4 : LETTER;
      const landscape =
        opts.orientation === 'landscape' ||
        (opts.orientation === 'auto' && imgW > imgH);
      pageW = landscape ? Math.max(base.w, base.h) : Math.min(base.w, base.h);
      pageH = landscape ? Math.min(base.w, base.h) : Math.max(base.w, base.h);
    }

    const page = doc.addPage([pageW, pageH]);
    const availW = pageW - marginPt * 2;
    const availH = pageH - marginPt * 2;
    const fit = Math.min(availW / imgW, availH / imgH);
    const dw = imgW * fit;
    const dh = imgH * fit;
    page.drawImage(embedded, {
      x: (pageW - dw) / 2,
      y: (pageH - dh) / 2,
      width: dw,
      height: dh,
    });
    onProgress?.(i + 1, images.length, `Converting… ${i + 1}/${images.length}`);
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  return doc.save({ useObjectStreams: true });
}
