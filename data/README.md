# Data

The register lives in Neon Postgres, not here. This directory holds:

- `backups/` — JSON snapshots written before destructive ops (gitignored).

There is no `pcn-register.xlsx` to drop in. Getting rows in:

- **First seed** — `npm run db:import` loads the bundled template
  (`lib/xlsx/template-data.ts`) into an empty table; it refuses if the table
  already has rows.
- **Ongoing** — export/reset from the app (admin): export the register as xlsx,
  or wipe-and-replace from an uploaded xlsx with a preview/confirm step.
