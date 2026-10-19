# PDF Tools — Design System

Reference: ilovepdf.com UI inventory (REA MCP + live-browser analysis, 13 Oct 2026). Same-to-same layout and flow; brand color swapped to ImgLove blue; dark mode added (reference has none).

## 1. Brand

- **Name:** PDF Tools
- **Primary:** `#4d90fe` (ImgLove blue). Hover: `#3b7de9`. Active/pressed: `#2f6bd8`.
- **On-primary text:** `#ffffff`.
- Logo: wordmark "PDF Tools" (Inter 700) + Phosphor `ph-file-pdf` mark in a rounded blue square. (Custom logo art is a future polish item, like the ImgLove icon pipeline.)

## 2. Theme tokens (CSS variables, `light` / `dark` / `system`)

| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `#ffffff` | `#121212` |
| `--bg-soft` | `#f5f5fa` | `#1e1e1e` |
| `--surface` (cards) | `#ffffff` | `#1e1e1e` |
| `--border` | `#ebebf4` | `#2e2e2e` |
| `--text` | `#161616` | `#e8eaed` |
| `--text-2` (secondary) | `#707078` | `#9aa0a6` |
| `--text-3` (hint) | `#adadb6` | `#5f6368` |
| `--primary` | `#4d90fe` | `#8ab4f8` |
| `--success` | `#4acd86` | `#4acd86` |
| `--warning` | `#ffb400` | `#ffb400` |
| `--danger` | `#e5322d` | `#ff6b62` |

Dark values follow the user's settled dark-theme taste (Google/Spotify-neutral, no neon, no blue tint). Theme via `class="dark"` on `<html>`; `system` follows `prefers-color-scheme`; choice persisted in `localStorage`; applied pre-paint (no FOUC).

## 3. Typography (Inter, self-hosted)

- Files: `/fonts/inter-400.woff2`, `-500`, `-600`, `-700` (latin + latin-ext), `font-display: swap`.
- Scale: H1 36–40px/700, H2 28–32px/700, card title 17–18px/600, body 14–15px/400, nav 13–14px/600 uppercase, button 15–17px/600.
- Fallback stack: `"Inter", system-ui, "Noto Sans", sans-serif` (covers non-Latin locales).

## 4. Components (React + Astro, Tailwind)

**Header** (fixed, 60px, `var(--bg)`, bottom border): logo left; nav center (Merge, Split, Compress, Convert ▾, All Tools mega-dropdown); right: theme toggle (Phosphor `ph-sun`/`ph-moon`/`ph-monitor`), locale switcher (globe), no login in v1. Mobile: hamburger → slide-in menu.

**Hero** (home): centered H1 + subtext (`var(--text-2)`), no CTA button (reference pattern — the grid is the action). Max-w-3xl.

**Category pills:** `All` active = filled dark (`var(--text)` bg, `var(--bg)` text); inactive = `var(--bg-soft)` pills with border. Categories: All, Organize, Optimize, Convert, Edit, Security.

**ToolCard:** white/`var(--surface)`, 1px `var(--border)`, radius 12px, padding 24px; 48px rounded-square icon tile (category-tinted bg: organize `#ffe9e4`/blue-tint, optimize green-tint, convert amber/blue-tint, edit purple-tint, security slate-tint — tints adapt in dark mode); title 600 17px; desc 2-line 14px `var(--text-2)`; hover: 1.5px `var(--text)` outline (reference behavior). Grid: 6 cols desktop → 3 → 2 → 1.

**Workspace (per tool):**
- H1 centered 36px/700 + subtext 18px `var(--text-2)`.
- **Dropzone:** big primary button "Select PDF files" (radius 10px, padding 16×48, `ph-plus` icon) + two 44px circular secondary buttons beside it (hidden in v1 — no cloud); below: hint "or drop PDFs here" 14px `var(--text-3)`. Whole panel is a drag target: on dragover, dashed `var(--primary)` outline + tint.
- **FileCard:** 120px thumbnail, filename (truncate), `{n} pages` label, icon buttons: rotate-ccw, rotate-cw, trash (`ph-trash`), drag handle (`ph-dots-six-vertical`); drag-reorder with keyboard up/down alternative.
- **OptionsPanel:** white card right of files (stacks below on mobile); per-tool controls from TOOL-SPECS.md; radio rows with title + hint lines (reference compress pattern).
- **Action button:** full-width-on-mobile primary, label per tool; disabled state until valid input.
- **ProgressOverlay:** modal card: spinner (or determinate bar), status text, filename, "Please don't close this tab" hint for long jobs.
- **DownloadScreen:** big success icon (`ph-check-circle`, `--success`), filename, primary "Download" button, secondary "Start over", related-tools 3-card row.

**Footer:** 4 columns (Product, Resources, Solutions, Company) + bottom bar (© line, language selector, social icons). No login links in v1.

## 5. Motion & feedback

- 150ms ease-out on hover states; no animation on `prefers-reduced-motion`.
- Toasts for non-blocking notices (top-center, auto-dismiss 4s); blocking errors inline (`role="alert"`).
- Skeleton shimmer on file-card thumbnails while rendering.

## 6. Responsive breakpoints

- `≥1280px`: 6-col grid, side-by-side workspace (files + options).
- `1024px`: 4-col grid.
- `768px`: 3-col grid, hamburger nav, workspace stacks.
- `<480px`: 2-col grid (1-col < 360px), full-width action button, 44px min touch targets.
