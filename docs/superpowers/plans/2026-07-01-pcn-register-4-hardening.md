# PCN Register — Plan 4: Post-Launch Hardening (optional)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. These tasks are **independent** — pick any subset in any order. Each ends with an independently testable deliverable.

**Goal:** Address the non-blocking findings from the final whole-branch review and the rolled-up per-task Minors. None of these block launch (the app shipped in Plan 3); they harden security, correctness, UX, and test coverage.

**Architecture:** Small, isolated changes on the existing codebase (head `ff16949`). No new subsystems.

**Tech Stack:** Next.js 15 · Drizzle/Neon · `@vercel/blob` · `@anthropic-ai/sdk` · Vitest.

## Current State (zero prior context)

The app is fully built, reviewed, and (per Plan 3) deployed. `npx vitest run` → 25 passing. See Plan 3's "Current State" + "Environment nuances" sections for the map and the critical env details (secrets in `.env.development.local`; `next build` needs `DATABASE_URL` injected locally; Neon migrations use the unpooled URL). Full architecture is in the Plan 1 and Plan 2 docs.

## Global Constraints

- Costs are integer **pence** in the DB; dates ISO `YYYY-MM-DD`. Product noun is **"PCN"**, never "letter".
- Don't regress the identical-format export or the auth gate. Run `npx vitest run` (25+ passing) before every commit.
- Never commit `.env*`.

## Priority order (suggested)

1. Task 1 — Private Blob + gated image fetch (**security**, the review's one Important follow-up beyond the shipped `hasImage` fix)
2. Task 2 — Blob upload error handling (don't silently lose an image)
3. Task 3 — Image-proxy SSRF guard
4. Task 4 — Atomic `sortSeq` allocation (create race)
5. Task 5 — Guard `.returning()[0]` in server actions
6. Task 6 — Broaden exporter test coverage
7. Task 7 — Save-failure UI feedback (UX)
8. Task 8 — Cosmetic cleanups (dead code, casts, import order)
9. Task 9 — (optional) Column-A conditional-formatting extension on appended rows — **user already accepted current behavior**

---

### Task 1: Private Blob store + auth-gated image fetch

The shipped `hasImage` fix already stops raw Blob URLs from reaching the client. This task closes the rest of the review's follow-up: make the Blob store **private** so the stored URL is not publicly fetchable at all — the auth-gated proxy fetches it server-side with credentials.

**Files:**
- Modify: `app/api/ocr/route.ts` (the `put(...)` call)
- Modify: `app/api/pcn-image/[id]/route.ts` (the upstream fetch)

**Interfaces:**
- Consumes: `db`, `pcn` (`@/db`), `@vercel/blob`.
- Produces: images stored with private access; the proxy streams them for an authed request; a missing/again-unreachable image → 404.

- [ ] **Step 1: Confirm the current `@vercel/blob` private API**

Private Blob is a recent feature; confirm the exact call shape before coding. Use the `vercel:vercel-storage` skill (or `npm docs @vercel/blob` / the installed `node_modules/@vercel/blob` types) to confirm: (a) how `put` marks an object private (e.g. an `access: "private"` option), and (b) how to read it back server-side (an authenticated download helper or a short-lived signed URL from the store token). Record the exact functions/options you'll use in your report.

- [ ] **Step 2: Store new uploads privately**

In `app/api/ocr/route.ts`, change the `put(...)` options so the object is private (per Step 1's confirmed API). Keep the returned `blob.url` stored in `pcn.imageUrl` as today (the proxy resolves it). Do not change the response shape (`{ imageUrl, extracted }`).

- [ ] **Step 3: Fetch privately in the proxy**

In `app/api/pcn-image/[id]/route.ts`, replace the plain `fetch(row.url)` with the confirmed authenticated read (signed URL or SDK download using `BLOB_READ_WRITE_TOKEN`). Preserve the current contract: look up `pcn.imageUrl` by `id`; 404 when the row/url is missing or the upstream read fails; stream the bytes with the upstream `Content-Type` and `Cache-Control: private, max-age=3600`; `runtime = "nodejs"`.

- [ ] **Step 4: Verify (manual, needs `BLOB_READ_WRITE_TOKEN`)**

```bash
node -e "require('dotenv').config({path:'.env.development.local'}); require('child_process').execSync('npx next build',{stdio:'inherit'})"   # builds
PORT=3217 npm run dev & sleep 5
COOKIE=$(node -e "require('dotenv').config({path:'.env.development.local'}); const {createHmac}=require('crypto'); const p='authed:v1'; console.log('pcn_session='+p+'.'+createHmac('sha256',process.env.AUTH_SECRET).update(p).digest('hex'))")
```
Add a PCN with an image in the browser (or via the OCR curl in Plan 3 Task 2 Step 6), then: opening the PCN's detail shows the image via `/api/pcn-image/<id>` (200, with cookie), and the raw stored Blob URL returns 403/unauthorized when fetched directly without credentials. `kill %1` when done.

- [ ] **Step 5: Commit**

```bash
git add app/api/ocr/route.ts app/api/pcn-image/[id]/route.ts
git commit -m "feat: private Blob storage with auth-gated server-side image fetch"
```

---

### Task 2: Blob upload error handling

Today `app/api/ocr/route.ts` wraps only `extractPcn` in try/catch; a `put(...)` failure throws and 500s the route, so the client's `.catch` drops to an empty manual draft and silently loses the image.

**Files:**
- Modify: `app/api/ocr/route.ts`

- [ ] **Step 1: Wrap the upload and return a typed failure**

Wrap the `put(...)` call in try/catch. On failure, return `Response.json({ imageUrl: null, extracted: <all-null Extracted>, error: "upload_failed" }, { status: 200 })` (200 so the client can still open a manual draft, but with an explicit signal). Keep the success path unchanged.

- [ ] **Step 2: Surface it in the client (optional, pairs with Task 7)**

In `components/pcn-portal.tsx`'s `onFile` handler, if the response has `error`, set a capture-error message in state instead of silently proceeding. (If doing Task 7, use its error channel.)

- [ ] **Step 3: Verify**

`npx vitest run` (25 passing) and `npx tsc --noEmit` clean. Manually: temporarily point `BLOB_READ_WRITE_TOKEN` at an invalid value, upload → the UI shows an upload error rather than a blank draft. Restore the token.

- [ ] **Step 4: Commit**

```bash
git add app/api/ocr/route.ts components/pcn-portal.tsx
git commit -m "fix: handle Blob upload failure without silently dropping the image"
```

---

### Task 3: Image-proxy SSRF guard

`app/api/pcn-image/[id]/route.ts` fetches whatever URL is stored in `pcn.imageUrl`. Values come from our own OCR route, but an authed user could pass an arbitrary `imageUrl` to `createPcn`. Restrict the proxy to Vercel Blob hosts.

**Files:**
- Modify: `app/api/pcn-image/[id]/route.ts`

- [ ] **Step 1: Validate the host before fetching**

Before fetching `row.url`, parse it and confirm the hostname ends with `.public.blob.vercel-storage.com` (public) or the private Blob host you adopt in Task 1 (e.g. `.blob.vercel-storage.com`). If it doesn't match, return `404` (don't reveal the stored value). Only then fetch/stream.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` clean; the browser image flow still works (valid Blob URLs pass). `npx vitest run` 25 passing.

- [ ] **Step 3: Commit**

```bash
git add app/api/pcn-image/[id]/route.ts
git commit -m "fix: restrict image proxy to Vercel Blob hosts (SSRF guard)"
```

---

### Task 4: Atomic `sortSeq` allocation

`db/queries.ts` `nextSortSeq()` does `SELECT coalesce(max(sort_seq),0)` then `app/actions.ts` inserts — non-atomic, and `sort_seq` has no unique constraint, so two concurrent creates could collide (only affects export tie-break ordering; negligible for single-user, but cheap to fix).

**Files:**
- Modify: `app/actions.ts` (`createPcn`)
- (Delete `nextSortSeq` from `db/queries.ts` if no longer used, or keep it — check callers first.)

**Interfaces:**
- Consumes: `db`, `pcn` (`@/db`, `@/db/schema`), `sql` (drizzle-orm).

- [ ] **Step 1: Compute `sort_seq` inside the INSERT**

In `createPcn`, replace the `await nextSortSeq()` + `insert({...input, sortSeq})` pair with a single INSERT that sets `sort_seq` from a subquery so the read and write are one statement:
```ts
const [row] = await db
  .insert(pcn)
  .values({ ...input, sortSeq: sql`(select coalesce(max(${pcn.sortSeq}), 0) + 1 from ${pcn})` })
  .returning();
```
(Import `sql` from `drizzle-orm` if not already imported in `app/actions.ts`.) This removes the SELECT-then-INSERT window. If `nextSortSeq` has no other callers after this, delete it from `db/queries.ts` and its import.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` clean; `npx vitest run` 25 passing. Manually: add two PCNs in the browser; both get distinct increasing `sort_seq` (visible as export order).

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts db/queries.ts
git commit -m "fix: allocate sort_seq atomically inside the insert"
```

---

### Task 5: Guard `.returning()[0]` in server actions

`createPcn`/`updatePcn` do `const [row] = await db...returning()`. For `updatePcn` with a non-existent id, `row` is `undefined` and `toView(undefined)` throws an opaque error.

**Files:**
- Modify: `app/actions.ts`

- [ ] **Step 1: Throw a clear error when no row is returned**

After each `.returning()` destructure, add: `if (!row) throw new Error("PCN not found");` (in `updatePcn`; `createPcn` always returns a row but the guard is cheap and consistent). Then `return toView(row)`.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` clean; `npx vitest run` 25 passing.

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "fix: guard empty returning() in create/update server actions"
```

---

### Task 6: Broaden exporter test coverage

The exporter's fidelity is well-covered, but a few assertions from the review are worth adding to `lib/xlsx/export.test.ts` (all pure, no new deps).

**Files:**
- Modify: `lib/xlsx/export.test.ts`

- [ ] **Step 1: Add targeted assertions**

Using the existing `template`/`rows`/`out`/`A`/`B`/`dec` fixtures at the top of the file, add a `describe` with `it`s asserting: (a) a known currency cell's `<v>` equals `penceToPounds` of that row's pence value (pick a specific council row by pcnNumber, find its cell ref, assert the numeric `<v>`); (b) after adding a row, `sheet2.xml` contains `<autoFilter ref="A1:M<last>"`; (c) a default (string) cell like `A2` is emitted with `t="inlineStr"` and **no** `s=` attribute; (d) a value containing `<`/`>` is XML-escaped to `&lt;`/`&gt;`. Write each with `expect(...).toMatch(...)` against `dec(unzipSync(out)["xl/worksheets/sheet2.xml"])` (or a fresh `buildXlsx` for the added-row / escaping cases). Ensure each new assertion actually matches real content (non-trivial).

- [ ] **Step 2: Run to verify pass**

```bash
npx vitest run lib/xlsx/export.test.ts
```
Expected: all pass (the exporter already behaves correctly; these lock it in). Then `npx vitest run` → full suite green.

- [ ] **Step 3: Commit**

```bash
git add lib/xlsx/export.test.ts
git commit -m "test: broaden exporter coverage (numeric value, autoFilter, default-cell style, escaping)"
```

---

### Task 7: Save-failure UI feedback

`capSave` and `saveEdit` in `components/pcn-portal.tsx` swallow errors with `catch { update({ saving: false }); }` — the user gets no indication a save failed.

**Files:**
- Modify: `components/pcn-portal.tsx`

- [ ] **Step 1: Add an error message to state and render it**

Add an `error: string | null` field to the component state (default `null`). In the `catch` blocks of `capSave` and `saveEdit`, set `error` to a short message (e.g. `"Couldn't save — try again."`) alongside `saving: false`. Clear `error` when a save starts. Render the message near the SAVE buttons (detail + capture views) in the existing style (e.g. the accent color used for the login error). Keep everything else unchanged.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` clean; `npx vitest run` 25 passing. Manually force a failure (e.g. stop the DB / invalid env) and confirm the message shows and clears on retry.

- [ ] **Step 3: Commit**

```bash
git add components/pcn-portal.tsx
git commit -m "feat: surface save failures in the PCN Register UI"
```

---

### Task 8: Cosmetic cleanups

Bundle the low-risk nits (no behavior change).

**Files:**
- Modify: `components/pcn-portal.tsx`, `app/api/export/route.ts`, `lib/ocr/extract.ts`, `drizzle.config.ts`, `lib/xlsx/import.ts`

- [ ] **Step 1: Apply the cleanups**

- `components/pcn-portal.tsx`: remove the unused `penceStr` helper (dead code).
- `app/api/export/route.ts`: drop the redundant `as BodyInit` cast on the `buildXlsx(...)` result (`Uint8Array` is a valid `BodyInit`); if `tsc` then complains, keep it.
- `lib/ocr/extract.ts`: replace `media_type: mediaType as any` with a typed union `media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"`.
- `drizzle.config.ts`: move the `config({ path: ".env.development.local" })` call **below** both `import` lines (group imports first) — behavior is identical (ESM hoisting), this is readability only.
- `lib/xlsx/import.ts`: the per-row `r.every(...)` blank-row guard is dead under `blankrows:false` — either remove it or leave a one-line comment noting it's defensive. (Leaving it is fine; remove only if you prefer.)

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean, 25+ passing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: cosmetic cleanups (dead code, casts, import order)"
```

---

### Task 9 (optional): Column-A conditional formatting on appended rows

**The user already accepted the current behavior** (column-A data-bound CF like `A1:A73` is not extended when new PCNs are appended, so app-added rows beyond the current data don't get column-A conditional formatting). Do this ONLY if you want appended rows to inherit that formatting. It touches the exporter's range logic, which is the riskiest code in the project — keep the existing byte-identity guarantees.

**Files:**
- Modify: `lib/xlsx/export.ts` (the range-bump logic), `lib/xlsx/export.test.ts`

- [ ] **Step 1: Surgically extend only data-bound CF ranges**

In `lib/xlsx/export.ts`, add logic that, for `conditionalFormatting` sqref tokens whose end-row equals the **old** last data row (e.g. `A1:A73`, `I1:K73` when the template had 72 data rows), rewrites the end-row to the **new** last row — while leaving full-column ranges (`…1048576`), below-data ranges (`I74:K1048576`), and hand-crafted partial column-M ranges untouched. Do NOT reintroduce the plan's naive `bumpRangeToken` over all CF (it corrupts those other ranges — this is why they're currently left byte-identical; see the Plan 1 Task 5 notes and the existing CF byte-identity test).

- [ ] **Step 2: Update the byte-identity test**

The existing "conditionalFormatting … byte-identical" test asserts same-data export leaves CF unchanged — that still holds (no rows added). Add a new test: after adding a row, the `A1:A<old_last>` CF token becomes `A1:A<new_last>` while a full-column token (`I1:K1048576`) and a below-data token (`I74:K1048576`) are unchanged.

- [ ] **Step 3: Verify**

```bash
npx vitest run lib/xlsx/export.test.ts && npx vitest run
```
Expected: all green (same-data byte-identity preserved; added-row extends only the data-bound CF). Do the Plan 1 Task 5 manual visual check (open a generated xlsx in Excel) to confirm no corruption.

- [ ] **Step 4: Commit**

```bash
git add lib/xlsx/export.ts lib/xlsx/export.test.ts
git commit -m "feat: extend data-bound conditional formatting onto appended rows"
```

---

## Unresolved questions

- Which of Tasks 1–8 do you actually want? (All are non-blocking; Task 1 is the highest-value security item.)
- Task 9: leave as-accepted, or implement? (Only matters once PCNs are added beyond the seeded set and column-A CF visibly matters.)
