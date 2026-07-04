# Excel Reset-Import — Design Spec

**Date:** 2026-07-04
**Status:** Approved design, pending spec review → implementation plan.

## 1. Summary

During the trial period the Excel file (edited by Alan) remains the working source of
truth. This feature lets the user upload that file in the app and **reset the register
to exactly the file's contents**, discarding all in-app changes — except letter images,
which are re-attached by PCN number since the spreadsheet has no image column.

Reuses the existing `parseWorkbook()` (`lib/xlsx/import.ts`), which already parses the
template's `Private` + `Council` sheets into `PcnRow[]` and is covered by tests.

## 2. Goals / non-goals

**Goals**
- Upload `.xlsx` (same template as export) → register matches file exactly: rows,
  values, and order (`sort_seq` from file order, Private then Council).
- Counts-confirm gate before anything is written.
- Atomic replace — a failure mid-reset leaves the register untouched.
- Letter images survive a reset when the PCN number still appears in the file.

**Non-goals**
- Diff/merge sync (file wins wholesale; no field-level reconciliation).
- Cleaning up Blob images whose PCN number vanished from the file (accepted orphans).
- Import history / undo beyond the confirm gate.

## 3. UX flow

1. **↥ IMPORT XLSX** button beside ↧ EXPORT XLSX in the register header
   (`components/pcn-portal.tsx`), same styling. Opens a hidden `.xlsx` file input.
2. File pick → server action `previewReset(formData)` — parse only, no writes.
   Returns `{ fileRows, privateCount, councilCount, currentRows }`.
3. Confirm dialog (portal styling), copy per PCN terminology:
   *"Replace the 40 PCNs in the register with 46 from the file (34 private +
   12 council)? Changes made in the app will be lost. Letter images are kept where
   the PCN number still matches."* — **Cancel** / **Reset**.
4. Confirm → `resetFromXlsx(formData)` (file re-sent; ~50KB, negligible) → returns
   fresh `PcnView[]` → portal replaces its rows state, clears any error, shows the
   register view.
5. Any failure (parse or DB) → existing error banner; DB untouched.

## 4. Server design

Two `"use server"` actions in `app/actions.ts`:

- `previewReset(fd: FormData)` — `fd.get("file")` → `Buffer` → `parseWorkbook` →
  return counts plus current row count. Rejects files > 5 MB.
- `resetFromXlsx(fd: FormData)` —
  1. Parse file (same path as preview, including the 5 MB cap).
  2. Snapshot `pcnNumber → imageUrl` for current rows with a non-null `imageUrl`;
     skip blank PCN numbers; first wins on duplicates.
  3. Re-attach: each incoming row gets `imageUrl = map.get(pcnNumber) ?? null`.
  4. `db.batch([ delete(pcn), insert(pcn).values(records) ])` — neon-http executes
     a batch as a single transaction, so the wipe and insert commit or fail together.
  5. `revalidatePath("/")`, return fresh views (same pattern as `createPcn`).

The image re-attach mapping is a small pure function so it can be unit-tested.

## 5. Edge cases

- **0-row file**: allowed — the confirm dialog shows "replace 40 PCNs with 0";
  file-wins is the contract.
- **Missing `Private`/`Council` sheet, non-xlsx garbage**: `parseWorkbook` throws at
  preview → error banner, no writes. The template's `metadata` sheet is ignored.
- **Duplicate PCN numbers**: old-side first-wins for the image map; every incoming row
  with that number gets the same image URL. Acceptable.
- **Empty insert**: guard `records.length > 0` before including the insert statement
  in the batch (drizzle rejects empty `values()`).

## 6. Testing

- **Unit (vitest)**: image re-attach function — matches by PCN number, skips blanks,
  first-wins on duplicates, null when unmatched. Style of `lib/xlsx/import.test.ts`.
- **Manual e2e**: export → edit a PCN in app → upload the exported file → register
  matches file, edit gone, image still attached; upload a garbage file → error banner,
  register intact; counts in dialog match the file.

## 7. Known limitations

- Blob images for PCNs removed by a reset become unreferenced (never deleted).
  Negligible during trial; revisit if adopted long-term.
- No undo after confirm — the confirm-with-counts dialog is the safety gate.
  ↧ EXPORT XLSX beforehand is the manual backup path.
