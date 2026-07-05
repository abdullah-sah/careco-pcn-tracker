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

CSS classes + media queries. Single breakpoint: `@media (max-width: 720px)` in `app/globals.css`.

- ~15 layout containers get `pp-*` classNames. Their **layout** props (display, grid-template, flex-direction, width, padding, gap) move from inline `css()` strings into `globals.css`: desktop rules on the class, mobile overrides in the media block.
- Visual props (colors, fonts, borders, radii) stay inline. Rule: any property that changes at the breakpoint must live in CSS (inline beats class); properties that never change may stay inline.
- No logic changes. JSX changes limited to adding `className`s and wrapping two button labels in spans.
- Exception: `@media (max-width:720px) { .pp-portal input, .pp-portal textarea { font-size:16px !important } }` — required to beat inline 12px font and prevent iOS focus-zoom.

Rejected: `useIsMobile` JS hook (SSR desktop-first flash, dual code paths); Tailwind refactor (whole-UI rewrite + regression risk for one fix).

## Per-screen behaviour

### Navbar (`header`)
- Desktop: unchanged.
- Mobile: GDPR text (`UK GDPR · name-only`) hidden. IMPORT/EXPORT label text wrapped in `<span class="pp-btn-txt">`, hidden on mobile → icon-only ↥ / ↧ buttons, ≥40px tap targets. Glyph stays constant during parsing; "READING…" state conveyed by the existing opacity dim. Inner padding 15px 24px → 12px 16px.

### Register
- Toolbar stacks: row 1 title + count; row 2 search (flex:1, full remaining width) + ADD PCN beside it. Search input `width:220px` → `width:100%` via class.
- Category chips row: unchanged (fits).
- Column-header row: hidden on mobile. Sorting is not available on mobile (default logged-order). The full/discounted cost toggle is preserved as a small right-aligned chip rendered above the list, shown only on mobile (CSS-toggled visibility, both elements always in DOM).
- Rows → cards. Same DOM; the 6 cells get grid-area classes (`pp-c-reg`, `pp-c-num`, `pp-c-auth`, `pp-c-cat`, `pp-c-date`, `pp-c-cost`). Mobile template:

```
"reg  cost"
"num  cat"
"auth auth"
"date date"
```

Card: 1px solid #ece4d4 border, radius 10px, background #fffdf8, padding ~12px 14px, 10px gap between cards. Cost right-aligned, category chip `justify-self:end`. Authority keeps existing ellipsis. `newId` highlight background still works (it's inline background on the row).

### Add a PCN (capture)
- `.pp-cap-grid`: desktop `340px 1fr` → mobile single column (image/options first in DOM, then panel).
- Idle stage: camera + upload tiles full width (already a column).
- Draft stage: image preview capped on mobile — `max-height:220px; object-fit:contain` (thumbnail reminder; full image lives in detail view). Check & save panel below it.
- Check & save fields grid: `1fr 1fr` → single column on mobile. `gridColumn:"span 2"` inline styles on driver/notes replaced by `pp-span2` class (desktop `grid-column:span 2`, mobile `auto`). Category segmented control full width (already flex:1 halves).
- SAVE TO REGISTER button grows on mobile (flex:1, centered text); Discard stays beside it in the same row. Panel padding 20px 22px → 16px.

### Detail
- `.pp-detail-grid`: `1.25fr 1fr` → single column (record card first, image second).
- Read-only "stored record" grid: **stays 2-col on mobile** (short values, keeps page compact).
- Edit inputs grid: 2-col → single column on mobile; notes uses `pp-span2`.
- Back-row (← register / reg / chip) wraps naturally; no change expected.

### Reset-register dialog
- Width already `min(440px,90vw)`. Add: overlay padding 16px (never touches screen edge), panel `max-height:85vh; overflow:auto`.

## Non-goals

- No sorting UI on mobile register.
- No image zoom/lightbox.
- No Tailwind/CSS-module migration.
- Desktop rendering must remain visually identical.

## Testing

No visual test infra. Verification:

1. `npm run build` passes; `npm test` (vitest) stays green — no logic touched.
2. Manual browser pass (dev server, device emulation) at 390px and 1280px:
   - 1280px: all screens pixel-identical to before.
   - 390px: no horizontal scroll on any screen; navbar one row with icon buttons; register cards render per template; capture + check & save single column, inputs 16px (no iOS zoom); detail single column; reset dialog fits with margin.
3. Viewport meta: rely on Next.js App Router default (`width=device-width, initial-scale=1`); confirm present in page source during the manual pass.
