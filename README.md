# Recovery Desk — Careco PCN Register

Next.js (App Router) implementation of the **PCN Portal** Claude design — a register
of parking charge notices (PCNs) for Careco that replaces the old spreadsheet.

## Views

- **Register** — searchable / sortable table of stored letters, filtered by category
  (All / Council / Private). Click a row to open it. Click the cost column header to
  toggle between full and discounted cost.
- **Detail** — read-only stored record plus the letter image held on file.
- **Add a letter** — photo / upload / manual entry → fields are read off the letter →
  you check & correct them → **Save** writes to the register. A PCN-number dedupe check
  flags letters already logged. No driver name is read from the image (UK GDPR, name-only).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm run start   # production
```

## Notes

State is in-memory (seeded with example letters), mirroring the prototype. The capture
step simulates extraction with a short delay — wiring real OCR, a database, and private
image storage are the natural next steps.
