---
name: verify
description: Build, run, and drive the PCN tracker locally to verify changes end-to-end.
---

# Verify: careco-pcn-tracker

Next.js app, Neon Postgres, private Vercel Blob store, shared-password auth.

## Launch

```bash
PORT=3456 AUTH_SECRET=dev-verify-secret LOGIN_PASSWORD=dev-verify-pass npm run dev
```

Injecting dev-only auth vars works because login compares against `LOGIN_PASSWORD`
and sessions are HMAC-signed with `AUTH_SECRET` — no user table.
`.env.local` supplies `DATABASE_URL` (points at the live Neon DB — writes are real).

## Drive

Python Playwright is installed system-wide (`python3.11`, chromium cached).
Flow: `/login` → fill `input[name="password"]` → Enter → register at `/`.
Search box: `input[placeholder*="Search"]`. Click a row's PCN number text to open detail.
Buttons are `div`s, not `<button>` — locate by exact visible text
(beware: status `<option>` texts overlap button labels; use the exact
string incl. leading glyph, e.g. `text=✉ SEND TO ALI`).

## Gotchas

- Blob images need `BLOB_READ_WRITE_TOKEN` in env (private store; OIDC alone
  403s locally — see `db`/blob memory). Without it, image display and
  send-to-Ali's image fetch fail locally; verify those paths on the
  deployed app instead.
- `vercel env pull` (development env) drops Production-only vars
  (`AUTH_SECRET`, `LOGIN_PASSWORD`, `BLOB_*`) from `.env.local`.
- Find test tickets by querying Neon directly with `npx tsx --eval` +
  `@neondatabase/serverless` (dotenv v17: use `config({quiet:true})` or
  source `.env.local` in shell).
