# PDF Tools — Tool Specifications (Phase 1, client-side)

Conventions for every tool below:
- **Slug** is the English URL: `/<slug>/`. Other locales: `/<locale>/<slug>/`.
- **Engine** runs in the Web Worker (see ARCHITECTURE.md §4).
- **Limits** enforced in `src/engine/limits.ts` before processing.
- **SEO title pattern:** `<Tool> — Free Online | PDF Tools`. **Description pattern:** per tool, ≤ 160 chars, action-led.
- **Icon:** Phosphor (`ph`) name used in `tools.ts` registry and cards.

---

## 1. Merge PDF — `/merge-pdf/` — Organize — ph-files

- **Inputs:** 2–25 PDF files, ≤ 100 MB per task.
- **Options:** none (reference has none). File cards support drag-reorder, rotate, delete.
- **Engine:** pdf-lib — `copyPages` per source, in input order; progress per file.
- **Output:** `<first-file-name>_merged.pdf` (reference: `ilovepdf_merged`; ours uses first file name).
- **Edge cases:** encrypted PDF without password → per-file error, other files still merge; different page sizes → preserved as-is; 1 file → action button disabled with hint "Add at least 2 PDFs".
- **SEO title:** "Merge PDF Online — Combine PDFs Free | PDF Tools"

## 2. Split PDF — `/split-pdf/` — Organize — ph-scissors

- **Inputs:** 1 PDF, ≤ 100 MB.
- **Options:** mode radio — "Extract pages" (page ranges, e.g. `1-3, 5`) vs "Split by range" (fixed N pages per file). Page-range input validated live.
- **Engine:** pdf-lib — copy selected pages per output.
- **Output:** single PDF (extract mode) or multiple PDFs; multiple → download as sequential downloads + "Download all" (no zip lib in v1; sequential is fine).
- **Edge cases:** invalid range syntax → inline error; range exceeding page count → clamp with warning.

## 3. Compress PDF — `/compress-pdf/` — Optimize — ph-file-zip

- **Inputs:** 1–10 PDFs, ≤ 200 MB per task.
- **Options:** 3 preset rows (radio): Extreme ("Less quality, high compression"), Recommended ("Good quality, good compression", default), Less ("High quality, less compression").
- **Engine:** pdf-lib + image re-encode per preset (JPEG quality 40 / 65 / 85, downscale images > 150 dpi to 150/200/300 dpi). qpdf-wasm fallback if pdf-lib output is larger than input (never return a bigger file — if compressed ≥ original, offer original with a note).
- **Output:** `<name>_compressed.pdf` + before/after size display.
- **Edge cases:** already-optimized PDF → "already small" note; vector-only PDF → explain images-only compression.

## 4. Rotate PDF — `/rotate-pdf/` — Edit — ph-rotate-cw

- **Inputs:** 1–25 PDFs, ≤ 100 MB per task.
- **Options:** rotation buttons 90° / 180° / 270° applied per file (per-file rotate on the file card) or all pages.
- **Engine:** pdf-lib — `setRotation(degrees)` per page.
- **Edge cases:** mixed-orientation PDFs → per-file control solves it.

## 5. PDF to JPG — `/pdf-to-jpg/` — Convert — ph-file-image

- **Inputs:** 1 PDF, ≤ 25 MB.
- **Options:** format JPG/PNG, quality slider (JPG), page range (all / custom), scale (1x / 2x).
- **Engine:** PDF.js — render one page at a time in worker, `canvas.toBlob`; release page between renders (memory guard).
- **Output:** sequential downloads + "Download all".
- **Edge cases:** 500-page PDF → chunked with progress; warn before starting if estimated time is long.

## 6. JPG to PDF — `/jpg-to-pdf/` — Convert — ph-file-pdf

- **Inputs:** 1–25 images (JPG/PNG/WebP), ≤ 40 MB per task.
- **Options:** page size (Fit / A4 / Letter), orientation (auto/portrait/landscape), margin (none/small).
- **Engine:** pdf-lib — embed each image on its own page; drag-reorder supported.
- **Output:** single PDF.

## 7. Add page numbers — `/add-page-numbers/` — Edit — ph-list-numbers

- **Inputs:** 1–25 PDFs, ≤ 100 MB per task.
- **Options:** position (6 presets: bottom-center default), start number, format (`1`, `1/10`, `Page 1`), font size, margin.
- **Engine:** pdf-lib — `drawText` per page; Helvetica (built-in, no embedding cost).
- **Edge cases:** pages with existing footers → note that numbers overlay content.

## 8. Watermark PDF — `/watermark-pdf/` — Edit — ph-stamp

- **Inputs:** 1–25 PDFs, ≤ 100 MB per task.
- **Options:** type (text/image), text content, opacity slider (default 30%), rotation (default -45°), position (tiled default / center), font size.
- **Engine:** pdf-lib — tiled `drawText` or embedded PNG across each page.
- **Edge cases:** image watermark → PNG/JPG only, ≤ 5 MB.

## 9. Organize PDF pages — `/organize-pdf/` — Organize — ph-squares-four

- **Inputs:** 1 PDF, ≤ 100 MB.
- **Options:** none beyond the page grid itself: drag-reorder pages, rotate per page, delete pages.
- **Engine:** pdf-lib — rebuild in grid order.
- **UI note:** page grid is virtualized (see ARCHITECTURE.md §4.4) — 1000-page PDFs stay smooth.
- **Edge cases:** deleting all pages → blocked with message.

## 10. Unlock PDF — `/unlock-pdf/` — Security — ph-lock-key-open

- **Inputs:** 1 PDF (encrypted), ≤ 100 MB.
- **Options:** password field (show/hide toggle). Processed locally — password never leaves the device (stated in UI).
- **Engine:** qpdf-wasm — decrypt with password; wrong password → clear error, retry allowed.
- **Output:** unlocked PDF download.
- **Edge cases:** owner-password-only restrictions → removed; user-password required.

## 11. Protect PDF — `/protect-pdf/` — Security — ph-lock-key

- **Inputs:** 1–25 PDFs, ≤ 100 MB per task.
- **Options:** password + confirm (match validation), permissions (print/copy toggles → 128-bit RC4/AES via qpdf).
- **Engine:** qpdf-wasm — encrypt; done message reminds user the password can't be recovered.
- **Edge cases:** weak password (< 6 chars) → warning, not a block.

---

## Shared behaviors (all tools)

- **Drag & drop** anywhere on the workspace; file-type validation on drop with named error.
- **Progress:** determinate bar when measurable (per file/page), indeterminate spinner otherwise; status text per tool ("Merging PDFs...", "Rendering page 12 of 40...").
- **Errors:** inline, named, recoverable — never a crash, never silent.
- **Download screen:** primary download button, filename, "Start over", related-tools row (3 cards).
- **Accessibility:** dropzone is a real `<button>`/`<input type=file>` (keyboard operable), progress has `role="progressbar"` + `aria-valuenow`, errors use `role="alert"`.
