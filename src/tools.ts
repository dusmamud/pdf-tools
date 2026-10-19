export type ToolCategory = 'organize' | 'optimize' | 'convert' | 'edit' | 'security';
export type ToolEngine = 'pdf-lib' | 'pdfjs' | 'qpdf-wasm' | 'hybrid';

export interface ToolDef {
  key: string;
  slug: string;
  category: ToolCategory;
  /** Phosphor icon name (astro-icon `ph:` set) */
  icon: string;
  engine: ToolEngine;
  /** max MB per task */
  maxMb: number;
  /** max files per task */
  maxFiles: number;
  accept: string;
}

export const categories: ToolCategory[] = ['organize', 'optimize', 'convert', 'edit', 'security'];

export const tools: ToolDef[] = [
  { key: 'merge',        slug: 'merge-pdf',        category: 'organize', icon: 'ph-files',          engine: 'pdf-lib',   maxMb: 100, maxFiles: 25, accept: '.pdf' },
  { key: 'split',        slug: 'split-pdf',        category: 'organize', icon: 'ph-scissors',       engine: 'pdf-lib',   maxMb: 100, maxFiles: 1,  accept: '.pdf' },
  { key: 'organize',     slug: 'organize-pdf',     category: 'organize', icon: 'ph-squares-four',  engine: 'pdf-lib',   maxMb: 100, maxFiles: 1,  accept: '.pdf' },
  { key: 'compress',     slug: 'compress-pdf',     category: 'optimize', icon: 'ph-file-zip',      engine: 'hybrid',    maxMb: 200, maxFiles: 10, accept: '.pdf' },
  { key: 'pdfToJpg',     slug: 'pdf-to-jpg',       category: 'convert',  icon: 'ph-file-image',    engine: 'pdfjs',     maxMb: 25,  maxFiles: 1,  accept: '.pdf' },
  { key: 'jpgToPdf',     slug: 'jpg-to-pdf',       category: 'convert',  icon: 'ph-file-pdf',      engine: 'pdf-lib',   maxMb: 40,  maxFiles: 25, accept: '.jpg,.jpeg,.png,.webp' },
  { key: 'rotate',       slug: 'rotate-pdf',       category: 'edit',     icon: 'ph-arrow-clockwise',     engine: 'pdf-lib',   maxMb: 100, maxFiles: 25, accept: '.pdf' },
  { key: 'pageNumbers',  slug: 'add-page-numbers', category: 'edit',     icon: 'ph-list-numbers',  engine: 'pdf-lib',   maxMb: 100, maxFiles: 25, accept: '.pdf' },
  { key: 'watermark',    slug: 'watermark-pdf',    category: 'edit',     icon: 'ph-stamp',         engine: 'pdf-lib',   maxMb: 100, maxFiles: 25, accept: '.pdf' },
  { key: 'unlock',       slug: 'unlock-pdf',       category: 'security', icon: 'ph-lock-key-open', engine: 'qpdf-wasm', maxMb: 100, maxFiles: 1,  accept: '.pdf' },
  { key: 'protect',      slug: 'protect-pdf',      category: 'security', icon: 'ph-lock-key',      engine: 'qpdf-wasm', maxMb: 100, maxFiles: 25, accept: '.pdf' },
];

export const toolBySlug = Object.fromEntries(tools.map((t) => [t.slug, t]));
export const toolByKey = Object.fromEntries(tools.map((t) => [t.key, t]));
