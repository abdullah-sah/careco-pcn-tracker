# Mobile responsiveness — design

**Date:** 2026-07-05
**Scope:** Full mobile pass over `components/pcn-portal.tsx`: navbar, register (toolbar + table), add-a-PCN (capture) page incl. check & save panel, detail view, reset-register dialog.

## Problem

App is desktop-only in practice. All styling is inline via the `css()` string helper, which cannot express media queries. On a ~390px phone:

- Header: logo + IMPORT XLSX + EXPORT XLSX + GDPR text overflow one flex row.
- Register toolbar: 220px search input + ADD PCN button overflow; table grid `96px 138px 1fr 78px 116px 70px` needs ~570px+.
- Capture view: `grid-template-columns:340px 1fr` overflows; check & save fields `1fr 1fr` cramped.
- Detail view: `1.25fr 1fr` grid overflows.
- Inputs are 12px → iOS Safari zooms viewport on focus.

## Approach (decided)

**Tailwind v4, full conversion.** All `css()` string styling in `pcn-portal.tsx` is rewritten as Tailwind classes; the responsive behaviour is expressed mobile-first with `md:` (768px) as the desktop breakpoint.

Setup:
- Install `tailwindcss`, `@tailwindcss/postcss`, `postcss`; add `postcss.config.mjs`.
- `globals.css`: `@import "tailwindcss"`; keep the Google-fonts `@import` and `rdspin`/`rdnew` keyframes; define `@theme` tokens — fonts (`--font-hanken`, `--font-spline`, `--font-spectral`) and the palette (accent `#9c3327`, ink `#211d18`, paper `#fffdf8`, cream `#f4f0e6`, field `#faf6ec`, line `#e2dbcd`, line-soft `#ece4d4`, muted `#6a6155`, faint `#8a8175`, sand `#a89e8c`, plus council/private chip colours). One-off values use arbitrary classes (`text-[12.5px]`).

Conversion rules:
- Delete `css()`, `cssCache`, `merge()`, and the JS `Hover` component — `hover:` variants replace it. `Field` takes className props instead of style strings. Shared input/label styles become shared class-string constants (`LABEL`, `INPUT_MONO`, `INPUT_HANKEN` stay, as Tailwind class strings).
- State-dependent styling (active chip, category colours, `newId` highlight, saving-dim) becomes conditional class strings.
- Register-row cells use explicit `order-*` / `col-span-*` placement on mobile and `md:` resets for the 6-col desktop row — no grid-template-areas needed.
- iOS focus-zoom fix falls out naturally: inputs get `text-[16px] md:text-xs`-style classes (16px below md).
- No logic changes; JSX changes limited to className rewrites plus wrapping the two xlsx button labels in spans.
- Desktop must remain visually identical (same px values via tokens/arbitrary values).

Rejected: `useIsMobile` JS hook (SSR desktop-first flash, dual code paths); plain CSS classes + media queries in globals.css (approved initially, superseded — user wants the codebase on Tailwind); Tailwind for responsive-layer only (two styling systems coexisting).

## Per-screen behaviour

### Navbar (`header`)
- Desktop: unchanged.
- Mobile: GDPR text (`UK GDPR · name-only`) hidden. IMPORT/EXPORT label text wrapped in a `hidden md:inline` span → icon-only ↥ / ↧ buttons, ≥40px tap targets. Glyph stays constant during parsing; "READING…" state conveyed by the existing opacity dim. Inner padding 15px 24px → 12px 16px.

### Register
- Toolbar stacks: row 1 title + count; row 2 search (flex-1, full remaining width) + ADD PCN beside it. Search input `w-[220px]` desktop, full-width mobile.
- Category chips row: unchanged (fits).
- Column-header row: `hidden md:grid`. Sorting is not available on mobile (default logged-order). The full/discounted cost toggle is preserved as a small right-aligned chip above the list, `md:hidden` (both elements always in DOM).
- Rows → cards. Same DOM; mobile is a 2-col grid using `order-*` + `col-span-2` placement, `md:` resets to the 6-col row. Card layout:

```
"reg  cost"
"num  cat"
"auth auth"
"date date"
```

Card: 1px solid #ece4d4 border, radius 10px, background #fffdf8, padding ~12px 14px, 10px gap between cards. Cost right-aligned, category chip `justify-self-end`. Authority keeps existing ellipsis. `newId` highlight becomes a conditional background class on the row.

### Add a PCN (capture)
- Capture grid: `grid-cols-1 md:grid-cols-[340px_1fr]` (image/options first in DOM, then panel).
- Idle stage: camera + upload tiles full width (already a column).
- Draft stage: image preview capped on mobile — `max-h-[220px] object-contain md:max-h-none` (thumbnail reminder; full image lives in detail view). Check & save panel below it.
- Check & save fields grid: `grid-cols-1 md:grid-cols-2`; driver/notes cells `md:col-span-2`. Category segmented control full width (already flex-1 halves).
- SAVE TO REGISTER button grows on mobile (flex:1, centered text); Discard stays beside it in the same row. Panel padding 20px 22px → 16px.

### Detail
- Detail grid: `grid-cols-1 md:grid-cols-[1.25fr_1fr]` (record card first, image second).
- Read-only "stored record" grid: **stays 2-col on mobile** (short values, keeps page compact).
- Edit inputs grid: `grid-cols-1 md:grid-cols-2`; notes `md:col-span-2`.
- Back-row (← register / reg / chip) wraps naturally; no change expected.

### Reset-register dialog
- Width already `min(440px,90vw)`. Add: overlay padding 16px (never touches screen edge), panel `max-height:85vh; overflow:auto`.

## Non-goals

- No sorting UI on mobile register.
- No image zoom/lightbox.
- No component-library adoption (shadcn etc.) — plain Tailwind classes only.
- No redesign: desktop rendering must remain visually identical.

## Testing

No visual test infra. Verification:

1. `npm run build` passes; `npm test` (vitest) stays green — no logic touched.
2. Manual browser pass (dev server, device emulation) at 390px and 1280px:
   - 1280px: all screens pixel-identical to before.
   - 390px: no horizontal scroll on any screen; navbar one row with icon buttons; register cards render per template; capture + check & save single column, inputs 16px (no iOS zoom); detail single column; reset dialog fits with margin.
3. Viewport meta: rely on Next.js App Router default (`width=device-width, initial-scale=1`); confirm present in page source during the manual pass.
