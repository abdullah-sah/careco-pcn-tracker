# Excel Reset-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload the register `.xlsx` in the app and atomically reset the DB to exactly the file's contents, re-attaching letter images by PCN number.

**Architecture:** Two new server actions in `app/actions.ts` (`previewReset` parse-only → counts; `resetFromXlsx` → atomic `db.batch([delete, insert])`), reusing the existing `parseWorkbook()`. Image re-attach is a pure, unit-tested function in `lib/pcn/`. UI is an IMPORT XLSX button in the portal app bar + fixed-overlay confirm dialog.

**Tech Stack:** Next.js 15 App Router server actions, drizzle-orm `^0.45.2` on neon-http (`db.batch` = single transaction), vitest, existing `lib/xlsx/import.ts` parser.

**Spec:** `docs/superpowers/specs/2026-07-04-excel-reset-import-design.md`

## Global Constraints

- User-facing copy says **"PCN"**, never "letter" (except "Letter images" per approved dialog copy below).
- Upload cap: **5 MB** (both actions).
- Wipe+insert must be **atomic** — a mid-way failure leaves the register untouched. neon-http runs `db.batch([...])` as one transaction.
- Server actions must **return** `{ ok: false, error }` instead of throwing — Next.js masks thrown error messages in production.
- Image re-attach: match on trimmed, lowercased PCN number; skip blank numbers; first wins on duplicates; unmatched → `imageUrl: null`.
- 0-row file is allowed (register wiped to empty) — guard the empty `insert` (drizzle rejects empty `values()`).
- Commit messages: concise, no mention of AI tooling.

---

### Task 1: `reattachImages` pure function

**Files:**
- Create: `lib/pcn/reattach-images.ts`
- Test: `lib/pcn/reattach-images.test.ts`

**Interfaces:**
- Consumes: `PcnRow` from `lib/pcn/types.ts` (existing).
- Produces: `reattachImages(rows: PcnRow[], existing: ExistingImageRef[]): (PcnRow & { imageUrl: string | null })[]` and `interface ExistingImageRef { pcnNumber: string; imageUrl: string | null }` — Task 2 imports both from `@/lib/pcn/reattach-images`.

- [ ] **Step 1: Write the failing test**

Create `lib/pcn/reattach-images.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reattachImages } from "./reattach-images";
import type { PcnRow } from "./types";

function row(pcnNumber: string): PcnRow {
  return {
    sortSeq: 1, category: "council", pcnNumber, authority: "Ealing", vehicleReg: "AB12 CDE",
    costPence: null, fullCostPence: 13000, discountedCostPence: 6500, dateOfPcn: "2026-06-01",
    discountPeriodDays: 14, driverName: null, aliPaid: null, moneyRequested: null,
    driverPaid: null, status: null, notes: null,
  };
}

describe("reattachImages", () => {
  it("attaches imageUrl where PCN number matches", () => {
    const out = reattachImages([row("WE111")], [{ pcnNumber: "WE111", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBe("blob://a");
  });
  it("leaves imageUrl null when unmatched", () => {
    const out = reattachImages([row("WE111")], [{ pcnNumber: "ZZ999", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBeNull();
  });
  it("matches case-insensitively and trims whitespace", () => {
    const out = reattachImages([row("  we111 ")], [{ pcnNumber: "WE111", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBe("blob://a");
  });
  it("never matches blank PCN numbers", () => {
    const out = reattachImages([row("   ")], [{ pcnNumber: "  ", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBeNull();
  });
  it("skips existing entries with null imageUrl", () => {
    const out = reattachImages([row("WE111")], [{ pcnNumber: "WE111", imageUrl: null }]);
    expect(out[0].imageUrl).toBeNull();
  });
  it("first wins on duplicate existing PCN numbers", () => {
    const out = reattachImages(
      [row("WE111")],
      [{ pcnNumber: "WE111", imageUrl: "blob://first" }, { pcnNumber: "WE111", imageUrl: "blob://second" }],
    );
    expect(out[0].imageUrl).toBe("blob://first");
  });
  it("preserves all row fields", () => {
    const r = row("WE111");
    const out = reattachImages([r], []);
    expect(out[0]).toEqual({ ...r, imageUrl: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pcn/reattach-images.test.ts`
Expected: FAIL — cannot resolve `./reattach-images` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `lib/pcn/reattach-images.ts`:

```ts
import type { PcnRow } from "./types";

export interface ExistingImageRef {
  pcnNumber: string;
  imageUrl: string | null;
}

const key = (pcnNumber: string) => pcnNumber.trim().toLowerCase();

/** Carry imageUrl over from the old rows onto freshly-parsed file rows, by PCN number. */
export function reattachImages(
  rows: PcnRow[],
  existing: ExistingImageRef[],
): (PcnRow & { imageUrl: string | null })[] {
  const map = new Map<string, string>();
  for (const e of existing) {
    const k = key(e.pcnNumber);
    if (!k || e.imageUrl == null) continue;
    if (!map.has(k)) map.set(k, e.imageUrl); // first wins
  }
  return rows.map((r) => ({ ...r, imageUrl: map.get(key(r.pcnNumber)) ?? null }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/pcn/reattach-images.test.ts`
Expected: PASS — 7 tests.

Run: `npm test`
Expected: full suite PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add lib/pcn/reattach-images.ts lib/pcn/reattach-images.test.ts
git commit -m "feat: add reattachImages helper for xlsx reset"
```

---

### Task 2: `previewReset` / `resetFromXlsx` server actions

**Files:**
- Modify: `app/actions.ts` (currently 50 lines — append after `updatePcn`)

**Interfaces:**
- Consumes: `parseWorkbook(buf: Uint8Array): PcnRow[]` from `@/lib/xlsx/import`; `reattachImages`, `ExistingImageRef` from Task 1; `getAllPcns(): Promise<PcnView[]>` from `@/db/queries`.
- Produces (Task 3 imports these from `@/app/actions`):
  - `previewReset(fd: FormData): Promise<ResetPreview>`
  - `resetFromXlsx(fd: FormData): Promise<ResetResult>`
  - `export type ResetPreview = { ok: true; fileRows: number; privateCount: number; councilCount: number; currentRows: number } | { ok: false; error: string }`
  - `export type ResetResult = { ok: true; pcns: PcnView[] } | { ok: false; error: string }`

No DB-backed test infra exists (all existing tests are pure functions), so this task is typecheck + suite, verified end-to-end in Task 4. The actions are thin glue over `parseWorkbook` (tested) and `reattachImages` (Task 1).

- [ ] **Step 1: Update imports in `app/actions.ts`**

Replace the existing import block (lines 3–8):

```ts
import { eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pcn } from "@/db/schema";
import { getAllPcns } from "@/db/queries";
import { toView, type PcnView } from "@/lib/pcn/view";
import type { Category, PcnRow } from "@/lib/pcn/types";
import { parseWorkbook } from "@/lib/xlsx/import";
import { reattachImages } from "@/lib/pcn/reattach-images";
```

- [ ] **Step 2: Append the two actions at the end of `app/actions.ts`**

```ts
const MAX_XLSX_BYTES = 5 * 1024 * 1024;

export type ResetPreview =
  | { ok: true; fileRows: number; privateCount: number; councilCount: number; currentRows: number }
  | { ok: false; error: string };

export type ResetResult = { ok: true; pcns: PcnView[] } | { ok: false; error: string };

// Not exported: in a "use server" file every runtime export must be an action.
async function rowsFromUpload(fd: FormData): Promise<PcnRow[]> {
  const f = fd.get("file");
  if (!(f instanceof File)) throw new Error("No file uploaded.");
  if (f.size > MAX_XLSX_BYTES) throw new Error("File too large (max 5 MB).");
  return parseWorkbook(Buffer.from(await f.arrayBuffer()));
}

function parseError(e: unknown): string {
  return e instanceof Error ? e.message : "Couldn't read that file.";
}

export async function previewReset(fd: FormData): Promise<ResetPreview> {
  try {
    const rows = await rowsFromUpload(fd);
    const privateCount = rows.filter((r) => r.category === "private").length;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(pcn);
    return {
      ok: true,
      fileRows: rows.length,
      privateCount,
      councilCount: rows.length - privateCount,
      currentRows: n,
    };
  } catch (e) {
    return { ok: false, error: parseError(e) };
  }
}

export async function resetFromXlsx(fd: FormData): Promise<ResetResult> {
  let rows: PcnRow[];
  try {
    rows = await rowsFromUpload(fd);
  } catch (e) {
    return { ok: false, error: parseError(e) };
  }
  try {
    const existing = await db
      .select({ pcnNumber: pcn.pcnNumber, imageUrl: pcn.imageUrl })
      .from(pcn)
      .where(isNotNull(pcn.imageUrl));
    const records = reattachImages(rows, existing);
    // neon-http runs a batch as a single transaction: wipe + insert commit or fail together.
    if (records.length > 0) {
      await db.batch([db.delete(pcn), db.insert(pcn).values(records)]);
    } else {
      await db.batch([db.delete(pcn)]);
    }
  } catch (e) {
    console.error("resetFromXlsx failed:", e);
    return { ok: false, error: "Reset failed — register unchanged." };
  }
  revalidatePath("/");
  try {
    return { ok: true, pcns: await getAllPcns() };
  } catch {
    return { ok: false, error: "Reset done, but refreshing failed — reload the page." };
  }
}
```

Note: `previewReset` returns counts only — it must not write. `resetFromXlsx` re-parses the re-sent file (spec: file is ~50 KB, double upload accepted).

- [ ] **Step 3: Typecheck and run suite**

Run: `npx tsc --noEmit`
Expected: no errors. (If `db.batch` fails to typecheck, the neon-http import in `db/index.ts` is correct and drizzle is `^0.45.2` — batch is supported; fix the call shape, do not fall back to sequential statements.)

Run: `npm test`
Expected: full suite PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add previewReset/resetFromXlsx server actions"
```

---

### Task 3: Portal UI — import button, confirm dialog, error strip

**Files:**
- Modify: `components/pcn-portal.tsx`

**Interfaces:**
- Consumes: `previewReset`, `resetFromXlsx`, `ResetPreview` from `@/app/actions` (Task 2 signatures above).
- Produces: user-visible flow only.

- [ ] **Step 1: Imports + state**

Line 3 — add `useRef`:

```ts
import React, { useCallback, useRef, useState } from "react";
```

Line 6 — extend the actions import:

```ts
import { createPcn, updatePcn, previewReset, resetFromXlsx } from "@/app/actions";
```

In `interface State` (after the `error: string | null;` line 69), add:

```ts
  importStage: "idle" | "parsing" | "confirm" | "resetting";
  importPreview: { fileRows: number; privateCount: number; councilCount: number; currentRows: number } | null;
  importError: string | null;
```

In the `useState<State>` initializer (line 74–79), extend the object:

```ts
    draft: null, edit: {}, saving: false, error: null,
    importStage: "idle", importPreview: null, importError: null,
```

- [ ] **Step 2: Handlers**

After the `saveEdit` block (ends line 172), add:

```ts
  /* import / reset from xlsx */
  const importFileRef = useRef<File | null>(null);
  const toFd = (f: File) => { const fd = new FormData(); fd.append("file", f); return fd; };
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f || state.importStage !== "idle") return;
    importFileRef.current = f;
    update({ importStage: "parsing", importError: null });
    const res = await previewReset(toFd(f));
    if (res.ok) update({ importStage: "confirm", importPreview: res });
    else { importFileRef.current = null; update({ importStage: "idle", importError: res.error }); }
  };
  const cancelImport = () => {
    if (state.importStage === "resetting") return;
    importFileRef.current = null;
    update({ importStage: "idle", importPreview: null, importError: null });
  };
  const confirmReset = async () => {
    const f = importFileRef.current;
    if (!f || state.importStage === "resetting") return;
    update({ importStage: "resetting", importError: null });
    const res = await resetFromXlsx(toFd(f));
    if (res.ok) {
      importFileRef.current = null;
      update({ pcns: res.pcns, importStage: "idle", importPreview: null, importError: null, view: "register", selectedId: null, newId: null, error: null });
      router.refresh();
    } else {
      update({ importStage: "confirm", importError: res.error }); // keep dialog open, show error, allow retry/cancel
    }
  };
```

- [ ] **Step 3: App-bar button**

In the app bar (line 212), insert the import label **before** the export `<a>` so the pair reads IMPORT · EXPORT:

```tsx
          <div style={css("display:flex;align-items:center;gap:14px")}>
            <label style={css(`font:700 11px 'Spline Sans Mono';letter-spacing:.5px;color:#6a6155;background:#fffdf8;border:1.5px solid #e2dbcd;padding:8px 13px;border-radius:9px;cursor:pointer${state.importStage === "parsing" ? ";opacity:.6" : ""}`)}>
              {state.importStage === "parsing" ? "READING…" : "↥ IMPORT XLSX"}
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onImportFile} disabled={state.importStage !== "idle"} style={{ display: "none" }} />
            </label>
            <a href="/api/export" style={css("text-decoration:none;font:700 11px 'Spline Sans Mono';letter-spacing:.5px;color:#6a6155;background:#fffdf8;border:1.5px solid #e2dbcd;padding:8px 13px;border-radius:9px;cursor:pointer")}>↧ EXPORT XLSX</a>
```

- [ ] **Step 4: Error strip**

Immediately after `<main style={css("max-width:1020px;margin:0 auto")}>` (line 221), add — shows import failures when no dialog is open (visible from any view; import lives in the global app bar):

```tsx
        {state.importError && state.importStage === "idle" && (
          <div style={css("padding:12px 24px 0;color:#9c3327;font:500 11px 'Hanken Grotesk'")}>{state.importError}</div>
        )}
```

- [ ] **Step 5: Confirm dialog overlay**

Just before `</main>` (after the capture view block, line 423), add:

```tsx
        {(state.importStage === "confirm" || state.importStage === "resetting") && state.importPreview && (
          <div style={css("position:fixed;inset:0;background:rgba(33,29,24,.45);display:flex;align-items:center;justify-content:center;z-index:50")}>
            <div style={css("background:#fffdf8;border:1px solid #e2dbcd;border-radius:13px;padding:22px 24px;width:min(440px,90vw);box-shadow:0 12px 40px rgba(33,29,24,.25)")}>
              <div style={css("font:600 16px 'Spectral',serif;margin-bottom:10px")}>Reset register from file?</div>
              <div style={css("font:400 12.5px;color:#6a6155;line-height:1.6")}>
                Replace the {state.importPreview.currentRows} PCN{state.importPreview.currentRows === 1 ? "" : "s"} in the register with {state.importPreview.fileRows} from the file ({state.importPreview.privateCount} private + {state.importPreview.councilCount} council)? Changes made in the app will be lost. Letter images are kept where the PCN number still matches.
              </div>
              {state.importError && <div style={css("color:#9c3327;font:500 11px 'Hanken Grotesk';margin-top:10px")}>{state.importError}</div>}
              <div style={css("display:flex;align-items:center;justify-content:flex-end;gap:16px;margin-top:18px")}>
                <div style={css("font:600 12px 'Hanken Grotesk';color:#8a8175;cursor:pointer")} onClick={cancelImport}>Cancel</div>
                <div style={css(`font:700 12px 'Spline Sans Mono';letter-spacing:.6px;padding:11px 16px;border-radius:8px;cursor:pointer;background:var(--accent,#9c3327);color:#fffdf8;box-shadow:0 3px 0 rgba(120,40,30,.35)${state.importStage === "resetting" ? ";opacity:.6" : ""}`)} onClick={confirmReset}>{state.importStage === "resetting" ? "RESETTING…" : "RESET REGISTER"}</div>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Typecheck + suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/pcn-portal.tsx
git commit -m "feat: import-xlsx reset UI (button, confirm dialog)"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only; fix-forward if a check fails).

**Interfaces:** exercises the full Task 1–3 stack against the real dev DB.

- [ ] **Step 1: Start dev server**

Run: `npm run dev` → http://localhost:3000 (log in with the shared password).

- [ ] **Step 2: Round-trip fidelity check**

1. ↧ EXPORT XLSX → save the file.
2. Open a PCN in the app, change STATUS (e.g. to `e2e-test-edit`), save.
3. ↥ IMPORT XLSX → pick the exported file.
Expected: dialog counts match — "Replace the N PCNs … with N from the file (P private + C council)" where N/P/C match the register before the edit.
4. RESET REGISTER.
Expected: register reloads; the STATUS edit is gone; row count and order unchanged.

- [ ] **Step 3: Image survival check**

1. Pick a PCN that has an image ("PCN on file" shows a photo) — add one via ＋ ADD PCN with photo upload if none exists.
2. ↧ EXPORT XLSX → ↥ IMPORT XLSX the fresh export → RESET REGISTER.
Expected: the same PCN still shows its image (matched by PCN number).

- [ ] **Step 4: In-app row discarded check**

1. ＋ ADD PCN → manual entry → save (this PCN is not in the file).
2. ↥ IMPORT XLSX with the previously exported file → RESET REGISTER.
Expected: the manually added PCN is gone; register matches the file.

- [ ] **Step 5: Bad-file check**

1. ↥ IMPORT XLSX → pick any non-register file (e.g. a `.xlsx` without Private/Council sheets, or rename a `.png` to `.xlsx`).
Expected: no dialog; red error strip under the app bar (e.g. `Workbook missing "Private" sheet`); register untouched.
2. Cancel path: pick the good file → dialog appears → Cancel.
Expected: dialog closes, nothing changes.

- [ ] **Step 6: Confirm all checks pass**

All five checks green = feature complete. Report any failure with the observed behavior instead of marking done.

---

## Self-review (done at plan time)

- **Spec coverage:** UX flow §3 → Task 3; server §4 → Task 2; edge cases §5 (0-row → `records.length` guard; missing sheets → parse-error path + Task 4 step 5; dup numbers → Task 1 tests; empty insert → guard) — covered. Testing §6 → Tasks 1 & 4. Known limitations §7 need no code.
- **Type consistency:** `ResetPreview`/`ResetResult`/`reattachImages`/`ExistingImageRef` names and shapes match across Tasks 1–3.
- **No placeholders.**
