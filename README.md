# PDF Tools

> A **Dusrel** product — part of the [Dusrel](https://dusrel.com) ecosystem.

Free, fast, private PDF tools that run 100% in your browser. No uploads, no accounts, no servers.

**Status:** Phase 1 complete — all 11 tools built, 20 locales, final QA green, live on GitHub Pages (temporary preview).

## Quick start (run on your laptop)

```bash
git clone https://github.com/dusmamud/pdf-tools-src.git
cd pdf-tools-src
npm install
npm run dev
```

Then open `http://localhost:4321` in your browser.

Production build: `npm run build` → static output in `dist/` (`node_modules/` and `dist/` are git-ignored; `npm install` recreates everything).

## The 11 tools

Merge, Split, Compress, JPG→PDF, PDF→JPG, Rotate, Organize, Watermark, Page Numbers, Unlock, Protect — all client-side (pdf-lib + PDF.js; qpdf-wasm for Unlock/Protect). Heavy files are processed in Web Workers so the UI never freezes.

## Docs

| Doc | What |
|-----|------|
| `docs/PRD.md` | Product requirements: vision, 11 tools, limits, flows, non-goals |
| `docs/ARCHITECTURE.md` | Stack, repo structure, Web Worker engine design, routing, deploy |
| `docs/TOOL-SPECS.md` | Per-tool spec: inputs, options, engine, edge cases (11 tools) |
| `docs/I18N.md` | 20 locales, English-at-root URLs, RTL, translation workflow |
| `docs/SEO.md` | Rich SEO, JSON-LD, OG images, a11y, performance budgets |
| `docs/DESIGN-SYSTEM.md` | Brand blue `#4d90fe`, light/dark/system themes, Inter (self-hosted), Phosphor icons, all components |
| `docs/QA-CHECKLIST.md` | Functional, heavy-file, i18n, SEO, a11y, theme, live-deploy QA |
| `docs/PRIVACY.md` | Privacy page content (files never leave the device) |

## Key decisions (locked)

- **Name:** PDF Tools · **Brand:** `#4d90fe` blue · **Themes:** Light / Dark / System
- **Icons:** Phosphor · **Font:** Inter, self-hosted woff2 (reference uses paid Graphik)
- **Stack:** Astro 5 + React + TypeScript + Tailwind · **Deploy:** GitHub Pages (`dusmamud/pdf-tools`, temporary preview)
- **UI/UX:** same-to-same as ilovepdf.com (REA MCP + live-browser analysis, 13 Oct 2026)
- **Phase 1 = client-side only.** Backend (Office conversions, OCR, AI) is Phase 2 — architecture doc reserves the seam (`engine: 'server'` in `tools.ts`).
- **Hard requirements:** no UI freeze/lag/crash on heavy files (Web Workers + chunked processing + memory guards); best SEO/a11y/performance.

## Reference analysis

- REA MCP blueprint: `~/workspace/your_files/ilovepdf-blueprint.pdf`
- REA target dumps + screenshots: `~/workspace/rea/targets/ilovepdf/`, `~/workspace/rea/ui-shots/`

## Build log (completed)

1. Scaffold (Astro + React + TS + Tailwind + i18n routing + theme)
2. Design tokens + Header/Footer/Hero/ToolGrid
3. ToolWorkspace shell + Merge PDF (pilot)
4. Remaining 10 tools (batch, each E2E-verified)
5. i18n dicts (EN → 19 locales)
6. SEO polish (OG images, sitemap verify, JSON-LD)
7. QA pass + deploy
