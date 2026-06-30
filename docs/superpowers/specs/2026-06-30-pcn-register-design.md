# PCN Register — Design Spec

**Date:** 2026-06-30
**Product name:** PCN Register (Careco). Replaces the prototype's "Recovery Desk" naming.
**Status:** Approved design, pending spec review → implementation plan.

## 1. Summary

A web app for Careco to track parking charge notices (PCNs), replacing a shared
spreadsheet. A Postgres database is the source of truth. The existing Excel file is
the one-time **import** seed and an on-demand **export** that must look **byte-for-byte
identical** to the original in layout and styling. New PCNs are added by photographing
the notice; a vision model auto-fills the fields for review before saving.

**Terminology:** user-facing copy says **"PCN"**, never "letter" — e.g. "Add PCN",
"No PCNs match", "10 PCNs logged", "PCN on file", "Reading the PCN…", "Take a photo of the PCN".

Builds on the already-implemented, de-framed front end (register / detail / capture
prototype ported to Next.js). This spec adds: database, auth, OCR add-flow, and the
identical-format Excel export, and rebrands "Recovery Desk" → "PCN Register".

## 2. Goals / non-goals

**Goals**
- DB-backed register (browse, search, filter, sort, view, **edit**, add).
- Add-a-letter via photo/upload → Claude Haiku vision OCR → confirm → save (image stored).
- Export an `.xlsx` that is visually identical to `careco-pcn-tracker.xlsx`, with current data.
- Single shared-password gate (UK GDPR: personal data on a public URL).
- Deploy on Vercel.

**Non-goals (v1)**
- Per-user accounts / roles / per-user audit trail.
- Writing back into the original iCloud file in place (export is download-and-replace).
- Real-time multi-user conflict resolution.
- Dedicated mobile responsive redesign (desktop-first, as the prototype is).
- Extracting the **driver name** from the image (deliberately excluded — name-only GDPR posture).

## 3. Source data — `careco-pcn-tracker.xlsx`

Three sheets:

- **`Private`** — `A1:I27`, 9 columns.
- **`Council`** — `A1:M73`, 13 columns; frozen header row (`ySplit=1`), autofilter
  (`_xlnm._FilterDatabase` = `Council!$A$1:$M$17`).
- **`metadata`** — `A1:C5`, dropdown option lists for the three "paid?" columns.

Styling to preserve on export:
- Number format `164` = `"£"#,##0.00` (cost cells).
- Date number format `14` (date cells; values stored as Excel serials).
- Bold header row (font id 1); data rows default (Aptos Narrow 12).
- Frozen header + autofilter (Council); 18 `dxf` conditional-formatting rules.
- Custom per-column widths; the entire `metadata` sheet and its dropdowns.

## 4. Decisions (locked)

| Area | Decision |
|---|---|
| Source of truth | **Neon Postgres** (Vercel Marketplace). Excel = import seed + identical export. |
| Hosting | Vercel (Next.js App Router). |
| ORM | **Drizzle** (lightweight, serverless-friendly). |
| Image storage | **Vercel Blob** (`@vercel/blob`); URL stored on the record. |
| OCR | **Official Anthropic SDK** (`@anthropic-ai/sdk`), model **`claude-haiku-4-5`**, vision + structured outputs (`messages.parse()` with a JSON schema). **No `effort`/`thinking` params** (unsupported on Haiku 4.5). |
| Auth | Single shared password → signed httpOnly cookie set by `/login`; Next middleware redirects unauthenticated requests. No external auth dependency. |
| Export fidelity | **Template round-trip** (surgical XML edit). See §7. |

Rejected for export: ExcelJS (doesn't round-trip conditional formatting / autofilter /
extensions faithfully) and SheetJS community/from-scratch (can't write styles).

## 5. Architecture

```
Next.js App Router (Vercel)
  middleware.ts ........ shared-password gate → redirect to /login when no valid cookie
  /login ............... password form → sets signed httpOnly cookie
  / ................... register: search / filter (All/Council/Private) / sort  — reads DB
  /letter/[id] ........ detail + inline edit (status, paid? fields, notes, etc.) — reads/writes DB
  /add ................ capture: upload/snap → Blob → Haiku OCR → confirm form → save DB
  /api/export ......... template round-trip → streams identical .xlsx
  scripts/import.ts .... one-time: parse careco-pcn-tracker.xlsx (SheetJS) → seed DB

Data:   Neon Postgres via Drizzle
Images: Vercel Blob
OCR:    @anthropic-ai/sdk · claude-haiku-4-5 · vision + structured outputs
```

## 6. Data model + Excel mapping

Single `pcn` table; `category` (`council` | `private`) discriminates the two sheets.
Costs stored as **integer pence**; dates as `date`. Conversions happen at import/export.

| DB column | Type | Private col | Council col |
|---|---|---|---|
| `id` | uuid pk | — | — |
| `sort_seq` | bigint | (import order) | (import order) |
| `category` | enum council/private | (sheet) | (sheet) |
| `pcn_number` | text | A PCN | A PCN |
| `authority` | text | B Council/company | B Council/company |
| `vehicle_reg` | text | C Vehicle registration | C Vehicle registration |
| `cost_pence` | int null | D Cost of PCN | — |
| `full_cost_pence` | int null | — | D Full cost |
| `discounted_cost_pence` | int null | — | E Discounted cost |
| `date_of_pcn` | date null | E | F |
| `discount_period_days` | int null | F | G |
| `driver_name` | text null | G | H |
| `ali_paid` | text null | — | I Ali paid? |
| `money_requested` | text null | — | J Money requested from driver? |
| `driver_paid` | text null | — | K Driver paid? |
| `status` | text null | H | L |
| `notes` | text null | I | M |
| `image_url` | text null | (app-only) | (app-only) |
| `created_at` / `updated_at` | timestamptz | (app-only) | (app-only) |

- `sort_seq` preserves the original sheet row order on import; new PCNs get `max+1`.
  Export orders by it (oldest→newest), so additions append at the bottom.
- The three "paid?" fields are stored as text to round-trip mixed values (`30`, `40`,
  `Yes`, `No`, `N/A`); on export, numeric-looking values are written as number cells,
  others as strings (matching the original cell types).
- `status` is free text (values are open-ended: `Paid`, `Canceled`, `Appeal submitted 09/05`…).
- Dropdown option presets for the paid? fields come from the `metadata` sheet, seeded as
  constants for the edit UI.

## 7. Export — template round-trip (the crux)

The original `careco-pcn-tracker.xlsx` ships in the repo as `templates/pcn-template.xlsx`.
`/api/export`:

1. Read the template bytes; unzip in memory (the xlsx is a zip).
2. For `Private` (sheet1) and `Council` (sheet2): **regenerate only `<sheetData>`**:
   - Keep row 1 (header) exactly as the template.
   - Emit one `<row>` per DB record **ordered by `sort_seq` ascending (oldest→newest; newly
     added PCNs append at the bottom)**, cells in the sheet's column order.
   - Per-cell type + **reuse the template's style index** for that column:
     - cost columns → currency style (`s` of the original cost cells), value = pence ÷ 100 as number.
     - date column → date style, value = Excel serial (epoch 1899-12-30; `serial = days since`).
     - paid? columns → number cell if value parses numeric, else inline string.
     - all other columns → default style, inline string (or empty for null).
   - Use **inline strings** (`t="inlineStr"`) to avoid maintaining the shared-strings table.
3. **Bump row-count-dependent references** to the new last row N:
   - sheet `<dimension ref>`; `<autoFilter ref>` (Council); the workbook
     `_xlnm._FilterDatabase` defined name; every `<conditionalFormatting sqref>` and
     `<dataValidation sqref>` whose range is row-bounded.
4. Copy **every other part byte-for-byte** (`styles.xml`, `theme1.xml`, `metadata` sheet,
   `[Content_Types].xml`, rels, column widths, frozen panes, fonts…).
5. Re-zip; stream as a download (`Content-Disposition: attachment`).

This guarantees identical styling — only the data cells and the necessary range extents change.

## 8. Flows

**Register / detail / edit.** Existing UI, reading the DB. Council rows show full + discounted
cost and the paid?/status columns; private rows show the single cost. Detail view supports
inline editing of status, the paid? fields, notes, and other fields (active tracker, not read-only).

**Add a PCN (OCR).** Upload/snap → image to Vercel Blob → send image (base64/URL) to
`claude-haiku-4-5` with a JSON schema for the PCN fields → structured result populates the
existing confirm-draft form → user corrects → save to DB (with `image_url`). PCN-number dedupe
flags already-logged PCNs (prototype behavior). **Driver name is never read from the image.**
OCR failure → fall straight through to the manual form; never blocks a save.

**Export.** `/api/export` → §7 → identical `.xlsx` download.

## 9. Auth

- `LOGIN_PASSWORD` env var (the shared secret) + `AUTH_SECRET` for signing.
- `/login` posts the password; on match, set a signed httpOnly, Secure, SameSite=Lax cookie.
- `middleware.ts` validates the cookie on all routes except `/login` and static assets; redirects otherwise.
- `/api/export` and OCR endpoints are behind the same gate.

## 10. Error handling & testing

- **Export fidelity test (key):** import → export → unzip both → assert every archive part
  **except** the two `sheetData` blobs **and the row-count-dependent range references** (§7.3)
  is byte-identical; assert `sheetData` and the bumped ranges match expected. Round-trip:
  import → export → re-import → all values equal. Plus a manual open in Excel/LibreOffice.
- Unit tests: pounds↔pence, Excel-serial↔date, per-column cell-type/style mapping, XML escaping,
  range-bumping math.
- OCR: mocked model in tests; schema-validated output; graceful fallback to manual entry.
- Auth: unauthenticated request → redirect to `/login`.

## 11. Environment / credentials (needed at build time)

- `DATABASE_URL` — Neon (Vercel Marketplace integration).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob.
- `ANTHROPIC_API_KEY` — Claude (Haiku) OCR.
- `LOGIN_PASSWORD`, `AUTH_SECRET` — shared-password auth.

## 12. Existing-code changes (rebrand)

In the already-built component (`components/pcn-portal.tsx`) and layout:
- App-bar title "Recovery Desk" → "**PCN Register**".
- Logo monogram "RD" → "PCN".
- `app/layout.tsx` `<title>`/metadata → "PCN Register — Careco".
- Subtitle "CARECO · PCN REGISTER" already correct; keep.
- Copy pass "letter"→"PCN": `ADD LETTER`→`ADD PCN`, `Add a letter`→`Add a PCN`,
  `… letters logged`→`… PCNs logged`, `No letters match…`→`No PCNs match…`,
  `LETTER ON FILE`→`PCN ON FILE`, `Reading the letter…`→`Reading the PCN…`,
  `Take a photo of the letter`→`Take a photo of the PCN`, `no letter image`→`no PCN image`.

## 13. Resolved decisions

- Export ranges (autofilter / conditional-formatting / data-validation): **extend** to all rows.
- Export row order: **oldest→newest** (newest at the bottom) via `sort_seq`; the register UI stays newest-first.
- Existing rows: **full edit, no delete** in v1.
- Import: **one-time script** (no admin re-import button).
- UI terminology: **"PCN"**, never "letter" (see §1, §12).
