/** UI-thread client for the engine worker. One instance per tool session. */
import type { WorkerRequest, WorkerResponse } from './worker';

export interface MergeFile {
  buffer: ArrayBuffer;
  rotation: number;
  name: string;
}

let seq = 0;
const nid = () => `job-${Date.now()}-${seq++}`;

export class EngineClient {
  private worker: Worker;
  private pending = new Map<string, (msg: WorkerResponse) => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const cb = this.pending.get(ev.data.id);
      if (cb) cb(ev.data);
    };
    this.worker.onerror = () => {
      for (const cb of this.pending.values()) {
        cb({ id: '', type: 'error', error: 'Processing crashed. Please try again with smaller files.' } as WorkerResponse);
      }
      this.pending.clear();
    };
  }

  private send<T extends WorkerResponse>(req: WorkerRequest, transfer: Transferable[], onMsg: (m: T) => void): void {
    this.pending.set(req.id, onMsg as (m: WorkerResponse) => void);
    this.worker.postMessage(req, transfer);
  }

  /** Returns page counts in file order. */
  probe(buffers: ArrayBuffer[]): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const id = nid();
      const copies = buffers.map((b) => b.slice(0));
      this.send<WorkerResponse>(
        { id, tool: 'probe', buffers: copies },
        copies,
        (m) => {
          this.pending.delete(id);
          if (m.type === 'probe-result') resolve(m.counts);
          else reject(new Error(m.type === 'error' ? m.error : 'Probe failed'));
        },
      );
    });
  }

  merge(files: MergeFile[], onProgress: (done: number, total: number, status: string) => void): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'merge', inputs: files.map((f) => ({ buffer: f.buffer, rotation: f.rotation, name: f.name })) },
        files.map((f) => f.buffer),
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Split: extract mode returns 1 file, range mode returns N files. */
  split(
    buffer: ArrayBuffer,
    opts: { mode: 'extract' | 'range'; pages: number[]; every: number; baseName: string },
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }[]> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'split', buffer, mode: opts.mode, pages: opts.pages, every: opts.every, baseName: opts.baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'split-done') {
            this.pending.delete(id);
            resolve(m.results.map((r) => ({ blob: new Blob([r.buffer], { type: 'application/pdf' }), name: r.name })));
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Compress one file with a preset. */
  compress(
    buffer: ArrayBuffer,
    preset: 'extreme' | 'recommended' | 'less',
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string; stats: import('./worker').CompressStats }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'compress', buffer, preset, baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'compress-done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name, stats: m.stats });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Render page thumbnails (dataURLs) with progress. */
  thumbs(
    buffer: ArrayBuffer,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<import('./worker').ThumbResult[]> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'thumbs', buffer },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'thumbs-result') {
            this.pending.delete(id);
            resolve(m.thumbs);
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Organize pages: final order + per-page rotations. */
  organize(
    buffer: ArrayBuffer,
    pages: { index: number; rotation: number }[],
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'organize', buffer, pages, baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  terminate() {
    this.pending.clear();
    this.worker.terminate();
  }

  /** Stamp page numbers on every page. */
  pageNumbers(
    buffer: ArrayBuffer,
    opts: import('./pdf').PageNumberOpts,
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'pageNumbers', buffer, opts, baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Stamp a text or image watermark over every page. */
  watermark(
    buffer: ArrayBuffer,
    opts: import('./pdf').WatermarkOpts,
    image: ArrayBuffer | null,
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'watermark', buffer, opts, image, baseName },
        image ? [buffer, image] : [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Convert images to a single PDF, one page per image. */
  jpgToPdf(
    images: ArrayBuffer[],
    opts: import('./pdf').JpgToPdfOpts,
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'jpgToPdf', images, opts, baseName },
        images,
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Render PDF pages to JPG/PNG images, one file per page. */
  pdfToJpg(
    buffer: ArrayBuffer,
    opts: import('./render').PageImageOpts,
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ files: { blob: Blob; name: string }[] }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'pdfToJpg', buffer, opts, baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'split-done') {
            this.pending.delete(id);
            resolve({
              files: m.results.map((r) => ({
                blob: new Blob([r.buffer], {
                  type: opts.format === 'jpg' ? 'image/jpeg' : 'image/png',
                }),
                name: r.name,
              })),
            });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Remove password protection. Rejects with Error('WRONG_PASSWORD') on a bad password. */
  unlock(
    buffer: ArrayBuffer,
    password: string,
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'unlock', buffer, password, baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }

  /** Add AES-256 password protection. */
  protect(
    buffer: ArrayBuffer,
    userPassword: string,
    ownerPassword: string,
    baseName: string,
    onProgress: (done: number, total: number, status: string) => void,
  ): Promise<{ blob: Blob; name: string }> {
    return new Promise((resolve, reject) => {
      const id = nid();
      this.send<WorkerResponse>(
        { id, tool: 'protect', buffer, userPassword, ownerPassword, baseName },
        [buffer],
        (m) => {
          if (m.type === 'progress') onProgress(m.done, m.total, m.status);
          else if (m.type === 'done') {
            this.pending.delete(id);
            resolve({ blob: new Blob([m.result], { type: 'application/pdf' }), name: m.name });
          } else if (m.type === 'error') {
            this.pending.delete(id);
            reject(new Error(m.error));
          }
        },
      );
    });
  }
}
