# Careco PCN Tracker — Context

## What this is

A private web app that acts as Careco's register of parking tickets (PCNs — Parking Charge Notices) received against the company's vehicles. It replaces a shared spreadsheet that was previously used to track every ticket, who is dealing with it, and whether the associated money has moved. It is used by two people: **Abdullah** (admin, runs the register) and **Alan** (works the day-to-day queue at Careco).

## The problem it solves

Careco vehicles regularly pick up parking tickets from two kinds of issuer:

- **Council tickets** — issued by a local authority or TfL. These are handled by a third party, **Ali**, who resolves/appeals them for a fixed fee (£30 if sent to him promptly, £40 if delayed).
- **Private tickets** — issued by private parking operators (ParkingEye, UKPC, Euro Car Parks, etc.). These follow a simpler path: contact the operator, then the ticket is either paid or cancelled.

Each ticket needs its details logged, the original letter kept on file, its progress tracked to completion, and — for council tickets — three separate money events recorded: Ali being paid his fee, the money being requested from the driver, and the driver actually paying.

## Who uses it and how

There are two logins with different powers:

- **Admin (Abdullah)** — full control: adds new tickets, edits driver names, imports/exports the register, everything below.
- **Alan** — a deliberately simplified, mostly tap-only view: he lands on a **"To do" queue** of only the tickets where the ball is in his court, each card telling him *what* to do next, can update statuses and notes, toggle the payment checkpoints, and email tickets to Ali — but cannot add tickets, see/edit driver-name edits, or import/reset the register. Restrictions are enforced on the server, not just hidden in the UI.

## What you can do in it

### Log a new ticket (admin only)
Take a photo of the PCN letter (or upload one, or type it in manually). The letter image is read automatically and the key fields are extracted — ticket number, issuing authority, vehicle registration, date, full and discounted amounts, discount window, and whether it's council or private. The user checks and corrects the extracted fields before saving. A duplicate check flags a PCN number that is already in the register. The driver's name is deliberately **never** read from the letter image (data minimisation / UK GDPR) — it can only be typed in by the admin. The letter image is stored privately alongside the record.

### Browse the register
A searchable, sortable list of every ticket, filterable by category (all / council / private) and by scope:

- **To do** — a "ball-in-Alan's-court" queue (Alan's default view). Only tickets that need an action *from him* appear, grouped under headings that name the action: **Send to Ali**, **Contact operator**, **Money**, **Decide next step**. Each card carries a one-line action label (e.g. "Send to Ali + pay / start appeal", "Request £80 from driver", "Chase <driver> for £80 — requested Nd ago"); send/dispatch cards also show how many days old the ticket is. Below the groups, two collapsed sections: **Waiting** (tickets parked with someone else — annotated "with Ali" / "appeal with council" / "with operator") and **Done** (resolved). The same queue is shown to both roles.
- **All tickets** — the full register.
- **Money** — a read-only financial view (see below).

Each ticket opens into a detail view showing the stored record and the original letter image. Cards themselves have no buttons — you act from the detail view.

### Track a ticket's lifecycle
Each category has its own status list:

- **Council:** Not started → In progress (Ali) / In progress (reassign) → New correspondence (send to Ali) → Appeal rejected / Appeal won → Complete.
- **Private:** Not started → Message sent → Paid / Canceled.

A ticket leaves the to-do queue whenever the next move isn't Alan's: parked-with-someone statuses (In progress (Ali) / (reassign), Message sent) fall into **Waiting**, and resolved ones (Complete, Appeal won, Paid, Canceled) into **Done**. **Appeal won** means the council reassigned the ticket to the driver — the whole driver-money loop is waived, and it still counts £80 in the Money tab's "Saved". Legacy free-text statuses from old spreadsheet imports remain visible and selectable so they aren't silently lost.

### Send a ticket to Ali
For council tickets that are new or have fresh correspondence, one button emails Ali the ticket's details plus the letter image as an attachment. The driver's name is deliberately excluded from the email. On a successful send the ticket's status flips automatically to **In progress (Ali)** and an inline "Paid Ali?" prompt appears offering **£30 / £40 / later** — tapping a fee records the payment on the spot; "later" leaves a "pay Ali" to-do to surface in the Money group. From there the money loop drives the next to-dos: request £80 from the driver, then chase the driver until paid.

### Record the money (council tickets only)
Three tap-to-toggle checkpoints per ticket, each stamped with the date it was first set:

1. **Ali paid** — his £30 or £40 fee (only those two amounts are accepted; the date of first payment is preserved if the amount is later corrected).
2. **Money requested** from the driver.
3. **Driver paid** — defaults to the discounted ticket amount.

Every edit in the detail view **saves instantly** — there is no Save button. Toggles, the status select and payment controls persist the moment they're tapped; notes and the driver-name field autosave a short moment after you stop typing. A small "Saving… / Saved ✓" indicator confirms it; a failed save reverts the field and shows an inline error.

### See the money
A read-only **Money** view, derived entirely from the register (no separate bookkeeping), visible to both roles. Four figures, each with an all-time and a this-month total:

- **Recovered from drivers** — total the drivers have actually paid back.
- **Saved by this system** — £80 per resolved council ticket (every ticket arrives in the owner's name, so without the register each is an £80 cost to the business).
- **Total profit** — council (£80 recovered − Ali's fee) and private (flat £60 per cleared ticket) kept as separate streams.
- **Owed by drivers** — outstanding where money was requested but the driver hasn't paid, broken into ageing buckets (0–30 / 31–60 / 60+ days) with the top debtors listed. Undated legacy requests count as the oldest.

### Import / export (admin only)
- **Export** the whole register as a spreadsheet (matches the original spreadsheet's shape).
- **Reset from spreadsheet** — wipe the register and replace it with the contents of an uploaded spreadsheet, with a preview/confirm step (row counts by category vs. what's currently stored) before anything is deleted. Letter images already on file are re-attached to re-imported rows by PCN number, and the wipe-and-reload happens all-or-nothing.

### Sign in / out
Simple password login (one password per role). Everything requires being signed in; a logout button ends the session.

## Notable design choices

- **Privacy-first around driver names:** never OCR'd from letters, never emailed to Ali, only editable by the admin. Letter images are stored privately, not on public URLs.
- **Two audiences, one app:** the admin gets the full toolset; Alan gets a queue-driven, low-friction subset designed for tapping through on a phone.
- **Mobile-first:** built to be used from a phone — photos taken on-device are shrunk and converted before upload, and the layout collapses to single-column cards on small screens.
- **Spreadsheet continuity:** the register can round-trip to/from the original spreadsheet format, and older free-text values are mirrored/preserved so nothing from the spreadsheet era breaks.
