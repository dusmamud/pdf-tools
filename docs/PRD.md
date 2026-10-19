# PDF Tools — Product Requirements Document (PRD)

**Version:** 1.0 — 13 Oct 2026
**Scope:** Client-side only (Phase 1). No backend. Backend (Office conversions, OCR, AI) is Phase 2, out of scope for this document except where noted as future.

## 1. Vision

A free, fast, private PDF tools web app in the style of ilovepdf.com: every tool works 100% in the browser. Files never leave the user's device — this is both the architecture and the marketing message.

## 2. Target users

- Students and office workers who need quick PDF tasks (merge assignments, compress uploads, convert pages to images).
- Users on low-end devices and slow networks (client-side = no upload wait).
- Privacy-conscious users (no account, no upload, no tracking of file contents).

## 3. Product principles

1. **Same-to-same UX as the reference** (ilovepdf.com, analyzed via REA MCP): identical flow order — dropzone → file cards → options → action button → progress → download.
2. **Never freeze, never crash.** All heavy work runs in Web Workers; large files are processed in chunks; memory limits are checked before processing with a friendly error, not a tab crash.
3. **Free and unlimited-feeling.** Generous client-side limits; the reference's free-tier limits are mirrored as soft caps for future monetization alignment.
4. **Private by construction.** No server, no upload, no cookies for files. Stated on a dedicated Privacy page.
5. **Fast and accessible.** Static Astro pages, tiny JS per tool, WCAG 2.2 AA, best-practice SEO on every tool page.

## 4. Tool list — Phase 1 (all client-side)

| # | Tool | Slug | Category | Engine |
|---|------|------|----------|--------|
| 1 | Merge PDF | `/merge-pdf/` | Organize | pdf-lib |
| 2 | Split PDF | `/split-pdf/` | Organize | pdf-lib |
| 3 | Compress PDF | `/compress-pdf/` | Optimize | pdf-lib + image re-encode (qpdf-wasm if needed) |
| 4 | Rotate PDF | `/rotate-pdf/` | Edit | pdf-lib |
| 5 | PDF to JPG | `/pdf-to-jpg/` | Convert | PDF.js |
| 6 | JPG to PDF | `/jpg-to-pdf/` | Convert | pdf-lib |
| 7 | Add page numbers | `/add-page-numbers/` | Edit | pdf-lib |
| 8 | Watermark PDF | `/watermark-pdf/` | Edit | pdf-lib |
| 9 | Organize PDF pages | `/organize-pdf/` | Organize | pdf-lib |
| 10 | Unlock PDF | `/unlock-pdf/` | Security | qpdf-wasm (password known) |
| 11 | Protect PDF | `/protect-pdf/` | Security | qpdf-wasm |

Phase 2 (backend, NOT in v1): Word/Excel/PowerPoint ↔ PDF, OCR PDF, HTML to PDF, AI Summarizer/Translate, Edit PDF (full editor), Sign PDF (certified), Repair PDF.

## 5. Limits (per task, client-side enforced)

Mirrored from the reference's free tier so future premium tiers align:

- Merge / Split / Organize / Rotate / Page numbers / Watermark / Unlock / Protect: **100 MB** per task.
- Compress: **200 MB** per task.
- PDF to JPG: **25 MB**; JPG to PDF: **40 MB** per task.
- Merge: max **25 files** per task.

When a limit is hit: show a friendly inline error naming the exact limit (never a crash, never silent failure).

## 6. Core user flows

### 6.1 Tool workspace flow (all tools, same order)

1. **Landing state:** H1 + subtext centered. Large primary button "Select PDF files" (+ red→blue circular Drive/Dropbox buttons — v1: computer only, cloud buttons shown disabled with "soon" tooltip OR hidden; decision: hidden in v1, no dead UI). Gray hint "or drop PDFs here". Whole zone is a drag-drop target.
2. **Files added:** file cards appear (thumbnail of first page, filename, page count, per-file actions: rotate left/right, delete; drag to reorder where relevant). "Add more files" affordance.
3. **Options panel** (right side / below on mobile): tool-specific controls (see TOOL-SPECS.md). Sensible defaults preselected.
4. **Action:** large primary button labeled per tool ("Merge PDF", "Compress PDF"...). Disabled until ≥1 valid file.
5. **Processing:** overlay with spinner, tool-specific status text ("Merging PDFs..."), determinate progress bar when measurable, "do not close" hint for long jobs.
6. **Done:** download button (primary), filename shown, "Start over" link, "Process another file" secondary, related-tools row.

### 6.2 Homepage flow

Header → hero (H1 + subtext, no CTA) → category pills → tool card grid → trust section (privacy badges) → footer. Clicking a card navigates to the tool page.

## 7. Non-goals (v1)

- No user accounts, no login/signup (header shows only logo + nav + theme toggle + language selector).
- No backend, no file upload to any server, no database.
- No cloud import (Drive/Dropbox) — UI hidden, not disabled.
- No ads in v1 (layout reserves no ad slots; can be added later without redesign).
- No premium/paywall UI in v1 (limits documented for future).

## 8. Success metrics

- Lighthouse: Performance ≥ 95, Accessibility = 100, Best Practices = 100, SEO = 100 on tool pages (mobile).
- Zero tab crashes on the QA large-file matrix (see QA-CHECKLIST.md).
- All 11 tools × 20 locales build with no errors; sitemap contains every URL.

## 9. Open decisions (need user)

- Contact/support email for footer (deferred by user on previous project — keep placeholder, do not nag).
- Analytics: privacy-friendly (Plausible/Cloudflare Web Analytics) — proposed, not decided.
