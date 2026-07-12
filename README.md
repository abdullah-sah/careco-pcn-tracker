# Careco PCN Tracker

Register of parking charge notices (PCNs) for Careco vehicles — replaces the old
spreadsheet. Next.js (App Router) + Postgres (Neon/Drizzle) + Vercel Blob for
letter images. See `context.md` for a full functional outline.

## Users & roles

Password login, one password per role:

- **admin** (Abdullah) — full control: add PCNs, edit driver names, import/export/reset.
- **alan** — simplified tap-only view: lands on the **To do** queue, updates statuses,
  notes and payment toggles, sends PCNs to Ali. Restrictions enforced server-side.

## Features

- **Register** — searchable/sortable list, filtered by scope (To do / All) and
  category (council / private). Closed statuses (Complete, Appeal won, Paid,
  Canceled) drop off the to-do queue.
- **Add a letter** (admin) — photo/upload/manual → fields extracted from the image
  via Claude vision (downscaled client-side first) → check & correct → save.
  PCN-number dedupe check. Driver name is never read from the image (UK GDPR);
  admin types it manually. Image stored in a **private** Blob store.
- **Detail** — stored record + letter image, per-category status lists, notes.
- **Send to Ali** — council PCNs that are "Not started" or "New correspondence"
  can be emailed to Ali (Resend) with details + image attached. Driver name omitted.
- **Payments** (council only) — three date-stamped toggles: Ali paid (£30 early /
  £40 delayed, DB-enforced), money requested from driver, driver paid
  (defaults to discounted cost).
- **Export / reset** (admin) — export register as xlsx; wipe-and-replace from an
  uploaded xlsx with preview/confirm, re-attaching stored images by PCN number.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm run start   # production
npm test                          # vitest
```

DB: `npm run db:generate` / `db:migrate` (drizzle-kit), `db:import` (one-off xlsx seed).

## Env

Pull with `vercel env pull --environment=production` (plain pull drops prod-only vars).

- `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED` for migrations) — Neon Postgres
- `AUTH_SECRET` — session cookie signing
- `LOGIN_PASSWORD` / `LOGIN_PASSWORD_ALAN` — role passwords
- `ANTHROPIC_API_KEY` — letter field extraction
- `BLOB_READ_WRITE_TOKEN` — private image store (must be passed explicitly in local dev)
- `RESEND_API_KEY`, `EMAIL_FROM`, `ALI_EMAIL` — send-to-Ali email
