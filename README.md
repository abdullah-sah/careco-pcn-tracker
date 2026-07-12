# Careco PCN Tracker

Register of parking charge notices (PCNs) for Careco vehicles — replaces the old
spreadsheet. Next.js (App Router) + Postgres (Neon/Drizzle) + Vercel Blob for
letter images. See `context.md` for a full functional outline.

## Users & roles

Password login, one password per role:

- **admin** (Abdullah) — full control: add PCNs, edit driver names, import/export/reset.
- **alan** — simplified tap-only view: lands on the **To do** queue, updates statuses,
  notes and payment toggles, sends PCNs to Ali. Restrictions enforced server-side.

The **To do** queue is ball-in-Alan's-court only (`lib/pcn/queue.ts`): tickets are
grouped by the action they need (Send to Ali / Contact operator / Money / Decide next
step), with collapsed **Waiting** (parked with Ali / council / operator) and **Done**
sections below. Both roles see the same queue.

## Features

- **Register** — searchable/sortable list, filtered by scope (To do / All / Money)
  and category (council / private). To-do is an action-grouped queue; tickets parked
  with someone else fall into Waiting, resolved ones into Done.
- **Add a letter** (admin) — photo/upload/manual → fields extracted from the image
  via Claude vision (downscaled client-side first) → check & correct → save.
  PCN-number dedupe check. Driver name is never read from the image (UK GDPR);
  admin types it manually. Image stored in a **private** Blob store.
- **Detail** — stored record + letter image, per-category status lists, notes.
  Every field saves instantly (no Save button): toggles/status/payments on tap,
  notes and driver name debounced (~800 ms); "Saving… / Saved ✓" indicator, failed
  saves revert the field.
- **Send to Ali** — council PCNs that are "Not started" or "New correspondence"
  can be emailed to Ali (Resend) with details + image attached. Driver name omitted.
  On success the status auto-advances to "In progress (Ali)" and an inline "Paid Ali?"
  (£30 / £40 / later) prompt records the fee; the money loop then drives the next to-dos.
- **Payments** (council only) — three date-stamped toggles: Ali paid (£30 early /
  £40 delayed, DB-enforced), money requested from driver, driver paid
  (defaults to discounted cost).
- **Money** tab — read-only view derived from the register: recovered from drivers,
  saved by the system (£80 per resolved council ticket — including "Appeal won", which
  waives the driver-money loop yet still counts £80 saved), total profit (council £80 −
  Ali's fee / private £60 per cleared ticket), and owed by drivers (ageing buckets +
  top debtors). All-time and this-month figures. Visible to both roles.
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
