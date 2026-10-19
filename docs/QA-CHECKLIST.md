# PDF Tools — QA Checklist

Law: **cross verified karke** — every claim verified on the live surface before reporting. No "probably works".

## 1. Per-tool functional QA (all 11 tools)

For each tool:
- [ ] Dropzone: click-to-browse works; drag-drop works; wrong file type → named error.
- [ ] Limits: over-size file → exact limit named in error (e.g. "exceeds 100 MB"); over-count → named error.
- [ ] Options: every control changes the output (verify by inspecting result, not just UI).
- [ ] Action button disabled with 0 files / invalid input; enabled otherwise.
- [ ] Processing overlay shows; progress advances; completion reaches Download screen.
- [ ] Downloaded file opens correctly (verify page count / rotation / watermark presence with pdfinfo or PDF.js).
- [ ] "Start over" resets to clean landing state (no stale files, no stale object URLs — check DevTools memory).
- [ ] Encrypted input (Unlock tool): wrong password → clear error, retry works.

## 2. Heavy-file / no-crash matrix (the hard requirement)

| Case | Expectation |
|------|-------------|
| 100 MB merge (5 × 20 MB) | Completes; UI responsive throughout (scroll, hover) |
| 500-page PDF → JPG | Chunked; progress per page; no tab crash |
| 25 files merge (limit) | Completes; file list virtualized, smooth scroll |
| 26 files merge | Refused pre-processing with named limit error |
| 300 MB file on Compress | Refused pre-processing (200 MB cap), friendly error |
| 10 rapid tool switches | No worker leaks (one worker per session, terminated on tool change) |
| Airplane mode mid-processing | Client-side tools unaffected (no network needed) — verify |

- [ ] DevTools Performance: no long tasks > 200ms on UI thread during processing.
- [ ] DevTools Memory: heap returns to baseline after "Start over" (no Blob/URL leaks).

## 3. i18n QA

- [ ] All 20 locales build; type-check passes (no missing dict keys).
- [ ] `/hi/merge-pdf/` renders Hindi; locale switcher preserves tool.
- [ ] RTL (`/ar/`, `/ur/`): layout mirrors, no overlapping text, icons flip where directional.
- [ ] `hreflang` present and correct on 3 sample pages (view source).

## 4. SEO QA

- [ ] `curl` the built HTML of `/merge-pdf/`: title, description, canonical, OG tags, 3 JSON-LD blocks present.
- [ ] `sitemap.xml` contains all 220 tool URLs + homepages; no `/en/` URLs.
- [ ] `robots.txt` reachable.

## 5. Accessibility QA

- [ ] Keyboard-only run per tool: tab order sane, dropzone operable via Enter, all buttons reachable, focus visible.
- [ ] Screen reader (or axe-core): no violations; progressbar announces; errors announce via `role="alert"`.
- [ ] `prefers-reduced-motion`: no spinner animation.

## 6. Theme QA

- [ ] Light / Dark / System all render; no unreadable text (spot-check all tokens).
- [ ] No FOUC on reload (theme applied pre-paint).
- [ ] Choice persists across pages.

## 7. Live deploy QA (after GitHub Pages push)

- [ ] Hard-refresh (CDN takes 2–4 min): verify live bundle matches local `dist/`.
- [ ] 12-check pass: home loads, 3 tool pages load, 1 tool end-to-end in browser, locale page, 404 page, sitemap, robots, OG image loads, theme toggle, mobile viewport smoke test, no console errors, Lighthouse ≥ 95/100/100/100 on merge page.
