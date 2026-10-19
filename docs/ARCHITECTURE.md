# PDF Tools — Architecture

**Scope:** Phase 1, client-side only. No backend, no database, no server uploads.

## 1. Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Astro 5 (static output) | Tiny JS per page, content-first, i18n routing built in |
| UI islands | React 18 + TypeScript (strict) | Tool workspaces are interactive islands; same as ImgLove pattern |
| Styling | Tailwind CSS | Design tokens via CSS variables for theming |
| Icons | Phosphor (`astro-icon`, `ph` set) | User requirement; outline style, 1.5px stroke default |
| PDF structure | pdf-lib | Merge/split/rotate/pages/watermark/organize — pure JS, battle-tested |
| PDF rendering | pdfjs-dist (PDF.js) | Page thumbnails, PDF→JPG export |
| Encrypt/decrypt/compress-native | qpdf-wasm | Unlock/Protect; fallback for compress when pdf-lib is insufficient |
| Fonts | Inter, self-hosted woff2 (400/500/600/700) | Reference uses paid Graphik; Inter is the free lookalike, served from `/fonts/` |
| Deploy | GitHub Pages (`dusmamud/pdf-tools`, base `/pdf-tools`) | Same as Ricsline/ImgLove/ResumeForge |

## 2. Repository structure

```
pdf-tools/
├── docs/                        # PRD, ARCHITECTURE, TOOL-SPECS, I18N, SEO,
│                                # DESIGN-SYSTEM, QA-CHECKLIST, PRIVACY
├── public/
│   ├── fonts/                   # Inter woff2 (self-hosted)
│   ├── og/                      # per-tool OG images (generated, 1200x630)
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── pages/
│   │   ├── index.astro          # English home (/)
│   │   ├── [tool].astro         # English tool pages (/merge-pdf/)
│   │   ├── [locale]/
│   │   │   ├── index.astro      # /hi/ ...
│   │   │   └── [tool].astro     # /hi/merge-pdf/
│   │   └── 404.astro
│   ├── layouts/
│   │   └── BaseLayout.astro     # <head> SEO, hreflang, JSON-LD, theme init
│   ├── components/
│   │   ├── Header.astro         # logo, nav, theme toggle, locale switcher
│   │   ├── Hero.astro
│   │   ├── ToolGrid.astro       # category pills + cards
│   │   ├── ToolCard.astro
│   │   ├── Footer.astro
│   │   ├── FAQ.astro
│   │   └── TrustBadges.astro
│   ├── tools/                   # React islands, one per tool (client:visible)
│   │   ├── ToolWorkspace.tsx    # shared shell: dropzone → files → options → action → progress → download
│   │   ├── FileCard.tsx
│   │   ├── Dropzone.tsx
│   │   ├── OptionsPanel.tsx
│   │   ├── ProgressOverlay.tsx
│   │   ├── DownloadScreen.tsx
│   │   ├── MergeTool.tsx
│   │   ├── SplitTool.tsx
│   │   ├── CompressTool.tsx
│   │   ├── RotateTool.tsx
│   │   ├── PdfToJpgTool.tsx
│   │   ├── JpgToPdfTool.tsx
│   │   ├── PageNumbersTool.tsx
│   │   ├── WatermarkTool.tsx
│   │   ├── OrganizeTool.tsx
│   │   ├── UnlockTool.tsx
│   │   └── ProtectTool.tsx
│   ├── engine/
│   │   ├── pdf.ts               # pdf-lib wrappers (merge, split, rotate, ...)
│   │   ├── render.ts            # PDF.js thumbnail/render helpers
│   │   ├── qpdf.ts              # qpdf-wasm wrapper (unlock/protect)
│   │   ├── worker.ts            # worker entry: receives jobs, posts progress
│   │   ├── jobs.ts              # job types: { tool, files, options }
│   │   └── limits.ts            # per-tool size/count limits (from PRD)
│   ├── i18n/
│   │   ├── locales/             # 20 dict files: en.ts, hi.ts, ...
│   │   ├── dicts.ts             # merged dictionaries + types
│   │   └── index.ts             # t(), locale helpers, RTL list
│   ├── styles/
│   │   └── global.css           # Tailwind + CSS variables (themes)
│   ├── types/
│   │   └── index.ts
│   └── tools.ts                 # tool registry: slug, icon, category, engine, limits
│                                # (single source of truth for pages, grid, sitemap)
├── astro.config.mjs             # i18n: defaultLocale 'en', prefixDefaultLocale: false
├── tailwind.config.mjs
├── tsconfig.json
└── package.json
```

## 3. Routing (English default at root)

- `prefixDefaultLocale: false`, `defaultLocale: 'en'`.
- English: `/`, `/merge-pdf/`, `/split-pdf/` … (no `/en/` prefix).
- Other locales: `/hi/`, `/hi/merge-pdf/` … (19 locales).
- `tools.ts` registry drives `[tool].astro` via `getStaticPaths` for all locales.

## 4. Engine design — no freeze, no crash

### 4.1 Web Worker job model

All PDF processing runs in a dedicated Web Worker (`src/engine/worker.ts`):

```
UI thread                      Worker thread
─────────                      ─────────────
ToolWorkspace ──postMessage──→  job { id, tool, files: ArrayBuffer[], options }
   ↑ renders progress           │  processes in chunks
   └──── onmessage: progress ───┘  posts { id, progress, status }
   └──── onmessage: done ──────→  { id, result: Blob } → download URL
```

- The UI thread **never** touches pdf-lib/PDF.js directly for heavy ops — it only renders.
- Progress is posted per chunk (e.g., per page merged, per image re-encoded) so the bar is determinate where possible.

### 4.2 Chunked processing

- **Merge/Split/Organize:** process one source PDF at a time; yield progress per file.
- **PDF→JPG:** render one page at a time, `page.render()` then release the page before the next.
- **Compress:** re-encode images per page; never hold all pages' bitmaps at once.

### 4.3 Memory guards (checked BEFORE processing)

`src/engine/limits.ts` enforces per-tool caps from the PRD. Additionally:

- Estimate peak memory ≈ 3× total input size for render-heavy tools; refuse with a friendly error if it exceeds a safe budget (e.g., 1 GB) instead of crashing the tab.
- PDF.js: set `isEvalSupported: false`, disable worker-less fallback; always use the PDF.js worker.
- Revoke object URLs after download; no Blob leaks.

### 4.4 File pipeline

`File (input/drag) → validate (type, size, count) → ArrayBuffer → transfer to worker (transferables, zero-copy) → result Blob → object URL → download link`. Thumbnails: first page rendered at low scale in the worker, posted back as small Blob.

## 5. State management

- No global store. Each tool island owns its state: `idle → files-added → ready → processing → done | error`.
- `ToolWorkspace.tsx` is the shared state machine; per-tool components supply only: accepted file types, options UI, and the job payload builder.
- Theme: `light | dark | system` in `localStorage`, applied as `class="dark"` on `<html>` before paint (inline script in BaseLayout, no FOUC).
- Locale: from URL; locale switcher preserves the current tool path.

## 6. Build & deploy

- `astro build` → static `dist/`, deployed to GitHub Pages (`gh-pages` branch, `.nojekyll`), same push flow as ImgLove (Git Data API script; Pages CDN takes 2–4 min — hard-refresh before QA).
- `base: '/pdf-tools'` in config; all internal links via Astro's `getRelativeLocaleUrl`-style helpers honoring the base.

## 7. Phase 2 note (backend, future — not built now)

When Office conversions / OCR / AI are needed: add a `POST /v1/tasks` microservice (Go + LibreOffice / Python + Tesseract) behind the same tool URLs, with the client detecting "server tool" from `tools.ts` (`engine: 'server'`) and switching the workspace to upload mode (tus resumable). The workspace state machine already models upload progress, so the UI change is minimal.
