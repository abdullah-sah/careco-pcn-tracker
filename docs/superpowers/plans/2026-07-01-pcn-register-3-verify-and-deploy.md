# PCN Register — Plan 3: Verify & Deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to track this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **NOTE:** This plan is ops/verification-heavy (secrets, a live dev server, a browser smoke test, a Vercel deploy) rather than TDD code. Task 3 and parts of Task 4 require a human (browser + Vercel dashboard). Executing **inline** (superpowers:executing-plans) or collaboratively is more natural than dispatching subagents; the automatable checks in Task 2 can be run by a subagent, the manual ones cannot.

**Goal:** Wire up the four runtime secrets, verify the finished app end-to-end (auth + export automatically, OCR + UI in a browser), and deploy to Vercel.

**Architecture:** All application code is already written, reviewed, committed, and pushed. This plan only sets secrets, runs verification, and deploys. No feature code changes.

**Tech Stack:** Next.js 15 (App Router) · Drizzle/Neon · `@anthropic-ai/sdk` (Haiku OCR) · `@vercel/blob` · Vitest · Vercel.

---

## Current State (read this first — you have zero prior context)

The full build is **done and pushed**. `git log` head is `ff16949`; `origin/main` is synced (private repo: `https://github.com/abdullah-sah/careco-pcn-tracker`). `npx vitest run` → **25 passing**. Production build is green.

What exists and works:
- **Data layer (Plan 1):** `lib/convert.ts` (pounds↔pence, ISO-date↔Excel-serial), `lib/pcn/{types,columns}.ts`, `lib/xlsx/import.ts` (`parseWorkbook`), `lib/xlsx/export.ts` (`buildXlsx` — identical-format xlsx), `lib/xlsx/template-data.ts` (embedded workbook base64), `db/{schema,index,queries,import-pcns}.ts`, `drizzle.config.ts`, `app/api/export/route.ts` (GET → xlsx).
- **App layer (Plan 2):** `lib/pcn/view.ts` (`PcnView`/`toView`), `app/actions.ts` (`createPcn`/`updatePcn`), `lib/ocr/extract.ts` (Claude `claude-haiku-4-5` OCR), `app/api/ocr/route.ts`, `app/api/pcn-image/[id]/route.ts` (auth-gated image proxy), `lib/auth.ts` + `middleware.ts` + `app/login/` (shared-password gate), `app/page.tsx` (server component loading PCNs), `components/pcn-portal.tsx` (the DB-wired UI).
- **Database:** A Neon Postgres DB is provisioned and **already migrated + seeded with 98 PCNs**. The same DB is used by production (same `DATABASE_URL`), so **do not re-migrate or re-seed** for prod.
- Full detail of every task is in `docs/superpowers/plans/2026-06-30-pcn-register-1-data-and-export.md` and `-2-app.md`.

## Environment nuances (CRITICAL — these bit us before)

- **Secrets live in `.env.development.local`** (gitignored via `.env*`), **not** `.env.local`. It already contains the Neon set: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `PG*`, `POSTGRES_*`.
- **CLI scripts** (`drizzle-kit`, `tsx`) use `dotenv`, which defaults to `.env` — so `drizzle.config.ts` and `db/import-pcns.ts` already load `.env.development.local` explicitly. `next dev` loads it automatically.
- **Neon migrations** require the **unpooled** URL (pooled pgBouncer fails); `drizzle.config.ts` already uses `DATABASE_URL_UNPOOLED ?? DATABASE_URL`.
- **`next build` (production) does NOT load `.env.development.local`.** `db/index.ts` calls `neon(process.env.DATABASE_URL!)` at module load, which runs during build's page-data collection → a plain `npm run build` fails locally with a Neon connection-string error. Locally, build with the env injected (see Task 2 Step 5). **On Vercel this is a non-issue** — the Neon integration injects `DATABASE_URL` at build time.
- Dev server: `npm run dev`; use `PORT=3217` (3000 is often busy here).

## The four secrets this plan sets

| Secret | Purpose | Source |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | PCN image upload to Vercel Blob | Provision **Vercel Blob** (Vercel dashboard → Storage → Blob), then `vercel env pull .env.development.local` |
| `ANTHROPIC_API_KEY` | Claude Haiku OCR | User's Anthropic API key |
| `LOGIN_PASSWORD` | the shared app password | User chooses |
| `AUTH_SECRET` | HMAC cookie signing (32+ random chars) | Generate: `openssl rand -hex 32` |

## Global Constraints

- Never print secret **values** to logs/chat; write them into `.env.development.local` (gitignored) and the Vercel project env only.
- Never commit any `.env*` file (already gitignored).
- Do not re-run the Neon migration or `npm run db:import` — the shared DB is already migrated and seeded (98 PCNs). Re-running import is safe (it refuses when the table is non-empty) but unnecessary.

---

### Task 1: Set the four runtime secrets locally

**Files:**
- Modify: `.env.development.local` (gitignored) — append the four keys.

- [ ] **Step 1: Provision Vercel Blob and pull its token**

In the Vercel dashboard, create a Blob store for this project (Storage → Blob → Create). Then pull all project env (this refreshes `.env.development.local`, keeping the Neon vars and adding `BLOB_READ_WRITE_TOKEN`):
```bash
cd /Users/abdullahsahraoui/Documents/Code.tmp/careco-pcn-tracker
npx vercel link      # if not already linked
npx vercel env pull .env.development.local
```
Expected: `.env.development.local` now has `BLOB_READ_WRITE_TOKEN` (verify names only, not values):
```bash
grep -oE '^[A-Za-z_]+=' .env.development.local | sort -u
```

- [ ] **Step 2: Generate `AUTH_SECRET`**

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)" >> .env.development.local
```
(64 hex chars = 32 bytes. Alternative: `node -e "console.log('AUTH_SECRET='+require('crypto').randomBytes(32).toString('hex'))" >> .env.development.local`.)

- [ ] **Step 3: Add `ANTHROPIC_API_KEY` and `LOGIN_PASSWORD`**

Edit `.env.development.local` in your editor and add (use your real key and chosen password):
```
ANTHROPIC_API_KEY=sk-ant-...
LOGIN_PASSWORD=<the shared password>
```

- [ ] **Step 4: Confirm all four keys are present (values hidden)**

```bash
for k in BLOB_READ_WRITE_TOKEN ANTHROPIC_API_KEY LOGIN_PASSWORD AUTH_SECRET DATABASE_URL; do
  grep -qE "^$k=.+" .env.development.local && echo "$k ✓" || echo "$k MISSING ✗"
done
```
Expected: all five `✓`. Confirm the file is still gitignored: `git check-ignore .env.development.local` prints the path.

---

### Task 2: Automated verification (no browser)

**Files:** none (verification only).

- [ ] **Step 1: Unit suite**

```bash
cd /Users/abdullahsahraoui/Documents/Code.tmp/careco-pcn-tracker
npx vitest run
```
Expected: **25 passed**.

- [ ] **Step 2: Production build (with DB env injected)**

A plain `npm run build` fails locally (see Environment nuances). Build with the env loaded:
```bash
node -e "require('dotenv').config({path:'.env.development.local'}); require('child_process').execSync('npx next build',{stdio:'inherit'})"
```
Expected: build completes (`✓ Compiled`, route list printed), no Neon/DATABASE_URL error.

- [ ] **Step 3: Start the dev server**

```bash
PORT=3217 npm run dev &
sleep 5
```
(If 3217 is busy, use 3218/3219 and adjust the URLs below.)

- [ ] **Step 4: Auth gate blocks unauthenticated requests**

```bash
curl -s -o /dev/null -w "root: %{http_code} -> %{redirect_url}\n" "http://localhost:3217/"
curl -s -o /dev/null -w "export(no cookie): %{http_code} -> %{redirect_url}\n" "http://localhost:3217/api/export"
curl -s -o /dev/null -w "login page: %{http_code}\n" "http://localhost:3217/login"
```
Expected: `root: 307 -> http://localhost:3217/login?next=%2F`, `export(no cookie): 307 -> .../login?...`, `login page: 200`.

- [ ] **Step 5: A validly-signed cookie is accepted, and export works end-to-end**

Compute the session cookie exactly as `lib/auth.ts` does (HMAC-SHA256 of `authed:v1` with `AUTH_SECRET`, hex; cookie = `authed:v1.<sig>`), then use it on gated routes:
```bash
COOKIE=$(node -e "require('dotenv').config({path:'.env.development.local'}); const {createHmac}=require('crypto'); const p='authed:v1'; console.log('pcn_session='+p+'.'+createHmac('sha256',process.env.AUTH_SECRET).update(p).digest('hex'))")
curl -s -o /dev/null -w "root(cookie): %{http_code}\n" -H "Cookie: $COOKIE" "http://localhost:3217/"
curl -sf -H "Cookie: $COOKIE" "http://localhost:3217/api/export" -o /tmp/pcn-verify.xlsx && echo "export bytes: $(wc -c < /tmp/pcn-verify.xlsx)"
unzip -l /tmp/pcn-verify.xlsx | grep -c "xl/worksheets/sheet" && echo "xlsx entries present"
```
Expected: `root(cookie): 200` (middleware accepts the signed cookie → HMAC sign/verify match end-to-end with the real secret), a non-trivial xlsx (well over 10 KB) downloads, and it contains the sheet XML entries. Open `/tmp/pcn-verify.xlsx` and confirm it looks identical to the original workbook with the 98 seeded PCNs.

- [ ] **Step 6: (Optional, needs `ANTHROPIC_API_KEY` + `BLOB_READ_WRITE_TOKEN` + a sample image) OCR + Blob round-trip**

If you have a sample PCN image at `/tmp/sample-pcn.jpg`, this exercises the zod-v4 `zodOutputFormat` runtime, the Blob upload, and the Haiku call together:
```bash
curl -sf -H "Cookie: $COOKIE" -F "file=@/tmp/sample-pcn.jpg" "http://localhost:3217/api/ocr" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('imageUrl set:', !!j.imageUrl, '| extracted keys:', Object.keys(j.extracted||{}).join(','));})"
```
Expected: `imageUrl set: true` and `extracted keys: category,pcnNumber,authority,vehicleReg,dateOfPcn,discountPeriodDays,fullCost,discountedCost,cost`. (If it errors with a zod/schema message, that's the deferred zod-v4 runtime item — see Plan 4.)

- [ ] **Step 7: Stop the dev server**

```bash
kill %1
```

---

### Task 3: Manual browser smoke test

**Files:** none (human verification). Requires all four secrets set (Task 1).

- [ ] **Step 1: Start the dev server and open the app**

```bash
PORT=3217 npm run dev
```
Open `http://localhost:3217` in a browser.

- [ ] **Step 2: Auth**

- Unauthenticated, you are redirected to `/login`.
- Wrong password → the page shows "Incorrect password."
- Correct password (`LOGIN_PASSWORD`) → you land on the register showing the 98 imported PCNs.

- [ ] **Step 3: Register interactions**

- Search by reg / PCN number / authority / driver filters the list.
- The `All` / `Council` / `Private` chips filter by category.
- Clicking the `VEHICLE`, `AUTHORITY · DRIVER`, and `DATE OF PCN` headers sorts (toggles direction).
- Clicking the cost header toggles **FULL COST ↔ DISCOUNTED** for council rows.

- [ ] **Step 4: Detail + edit persists**

- Open a **council** PCN → edit `STATUS`, a `paid?` field, and `NOTES` → **SAVE CHANGES**.
- Refresh the page → the edited values persist (proves `updatePcn` wrote to the DB).

- [ ] **Step 5: Add a PCN by photo (OCR)**

- Click **＋ ADD PCN** → upload (or photograph) a sample PCN image.
- Fields auto-fill from OCR (**driver name stays blank** — it is never read from the image).
- Correct anything, then **SAVE TO REGISTER**.
- The new row appears at the top of the register (highlighted); opening it shows the uploaded image (served via `/api/pcn-image/<id>`).

- [ ] **Step 6: Export includes the new PCN**

- Click **↧ EXPORT XLSX** in the header.
- The downloaded file opens identical to the original workbook, and the PCN you just added appears at the **bottom** of its sheet (Private or Council).

- [ ] **Step 7: Stop the dev server** (`Ctrl-C`).

---

### Task 4: Deploy to Vercel

**Files:** none (deploy + config).

- [ ] **Step 1: Link the project (if not already linked)**

```bash
cd /Users/abdullahsahraoui/Documents/Code.tmp/careco-pcn-tracker
npx vercel link
```

- [ ] **Step 2: Set the runtime secrets in the Vercel project (production)**

`DATABASE_URL` (+ Neon vars) and `BLOB_READ_WRITE_TOKEN` are already injected if Neon and Blob were provisioned via the Vercel Marketplace/Storage — in that case skip them. Add the three app secrets:
```bash
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add LOGIN_PASSWORD production
npx vercel env add AUTH_SECRET production
# Only if not auto-injected by the integrations:
# npx vercel env add DATABASE_URL production
# npx vercel env add BLOB_READ_WRITE_TOKEN production
```
Use the **same** `AUTH_SECRET` and `LOGIN_PASSWORD` values as local (or new ones — but then existing local cookies won't validate against prod, which is fine). Verify: `npx vercel env ls`.

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod
```
Expected: a production URL. (Build succeeds because the Neon integration provides `DATABASE_URL` at build time — no local dotenv trick needed on Vercel.) If auto-deploy from GitHub is already enabled, a deploy may already be running from the `ff16949` push; you can instead just ensure the env vars are set and trigger a redeploy so they take effect.

- [ ] **Step 4: Post-deploy smoke test**

Visit the production URL:
- Redirected to `/login`; correct `LOGIN_PASSWORD` lands on the register with the 98 PCNs (prod uses the same Neon DB).
- Add-a-PCN OCR flow works (real Haiku + Blob), edit persists, EXPORT XLSX downloads the identical workbook including any newly-added PCN.

- [ ] **Step 5: Commit any config the deploy created**

```bash
git add -A && git commit -m "chore: vercel deploy config" || echo "nothing to commit"
git push
```
(`.vercel/` is gitignored, so usually nothing to commit.)

---

## Unresolved questions

- Same `LOGIN_PASSWORD`/`AUTH_SECRET` for local + prod, or different? (Different is fine; only affects whether a local cookie works against prod.)
- Auto-deploy from GitHub on, or deploy via CLI only? (Affects whether the `ff16949` push already deployed.)
- Custom domain wanted, or is the `*.vercel.app` URL fine?
