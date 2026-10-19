/** Web Worker: all heavy PDF work runs here, never on the UI thread. */
import { mergePdfs, getPageCounts, extractPages, splitByRange, organizePdf, addPageNumbers, addWatermark, imagesToPdf, type OrganizePage, type PageNumberOpts, type WatermarkOpts, type JpgToPdfOpts } from './pdf';
import { compressPdf, type CompressPresetKey, type CompressStats } from './compress';
import { renderThumbs, renderPageImages, type ThumbResult, type PageImageOpts } from './render';
import { inspectPdf, unlockPdf, protectPdf } from './qpdf';

export type WorkerRequest =
  | { id: string; tool: 'merge'; inputs: { buffer: ArrayBuffer; rotation: number; name: string }[] }
  | { id: string; tool: 'probe'; buffers: ArrayBuffer[] }
  | { id: string; tool: 'split'; buffer: ArrayBuffer; mode: 'extract' | 'range'; pages: number[]; every: number; baseName: string }
  | { id: string; tool: 'compress'; buffer: ArrayBuffer; preset: CompressPresetKey; baseName: string }
  | { id: string; tool: 'thumbs'; buffer: ArrayBuffer }
  | { id: string; tool: 'organize'; buffer: ArrayBuffer; pages: OrganizePage[]; baseName: string }
  | { id: string; tool: 'pageNumbers'; buffer: ArrayBuffer; opts: PageNumberOpts; baseName: string }
  | { id: string; tool: 'watermark'; buffer: ArrayBuffer; opts: WatermarkOpts; image: ArrayBuffer | null; baseName: string }
  | { id: string; tool: 'jpgToPdf'; images: ArrayBuffer[]; opts: JpgToPdfOpts; baseName: string }
  | { id: string; tool: 'pdfToJpg'; buffer: ArrayBuffer; opts: PageImageOpts; baseName: string }
  | { id: string; tool: 'unlock'; buffer: ArrayBuffer; password: string; baseName: string }
  | { id: string; tool: 'protect'; buffer: ArrayBuffer; userPassword: string; ownerPassword: string; baseName: string };

export type SplitResult = { buffer: ArrayBuffer; name: string };

export type WorkerResponse =
  | { id: string; type: 'progress'; done: number; total: number; status: string }
  | { id: string; type: 'probe-result'; counts: number[] }
  | { id: string; type: 'thumbs-result'; thumbs: ThumbResult[] }
  | { id: string; type: 'done'; result: ArrayBuffer; name: string }
  | { id: string; type: 'split-done'; results: SplitResult[] }
  | { id: string; type: 'compress-done'; result: ArrayBuffer; name: string; stats: CompressStats }
  | { id: string; type: 'error'; error: string; detail?: string };

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(msg, transfer ?? []);
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/encrypted|password/i.test(msg)) return 'One of the PDFs is password-protected. Unlock it first.';
  if (/Invalid PDF/i.test(msg)) return 'One of the files is not a valid PDF.';
  return 'Processing failed. Please try again with different files.';
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.tool === 'probe') {
      const counts = await getPageCounts(req.buffers);
      post({ id: req.id, type: 'probe-result', counts });
      return;
    }
    if (req.tool === 'merge') {
      const bytes = await mergePdfs(
        req.inputs.map((i) => ({ buffer: i.buffer, rotation: i.rotation })),
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const first = req.inputs[0]?.name.replace(/\.pdf$/i, '') ?? 'document';
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${first}_merged.pdf` }, [out]);
      return;
    }
    if (req.tool === 'split') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      const prog = (done: number, total: number, status: string) =>
        post({ id: req.id, type: 'progress', done, total, status });
      if (req.mode === 'extract') {
        const bytes = await extractPages(req.buffer, req.pages, prog);
        const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        post({ id: req.id, type: 'split-done', results: [{ buffer: out, name: `${base}_extracted.pdf` }] }, [out]);
      } else {
        const chunks = await splitByRange(req.buffer, req.every, prog);
        const results = chunks.map((c, i) => {
          const out = c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer;
          return { buffer: out, name: `${base}_part${i + 1}.pdf` };
        });
        post({ id: req.id, type: 'split-done', results }, results.map((r) => r.buffer));
      }
      return;
    }
    if (req.tool === 'compress') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      const { bytes, stats } = await compressPdf(
        req.buffer,
        req.preset,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post(
        { id: req.id, type: 'compress-done', result: out, name: `${base}_compressed.pdf`, stats },
        [out],
      );
      return;
    }
    if (req.tool === 'thumbs') {
      const thumbs = await renderThumbs(
        req.buffer,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      post({ id: req.id, type: 'thumbs-result', thumbs });
      return;
    }
    if (req.tool === 'pdfToJpg') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      const ext = req.opts.format === 'jpg' ? 'jpg' : 'png';
      const rendered = await renderPageImages(
        req.buffer,
        req.opts,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const results = rendered.map((r) => ({
        buffer: r.buffer,
        name: `${base}_page-${r.index + 1}.${ext}`,
      }));
      const transfer = results.map((r) => r.buffer);
      post({ id: req.id, type: 'split-done', results }, transfer);
      return;
    }
    if (req.tool === 'unlock') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      post({ id: req.id, type: 'progress', done: 0, total: 1, status: 'Unlocking…' });
      let bytes: Uint8Array;
      try {
        bytes = await unlockPdf(req.buffer, req.password);
      } catch (e) {
        if (e instanceof Error && e.message === 'WRONG_PASSWORD') {
          post({ id: req.id, type: 'error', error: 'WRONG_PASSWORD' });
          return;
        }
        throw e;
      }
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${base}_unlocked.pdf` }, [out]);
      return;
    }
    if (req.tool === 'protect') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      post({ id: req.id, type: 'progress', done: 0, total: 1, status: 'Protecting…' });
      const bytes = await protectPdf(req.buffer, req.userPassword, req.ownerPassword);
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${base}_protected.pdf` }, [out]);
      return;
    }
    if (req.tool === 'organize') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      const bytes = await organizePdf(
        req.buffer,
        req.pages,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${base}_organized.pdf` }, [out]);
      return;
    }
    if (req.tool === 'pageNumbers') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      const bytes = await addPageNumbers(
        req.buffer,
        req.opts,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${base}_numbered.pdf` }, [out]);
      return;
    }
    if (req.tool === 'watermark') {
      const base = req.baseName.replace(/\.pdf$/i, '');
      const bytes = await addWatermark(
        req.buffer,
        req.opts,
        req.image,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${base}_watermarked.pdf` }, [out]);
      return;
    }
    if (req.tool === 'jpgToPdf') {
      const base = req.baseName.replace(/\.(jpe?g|png|webp)$/i, '');
      const bytes = await imagesToPdf(
        req.images,
        req.opts,
        (done, total, status) => post({ id: req.id, type: 'progress', done, total, status }),
      );
      const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      post({ id: req.id, type: 'done', result: out, name: `${base}_converted.pdf` }, [out]);
      return;
    }
  } catch (e) {
    const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    post({ id: req.id, type: 'error', error: friendlyError(e), detail: raw.slice(0, 500) });
  }
};
