# PDF Tools — SEO, Accessibility & Performance

## 1. SEO — "rich" checklist (every tool page, every locale)

### 1.1 Page inventory

- 11 tools × 20 locales = **220 tool pages** + 20 homepages + 404s. All static, all in sitemap.
- One canonical slug per tool (`/merge-pdf/`), no `/en/` duplicates.

### 1.2 Head (BaseLayout.astro)

- `<title>` ≤ 60 chars: `<Tool> — Free Online | PDF Tools` (+ localized).
- `<meta name="description">` ≤ 160 chars, action-led, localized.
- Canonical URL (absolute, English root for `x-default`).
- `hreflang`: 20 alternates + `x-default` → English root URL.
- Open Graph: `og:title`, `og:description`, `og:type=website`, `og:image` (per-tool 1200×630 from `/og/<tool>.png`), `og:locale` + alternates.
- Twitter card: `summary_large_image`.
- `robots.txt`: allow all; sitemap reference. (No AI-training disallow in v1 — decision deferred.)

### 1.3 Structured data (JSON-LD per tool page)

1. `SoftwareApplication` (or `WebApplication`): name, url, applicationCategory `UtilitiesApplication`, operatingSystem `Any`, offers `{ price: 0 }`.
2. `FAQPage`: 4–6 real per-tool Q&As (mirrors visible FAQ section).
3. `BreadcrumbList`: Home → Category → Tool.

### 1.4 Content SEO

- Each tool page: H1 (tool name + "files"), 1–2 line subtext, "How to <tool>" 3-step section, FAQ section (matches JSON-LD), related-tools row (internal linking).
- Semantic HTML: one `<h1>`, proper heading order, `<main>`, `<nav aria-label>`.
- Sitemap via `@astrojs/sitemap` (i18n mode); submitted after deploy.

### 1.5 OG images

- Template-generated 1200×630 PNGs: brand blue background tint, Phosphor tool icon, tool name, "PDF Tools — Free, Private, In-Browser".
- Generated once per tool (11 images), reused across locales (no text-heavy locale variants in v1).

## 2. Accessibility (WCAG 2.2 AA target, Lighthouse 100)

- Dropzone: native `<input type="file">` + `<label>`/`<button>` — keyboard operable, visible focus ring.
- Progress: `role="progressbar"` with `aria-valuenow`, `aria-valuemin/max`, and a visually-hidden status live region (`aria-live="polite"`).
- Errors: `role="alert"`.
- File cards: list semantics (`<ul>`), per-card buttons have `aria-label`s ("Remove annual-report.pdf", "Rotate clockwise").
- Drag-reorder: keyboard alternative (move up/down buttons on each card).
- Color contrast: blue `#4d90fe` on white passes for large text/buttons; body text `#161616` on `#ffffff`; dark theme tokens checked at 4.5:1.
- `prefers-reduced-motion`: disable spinner animation, keep progress bar (no motion dependency).
- Focus order: header → H1 → dropzone → file list → options → action button.

## 3. Performance (Lighthouse Performance ≥ 95 mobile)

- **Islands:** tool workspace hydrates with `client:visible`; homepage is 0-JS except theme init + locale switcher.
- **Code splitting:** pdf-lib, PDF.js, qpdf-wasm load lazily — only when their tool's workspace becomes visible (dynamic `import()` inside the worker bootstrap, not in the page bundle).
- **Fonts:** Inter woff2 with `font-display: swap`, preloaded (400 + 700 only); total font budget ≤ 120 KB.
- **Images:** OG images + thumbnails lazy; thumbnails are worker-generated Blobs (no network).
- **Budgets:** tool page HTML ≤ 60 KB, page JS ≤ 80 KB (excluding lazily-loaded engines), LCP < 2.5s on Moto G4-class throttling.
- **No layout shift:** dropzone and card grid reserve space; font swap uses `size-adjust` fallback metrics.

## 4. Verification (see QA-CHECKLIST.md)

Lighthouse CI on 3 representative pages (home, merge, compress) × 2 locales (en, ar for RTL) × 2 themes. Manual keyboard-only pass per tool. axe-core scan in CI.
