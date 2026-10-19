/**
 * PDF compressor: re-encodes embedded raster images at lower quality/size,
 * then re-saves with object streams. Runs inside the Web Worker.
 *
 * Handles: DCTDecode (JPEG) via createImageBitmap, FlateDecode 8-bit
 * DeviceRGB/DeviceGray (no PNG predictor) via DecompressionStream.
 * Everything else is left untouched.
 */
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef, PDFBool } from 'pdf-lib';
import type { ProgressFn } from './pdf';

export type CompressPresetKey = 'extreme' | 'recommended' | 'less';

export interface CompressPreset {
  quality: number;
  /** images wider than this are downscaled */
  maxWidth: number;
}

export const COMPRESS_PRESETS: Record<CompressPresetKey, CompressPreset> = {
  extreme: { quality: 0.4, maxWidth: 1000 },
  recommended: { quality: 0.65, maxWidth: 1500 },
  less: { quality: 0.85, maxWidth: 2000 },
};

export interface CompressStats {
  original: number;
  compressed: number;
  imagesProcessed: number;
  imagesSkipped: number;
  /** true when output was NOT smaller — caller should keep the original */
  notSmaller: boolean;
}

interface FoundImage {
  ref: PDFRef;
  stream: PDFRawStream;
}

function lookupDict(context: any, obj: any): PDFDict | undefined {
  const v = obj instanceof PDFRef ? context.lookup(obj) : obj;
  return v instanceof PDFDict ? v : undefined;
}

function isImageDict(dict: PDFDict): boolean {
  const sub = dict.get(PDFName.of('Subtype'));
  return sub === PDFName.of('Image');
}

function firstFilter(dict: PDFDict): string | undefined {
  const f = dict.get(PDFName.of('Filter'));
  if (!f) return undefined;
  const name = Array.isArray(f) ? f[0] : f;
  // pdf-lib may give PDFName or PDFArray
  if (name === PDFName.of('DCTDecode')) return 'DCTDecode';
  if (name === PDFName.of('FlateDecode')) return 'FlateDecode';
  const s = String(name);
  if (s.includes('DCTDecode')) return 'DCTDecode';
  if (s.includes('FlateDecode')) return 'FlateDecode';
  return s;
}

/** Walk page resources (recursing into Form XObjects) collecting unique image streams. */
function collectImages(pdf: PDFDocument): FoundImage[] {
  const context = (pdf as any).context;
  const seen = new Set<string>();
  const out: FoundImage[] = [];

  function walkResources(resDict: PDFDict | undefined) {
    if (!resDict) return;
    const xo = lookupDict(context, resDict.get(PDFName.of('XObject')));
    if (!xo) return;
    for (const [, val] of (xo as PDFDict).entries()) {
      const ref = val instanceof PDFRef ? val : undefined;
      const obj = ref ? context.lookup(ref) : val;
      if (obj instanceof PDFRawStream) {
        if (isImageDict(obj.dict)) {
          const key = ref ? `${ref.objectNumber} ${ref.generationNumber}` : `inline-${out.length}`;
          if (!seen.has(key)) {
            seen.add(key);
            if (ref) out.push({ ref, stream: obj });
          }
        } else {
          // Recurse into Form XObjects
          const sub = obj.dict.get(PDFName.of('Subtype'));
          if (sub === PDFName.of('Form')) {
            walkResources(lookupDict(context, obj.dict.get(PDFName.of('Resources'))));
          }
        }
      }
    }
  }

  for (const page of pdf.getPages()) {
    walkResources(lookupDict(context, (page.node as any).get(PDFName.of('Resources'))));
  }
  return out;
}

async function decodeToBitmap(stream: PDFRawStream, filter: string | undefined): Promise<ImageBitmap | null> {
  const raw = stream.getContents();
  try {
    if (filter === 'DCTDecode') {
      const blob = new Blob([raw as unknown as BlobPart], { type: 'image/jpeg' });
      return await createImageBitmap(blob);
    }
    if (filter === 'FlateDecode') {
      const dict = stream.dict;
      const w = (dict.get(PDFName.of('Width')) as any)?.asNumber?.() ?? Number(dict.get(PDFName.of('Width')));
      const h = (dict.get(PDFName.of('Height')) as any)?.asNumber?.() ?? Number(dict.get(PDFName.of('Height')));
      const bpc = Number(dict.get(PDFName.of('BitsPerComponent')) ?? 8);
      const cs = dict.get(PDFName.of('ColorSpace'));
      const csName = cs === PDFName.of('DeviceRGB') ? 'rgb' : cs === PDFName.of('DeviceGray') ? 'gray' : null;
      const predictor = Number(dict.get(PDFName.of('Predictor')) ?? 1);
      if (!w || !h || bpc !== 8 || !csName || predictor !== 1) return null;
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(raw as unknown as Uint8Array);
      writer.close();
      const inflated = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      const channels = csName === 'rgb' ? 3 : 1;
      if (inflated.length < w * h * channels) return null;
      const img = new ImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        if (csName === 'rgb') {
          img.data[i * 4] = inflated[i * 3];
          img.data[i * 4 + 1] = inflated[i * 3 + 1];
          img.data[i * 4 + 2] = inflated[i * 3 + 2];
        } else {
          const g = inflated[i];
          img.data[i * 4] = g; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = g;
        }
        img.data[i * 4 + 3] = 255;
      }
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.putImageData(img, 0, 0);
      return await createImageBitmap(canvas);
    }
  } catch {
    return null;
  }
  return null;
}

export async function compressPdf(
  buffer: ArrayBuffer,
  presetKey: CompressPresetKey,
  onProgress?: ProgressFn,
): Promise<{ bytes: Uint8Array; stats: CompressStats }> {
  const preset = COMPRESS_PRESETS[presetKey];
  const original = buffer.byteLength;
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const context = (pdf as any).context;

  const images = collectImages(pdf);
  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < images.length; i++) {
    const { ref, stream } = images[i];
    onProgress?.(i, images.length, `Compressing image ${i + 1} of ${images.length}…`);
    try {
      const dict = stream.dict;
      const w = Number(dict.get(PDFName.of('Width')));
      const h = Number(dict.get(PDFName.of('Height')));
      const isMask = dict.get(PDFName.of('ImageMask')) === PDFBool.True;
      if (!w || !h || isMask || w < 48 || h < 48) { skipped++; continue; }

      const bitmap = await decodeToBitmap(stream, firstFilter(dict));
      if (!bitmap) { skipped++; continue; }

      const scale = w > preset.maxWidth ? preset.maxWidth / w : 1;
      const cw = Math.max(1, Math.round(bitmap.width * scale));
      const ch = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(cw, ch);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, cw, ch);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: preset.quality });
      const jpeg = new Uint8Array(await blob.arrayBuffer());

      const newStream = context.stream(jpeg, {
        [PDFName.of('Filter')]: PDFName.of('DCTDecode'),
        [PDFName.of('Width')]: cw,
        [PDFName.of('Height')]: ch,
        [PDFName.of('ColorSpace')]: PDFName.of('DeviceRGB'),
        [PDFName.of('BitsPerComponent')]: 8,
      });
      // Drop old decode params that belonged to the previous filter
      newStream.dict.delete(PDFName.of('DecodeParms'));
      context.assign(ref, newStream);
      processed++;
    } catch {
      skipped++;
    }
    // Keep the worker responsive between images
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.(images.length, images.length, 'Saving…');
  const bytes = await pdf.save({ useObjectStreams: true });
  const notSmaller = bytes.byteLength >= original;
  return {
    bytes: notSmaller ? new Uint8Array(buffer) : bytes,
    stats: {
      original,
      compressed: notSmaller ? original : bytes.byteLength,
      imagesProcessed: processed,
      imagesSkipped: skipped,
      notSmaller,
    },
  };
}
