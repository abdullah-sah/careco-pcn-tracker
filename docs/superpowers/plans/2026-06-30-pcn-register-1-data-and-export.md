# PCN Register — Plan 1: Data Foundation & Identical Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Postgres data model, a one-time Excel importer, and an on-demand exporter that reproduces `careco-pcn-tracker.xlsx` with current data — visually identical in layout and styling.

**Architecture:** Pure, unit-testable transform functions sit under `lib/` (`parseWorkbook`, `buildXlsx`) with no DB or network dependency, so the risky XML round-trip is fully testable headless. A thin Drizzle/Neon layer and a Next route handler wrap them. The original workbook ships embedded as base64 (`lib/xlsx/template-data.ts`) so it's always in the serverless bundle. Export regenerates **only** each sheet's `<sheetData>` and bumps row-count-dependent ranges; every other archive part is copied byte-for-byte.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Drizzle ORM + `@neondatabase/serverless` · `xlsx` (SheetJS, import read only) · `fflate` (zip) · Vitest · `tsx`.

## Global Constraints

- Product name **PCN Register**; user-facing noun is **"PCN"**, never "letter" (applies to Plan 2 UI; no user copy in Plan 1).
- Costs stored as **integer pence**; dates stored as ISO `YYYY-MM-DD`; Excel serial-date epoch is **1899-12-30**.
- Currency cells use template style index **`3`** (`"£"#,##0.00`); date cells use style index **`4`** (numFmt 14). Default-styled cells carry no `s` attribute.
- Two sheets map to `category`: `Private` (9 cols, `A:I`) and `Council` (13 cols, `A:M`). `metadata` sheet is preserved untouched.
- Export row order is **`sort_seq` ascending** (oldest→newest); export ranges are **extended** to the new last data row.
- Export must change **only** `xl/worksheets/sheet1.xml` + `sheet2.xml` `<sheetData>` and the row-count-dependent ranges in those sheets + `xl/workbook.xml`. All other archive entries are byte-identical to the template.

---

## File Structure

- `lib/convert.ts` — pounds↔pence, ISO-date↔Excel-serial (pure).
- `lib/pcn/types.ts` — `Category`, `PcnRow`.
- `lib/pcn/columns.ts` — per-sheet column specs (field + cell kind), in sheet column order.
- `lib/xlsx/template-data.ts` — generated: `export const TEMPLATE_B64`.
- `lib/xlsx/import.ts` — `parseWorkbook(buf) → PcnRow[]` (SheetJS read).
- `lib/xlsx/export.ts` — `buildXlsx(template, rows) → Uint8Array` + internal sheetData/range helpers.
- `lib/xlsx/*.test.ts`, `lib/convert.test.ts` — Vitest.
- `db/schema.ts` — Drizzle `pcn` table; `db/index.ts` — Neon client; `drizzle.config.ts`.
- `db/import-pcns.ts` — one-time importer (parse template → insert).
- `db/queries.ts` — `getRowsForExport()`.
- `app/api/export/route.ts` — GET → streams the `.xlsx`.
- `vitest.config.ts`.

---

### Task 1: Tooling, dependencies, embedded template

**Files:**
- Create: `vitest.config.ts`, `lib/xlsx/template-data.ts` (generated), `templates/pcn-template.xlsx` (moved)
- Modify: `package.json` (scripts + deps), `.gitignore` (already present)

**Interfaces:**
- Produces: `TEMPLATE_B64: string` (base64 of the original workbook) from `lib/xlsx/template-data.ts`.

- [ ] **Step 1: Initialize git (plan uses commits)**

Run:
```bash
cd /Users/abdullahsahraoui/Documents/Code.tmp/careco-pcn-tracker
git init -q && git add -A && git commit -q -m "chore: snapshot existing prototype before backend build"
```
Expected: a commit is created (the existing Next prototype + spec).

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install drizzle-orm @neondatabase/serverless xlsx fflate
npm install -D vitest drizzle-kit tsx dotenv
```
Expected: installs succeed; `package.json` updated.

- [ ] **Step 3: Add scripts to `package.json`**

Add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:import": "tsx db/import-pcns.ts"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
```

- [ ] **Step 5: Move the workbook into `templates/` and embed it as base64**

Run:
```bash
mkdir -p templates lib/xlsx
git mv careco-pcn-tracker.xlsx templates/pcn-template.xlsx 2>/dev/null || mv careco-pcn-tracker.xlsx templates/pcn-template.xlsx
node -e "const fs=require('fs');const b=fs.readFileSync('templates/pcn-template.xlsx').toString('base64');fs.writeFileSync('lib/xlsx/template-data.ts','// AUTO-GENERATED from templates/pcn-template.xlsx — do not edit by hand.\nexport const TEMPLATE_B64 =\n  \"'+b+'\";\n');"
```
Expected: `templates/pcn-template.xlsx` exists and `lib/xlsx/template-data.ts` exports a long base64 string.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add db/xlsx deps, vitest, embedded workbook template"
```

---

### Task 2: Conversion helpers (money + dates)

**Files:**
- Create: `lib/convert.ts`, `lib/convert.test.ts`

**Interfaces:**
- Produces: `poundsToPence(n: number): number`, `penceToPounds(p: number): number`, `dateToSerial(iso: string): number`, `serialToDate(serial: number): string`.

- [ ] **Step 1: Write the failing tests**

`lib/convert.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { poundsToPence, penceToPounds, dateToSerial, serialToDate } from "./convert";

describe("money", () => {
  it("pounds → pence rounds to integer", () => {
    expect(poundsToPence(160)).toBe(16000);
    expect(poundsToPence(65.5)).toBe(6550);
  });
  it("pence → pounds", () => {
    expect(penceToPounds(16000)).toBe(160);
    expect(penceToPounds(6550)).toBe(65.5);
  });
});

describe("excel serial dates (epoch 1899-12-30)", () => {
  it("1900-01-01 is serial 2", () => {
    expect(dateToSerial("1900-01-01")).toBe(2);
  });
  it("round-trips a real value", () => {
    expect(serialToDate(dateToSerial("2026-06-19"))).toBe("2026-06-19");
  });
  it("serialToDate is inverse of dateToSerial", () => {
    expect(dateToSerial(serialToDate(46140))).toBe(46140);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/convert.test.ts`
Expected: FAIL — cannot find module `./convert`.

- [ ] **Step 3: Implement `lib/convert.ts`**

```ts
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30
const DAY_MS = 86_400_000;

export function poundsToPence(n: number): number {
  return Math.round(n * 100);
}

export function penceToPounds(p: number): number {
  return p / 100;
}

export function dateToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_MS) / DAY_MS);
}

export function serialToDate(serial: number): string {
  const dt = new Date(EXCEL_EPOCH_MS + serial * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/convert.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/convert.ts lib/convert.test.ts
git commit -m "feat: money + excel serial-date conversion helpers"
```

---

### Task 3: Types + column specs

**Files:**
- Create: `lib/pcn/types.ts`, `lib/pcn/columns.ts`, `lib/pcn/columns.test.ts`

**Interfaces:**
- Produces:
  - `type Category = "council" | "private"`.
  - `interface PcnRow` — `{ sortSeq: number; category: Category; pcnNumber: string; authority: string; vehicleReg: string; costPence: number | null; fullCostPence: number | null; discountedCostPence: number | null; dateOfPcn: string | null; discountPeriodDays: number | null; driverName: string | null; aliPaid: string | null; moneyRequested: string | null; driverPaid: string | null; status: string | null; notes: string | null }`.
  - `type ColKind = "string" | "currency" | "date" | "number" | "paidish"`.
  - `interface ColSpec { field: keyof PcnRow; kind: ColKind }`.
  - `PRIVATE_COLS: ColSpec[]` (9, order A→I), `COUNCIL_COLS: ColSpec[]` (13, order A→M).
  - `STYLE = { currency: "3", date: "4" } as const`.

- [ ] **Step 1: Write the failing test**

`lib/pcn/columns.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PRIVATE_COLS, COUNCIL_COLS } from "./columns";

describe("column specs", () => {
  it("private has 9 columns in sheet order", () => {
    expect(PRIVATE_COLS.map((c) => c.field)).toEqual([
      "pcnNumber", "authority", "vehicleReg", "costPence", "dateOfPcn",
      "discountPeriodDays", "driverName", "status", "notes",
    ]);
  });
  it("council has 13 columns in sheet order", () => {
    expect(COUNCIL_COLS.map((c) => c.field)).toEqual([
      "pcnNumber", "authority", "vehicleReg", "fullCostPence", "discountedCostPence",
      "dateOfPcn", "discountPeriodDays", "driverName", "aliPaid", "moneyRequested",
      "driverPaid", "status", "notes",
    ]);
  });
  it("cost columns are currency, date column is date", () => {
    expect(COUNCIL_COLS[3].kind).toBe("currency");
    expect(COUNCIL_COLS[5].kind).toBe("date");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/pcn/columns.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `lib/pcn/types.ts`**

```ts
export type Category = "council" | "private";

export interface PcnRow {
  sortSeq: number;
  category: Category;
  pcnNumber: string;
  authority: string;
  vehicleReg: string;
  costPence: number | null;
  fullCostPence: number | null;
  discountedCostPence: number | null;
  dateOfPcn: string | null;
  discountPeriodDays: number | null;
  driverName: string | null;
  aliPaid: string | null;
  moneyRequested: string | null;
  driverPaid: string | null;
  status: string | null;
  notes: string | null;
}
```

- [ ] **Step 4: Implement `lib/pcn/columns.ts`**

```ts
import type { PcnRow } from "./types";

export type ColKind = "string" | "currency" | "date" | "number" | "paidish";
export interface ColSpec { field: keyof PcnRow; kind: ColKind }

export const STYLE = { currency: "3", date: "4" } as const;

export const PRIVATE_COLS: ColSpec[] = [
  { field: "pcnNumber", kind: "string" },
  { field: "authority", kind: "string" },
  { field: "vehicleReg", kind: "string" },
  { field: "costPence", kind: "currency" },
  { field: "dateOfPcn", kind: "date" },
  { field: "discountPeriodDays", kind: "number" },
  { field: "driverName", kind: "string" },
  { field: "status", kind: "string" },
  { field: "notes", kind: "string" },
];

export const COUNCIL_COLS: ColSpec[] = [
  { field: "pcnNumber", kind: "string" },
  { field: "authority", kind: "string" },
  { field: "vehicleReg", kind: "string" },
  { field: "fullCostPence", kind: "currency" },
  { field: "discountedCostPence", kind: "currency" },
  { field: "dateOfPcn", kind: "date" },
  { field: "discountPeriodDays", kind: "number" },
  { field: "driverName", kind: "string" },
  { field: "aliPaid", kind: "paidish" },
  { field: "moneyRequested", kind: "paidish" },
  { field: "driverPaid", kind: "paidish" },
  { field: "status", kind: "string" },
  { field: "notes", kind: "string" },
];
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/pcn/columns.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pcn/
git commit -m "feat: PcnRow type and per-sheet column specs"
```

---

### Task 4: Import parser (`parseWorkbook`)

**Files:**
- Create: `lib/xlsx/import.ts`, `lib/xlsx/import.test.ts`

**Interfaces:**
- Consumes: `PRIVATE_COLS`/`COUNCIL_COLS` (Task 3), `poundsToPence`/`serialToDate` (Task 2), `TEMPLATE_B64` (Task 1).
- Produces: `parseWorkbook(buf: Uint8Array): PcnRow[]` — Private rows first then Council, `sortSeq` assigned 1..N in that order.

- [ ] **Step 1: Write the failing test (against the real template)**

`lib/xlsx/import.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseWorkbook } from "./import";
import { TEMPLATE_B64 } from "./template-data";

const rows = parseWorkbook(Buffer.from(TEMPLATE_B64, "base64"));

describe("parseWorkbook", () => {
  it("returns both private and council rows", () => {
    expect(rows.some((r) => r.category === "private")).toBe(true);
    expect(rows.some((r) => r.category === "council")).toBe(true);
  });
  it("assigns unique ascending sortSeq starting at 1", () => {
    const seqs = rows.map((r) => r.sortSeq);
    expect(seqs[0]).toBe(1);
    expect(new Set(seqs).size).toBe(rows.length);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });
  it("parses council costs as integer pence and dates as ISO", () => {
    const c = rows.find((r) => r.category === "council" && r.pcnNumber === "WE58557299");
    expect(c).toBeDefined();
    expect(c!.fullCostPence).toBe(16000); // £160 in the sheet
    expect(c!.discountedCostPence).toBe(8000);
    expect(c!.dateOfPcn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/xlsx/import.test.ts`
Expected: FAIL — cannot find module `./import`.

- [ ] **Step 3: Implement `lib/xlsx/import.ts`**

```ts
import * as XLSX from "xlsx";
import type { PcnRow, Category } from "../pcn/types";
import { PRIVATE_COLS, COUNCIL_COLS, type ColSpec } from "../pcn/columns";
import { poundsToPence, serialToDate } from "../convert";

function cellValue(raw: unknown, kind: ColSpec["kind"]): unknown {
  if (raw === undefined || raw === null || raw === "") return null;
  switch (kind) {
    case "currency": return poundsToPence(Number(raw));
    case "date": return serialToDate(Number(raw));
    case "number": return Number(raw);
    default: return String(raw); // string | paidish
  }
}

function parseSheet(
  ws: XLSX.WorkSheet,
  cols: ColSpec[],
  category: Category,
  startSeq: number,
): PcnRow[] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, raw: true, blankrows: false,
  });
  const out: PcnRow[] = [];
  let seq = startSeq;
  for (let i = 1; i < grid.length; i++) { // row 0 = header
    const r = grid[i];
    if (!r || r.every((c) => c === undefined || c === null || c === "")) continue;
    const base: Record<string, unknown> = { sortSeq: seq++, category };
    cols.forEach((spec, idx) => { base[spec.field] = cellValue(r[idx], spec.kind); });
    // ensure all PcnRow fields exist
    out.push({
      sortSeq: base.sortSeq as number,
      category,
      pcnNumber: (base.pcnNumber as string) ?? "",
      authority: (base.authority as string) ?? "",
      vehicleReg: (base.vehicleReg as string) ?? "",
      costPence: (base.costPence as number) ?? null,
      fullCostPence: (base.fullCostPence as number) ?? null,
      discountedCostPence: (base.discountedCostPence as number) ?? null,
      dateOfPcn: (base.dateOfPcn as string) ?? null,
      discountPeriodDays: (base.discountPeriodDays as number) ?? null,
      driverName: (base.driverName as string) ?? null,
      aliPaid: (base.aliPaid as string) ?? null,
      moneyRequested: (base.moneyRequested as string) ?? null,
      driverPaid: (base.driverPaid as string) ?? null,
      status: (base.status as string) ?? null,
      notes: (base.notes as string) ?? null,
    });
  }
  return out;
}

export function parseWorkbook(buf: Uint8Array): PcnRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const priv = parseSheet(wb.Sheets["Private"], PRIVATE_COLS, "private", 1);
  const council = parseSheet(wb.Sheets["Council"], COUNCIL_COLS, "council", priv.length + 1);
  return [...priv, ...council];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/xlsx/import.test.ts`
Expected: PASS. (If the `WE58557299` cost assertion fails, open the sheet and confirm whether the cell holds pounds; adjust the expected value to the real figure — the parser logic is what's under test.)

- [ ] **Step 5: Commit**

```bash
git add lib/xlsx/import.ts lib/xlsx/import.test.ts
git commit -m "feat: parse Private/Council sheets into PcnRow[]"
```

---

### Task 5: Exporter (`buildXlsx`) — template round-trip + fidelity tests

**Files:**
- Create: `lib/xlsx/export.ts`, `lib/xlsx/export.test.ts`

**Interfaces:**
- Consumes: `PcnRow` (Task 3), `PRIVATE_COLS`/`COUNCIL_COLS`/`STYLE` (Task 3), `penceToPounds`/`dateToSerial` (Task 2), `TEMPLATE_B64` (Task 1), `parseWorkbook` (Task 4, test only).
- Produces: `buildXlsx(template: Uint8Array, rows: PcnRow[]): Uint8Array`.

- [ ] **Step 1: Inspect the template's range-bearing XML (one-time, informs the code)**

Run:
```bash
mkdir -p /tmp/tpl && (cd /tmp/tpl && unzip -o -q "$OLDPWD/templates/pcn-template.xlsx")
xmllint --format /tmp/tpl/xl/worksheets/sheet2.xml | grep -nE "dimension|autoFilter|conditionalFormatting|dataValidation|sqref"
xmllint --format /tmp/tpl/xl/worksheets/sheet1.xml | grep -nE "dimension|autoFilter|conditionalFormatting|dataValidation|sqref"
grep -o '_xlnm._FilterDatabase[^<]*<[^>]*>[^<]*' /tmp/tpl/xl/workbook.xml
```
Expected: lists every row-bounded range (e.g. `dimension A1:M73`, `conditionalFormatting sqref="L2:L73"`, the `_xlnm._FilterDatabase` = `Council!$A$1:$M$17`). These are the references `bumpRanges`/`bumpDefinedName` must extend to the new last row. Note the per-sheet last column: Private `I`, Council `M`.

- [ ] **Step 2: Write the failing fidelity + unit tests**

`lib/xlsx/export.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { TEMPLATE_B64 } from "./template-data";
import { parseWorkbook } from "./import";
import { buildXlsx } from "./export";

const template = Buffer.from(TEMPLATE_B64, "base64");
const rows = parseWorkbook(template);
const out = buildXlsx(template, rows);

const A = unzipSync(template);
const B = unzipSync(out);
const dec = (u: Uint8Array) => new TextDecoder().decode(u);

describe("buildXlsx fidelity (same data in)", () => {
  it("changes only the two sheet XMLs and workbook.xml", () => {
    const changed = Object.keys(A)
      .filter((k) => dec(A[k]) !== dec(B[k]))
      .sort();
    expect(changed).toEqual([
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
  });
  it("preserves the metadata sheet and styles byte-for-byte", () => {
    expect(dec(B["xl/worksheets/sheet3.xml"])).toBe(dec(A["xl/worksheets/sheet3.xml"]));
    expect(dec(B["xl/styles.xml"])).toBe(dec(A["xl/styles.xml"]));
  });
  it("round-trips every value (export → re-import equals original rows)", () => {
    const back = parseWorkbook(out);
    const norm = (r: any) => ({ ...r, sortSeq: 0 });
    expect(back.map(norm)).toEqual(rows.map(norm));
  });
  it("currency cells keep style 3 and date cells style 4", () => {
    const s2 = dec(B["xl/worksheets/sheet2.xml"]);
    expect(s2).toMatch(/<c r="D2" s="3"><v>/);
    expect(s2).toMatch(/<c r="F2" s="4"><v>/);
  });
  it("escapes ampersands in inline strings", () => {
    const seq = Math.max(...rows.map((r) => r.sortSeq)) + 1;
    const withAmp = buildXlsx(template, [
      ...rows,
      { ...rows.find((r) => r.category === "council")!, sortSeq: seq, authority: "Hammersmith & Fulham" },
    ]);
    const s2 = dec(unzipSync(withAmp)["xl/worksheets/sheet2.xml"]);
    expect(s2).toContain("Hammersmith &amp; Fulham");
  });
});

describe("buildXlsx range bumping (added rows)", () => {
  it("extends Council dimension + filter to the new last row", () => {
    const councilRows = rows.filter((r) => r.category === "council");
    const seq = Math.max(...rows.map((r) => r.sortSeq)) + 1;
    const out2 = buildXlsx(template, [
      ...rows,
      { ...councilRows[0], sortSeq: seq, pcnNumber: "NEWPCN001" },
    ]);
    const last = councilRows.length + 2; // +1 header, +1 new row
    const wb = dec(unzipSync(out2)["xl/workbook.xml"]);
    const s2 = dec(unzipSync(out2)["xl/worksheets/sheet2.xml"]);
    expect(wb).toContain(`Council!$A$1:$M$${last}`);
    expect(s2).toContain(`<dimension ref="A1:M${last}"/>`);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/xlsx/export.test.ts`
Expected: FAIL — cannot find module `./export`.

- [ ] **Step 4: Implement `lib/xlsx/export.ts`**

```ts
import { unzipSync, zipSync } from "fflate";
import type { PcnRow } from "../pcn/types";
import { PRIVATE_COLS, COUNCIL_COLS, STYLE, type ColSpec } from "../pcn/columns";
import { penceToPounds, dateToSerial } from "../convert";

const enc = new TextEncoder();
const dec = new TextDecoder();

function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineStr(ref: string, value: string): string {
  const preserve = value !== value.trim() ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
}

function cellXml(ref: string, spec: ColSpec, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (spec.kind) {
    case "currency":
      return `<c r="${ref}" s="${STYLE.currency}"><v>${penceToPounds(value as number)}</v></c>`;
    case "date":
      return `<c r="${ref}" s="${STYLE.date}"><v>${dateToSerial(value as string)}</v></c>`;
    case "number":
      return `<c r="${ref}"><v>${value as number}</v></c>`;
    case "paidish": {
      const sv = String(value);
      return /^-?\d+(\.\d+)?$/.test(sv) ? `<c r="${ref}"><v>${sv}</v></c>` : inlineStr(ref, sv);
    }
    default:
      return inlineStr(ref, String(value));
  }
}

function headerRow1(sheetXml: string): string {
  const m = sheetXml.match(/<row r="1"[\s\S]*?<\/row>/);
  if (!m) throw new Error("template sheet missing header row 1");
  return m[0];
}

function buildSheetData(sheetXml: string, rows: PcnRow[], cols: ColSpec[]): string {
  const ordered = [...rows].sort((a, b) => a.sortSeq - b.sortSeq);
  let body = headerRow1(sheetXml);
  ordered.forEach((row, i) => {
    const r = i + 2; // data starts at row 2
    const cells = cols
      .map((spec, idx) => cellXml(`${colLetter(idx + 1)}${r}`, spec, (row as any)[spec.field]))
      .join("");
    body += `<row r="${r}" spans="1:${cols.length}">${cells}</row>`;
  });
  return `<sheetData>${body}</sheetData>`;
}

function replaceSheetData(sheetXml: string, newSheetData: string): string {
  if (/<sheetData\/>/.test(sheetXml)) return sheetXml.replace(/<sheetData\/>/, newSheetData);
  return sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, newSheetData);
}

// Extend the end-row of any multi-row range token "A2:M73" → "A2:M{last}".
function bumpRangeToken(token: string, last: number): string {
  const m = token.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return token;
  const [, c1, r1, c2, r2] = m;
  if (Number(r2) <= 1) return token; // header-only ranges left alone
  return `${c1}${r1}:${c2}${last}`;
}

function bumpSqref(value: string, last: number): string {
  return value.split(" ").map((t) => bumpRangeToken(t, last)).join(" ");
}

function bumpSheetRanges(sheetXml: string, lastCol: string, last: number): string {
  let xml = sheetXml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastCol}${last}"/>`);
  xml = xml.replace(/<autoFilter ref="([^"]*)"/g, (_m, ref) => `<autoFilter ref="${bumpSqref(ref, last)}"`);
  xml = xml.replace(/(<conditionalFormatting [^>]*sqref=")([^"]*)(")/g,
    (_m, a, ref, b) => `${a}${bumpSqref(ref, last)}${b}`);
  xml = xml.replace(/(<dataValidation [^>]*sqref=")([^"]*)(")/g,
    (_m, a, ref, b) => `${a}${bumpSqref(ref, last)}${b}`);
  return xml;
}

// workbook.xml: Council!$A$1:$M$17 → Council!$A$1:$M${last}
function bumpDefinedName(workbookXml: string, sheet: string, last: number): string {
  const re = new RegExp(`(${sheet}!\\$[A-Z]+\\$1:\\$[A-Z]+\\$)\\d+`);
  return workbookXml.replace(re, `$1${last}`);
}

export function buildXlsx(template: Uint8Array, rows: PcnRow[]): Uint8Array {
  const files = unzipSync(template);
  const sheets: Array<{ path: string; cols: ColSpec[]; cat: PcnRow["category"]; lastCol: string }> = [
    { path: "xl/worksheets/sheet1.xml", cols: PRIVATE_COLS, cat: "private", lastCol: "I" },
    { path: "xl/worksheets/sheet2.xml", cols: COUNCIL_COLS, cat: "council", lastCol: "M" },
  ];

  for (const s of sheets) {
    const xml = dec.decode(files[s.path]);
    const catRows = rows.filter((r) => r.category === s.cat);
    const last = catRows.length + 1; // +1 header row
    let next = replaceSheetData(xml, buildSheetData(xml, catRows, s.cols));
    next = bumpSheetRanges(next, s.lastCol, last);
    files[s.path] = enc.encode(next);
  }

  const councilLast = rows.filter((r) => r.category === "council").length + 1;
  files["xl/workbook.xml"] = enc.encode(
    bumpDefinedName(dec.decode(files["xl/workbook.xml"]), "Council", councilLast),
  );

  return zipSync(files);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/xlsx/export.test.ts`
Expected: PASS. Common first-run fixes:
  - If "changes only..." also lists a sheet whose `<sheetData>` differs by empty-cell representation only, that is acceptable behavior but the byte test is strict — confirm via the round-trip test (values equal) and, if needed, relax the first test to compare parsed cell values for the two sheet XMLs while keeping byte-equality for all other entries.
  - If `dimension`/CF assertions miss, re-check the exact tokens from Step 1 and adjust `bumpSheetRanges` regexes to match the template's attribute order.

- [ ] **Step 6: Manual visual check**

Run:
```bash
npx tsx -e "import('./lib/xlsx/template-data.js')" 2>/dev/null || true
npx tsx -e "const fs=require('fs');const {TEMPLATE_B64}=require('./lib/xlsx/template-data.ts');" 2>/dev/null || true
node --import tsx -e "import {TEMPLATE_B64} from './lib/xlsx/template-data.ts'; import {parseWorkbook} from './lib/xlsx/import.ts'; import {buildXlsx} from './lib/xlsx/export.ts'; import fs from 'fs'; const t=Buffer.from(TEMPLATE_B64,'base64'); fs.writeFileSync('/tmp/pcn-out.xlsx', buildXlsx(t, parseWorkbook(t)));"
open /tmp/pcn-out.xlsx
```
Expected: opens in Excel/Numbers looking identical to the original — £ currency, dates, bold headers, frozen header, filter, the `metadata` tab, fonts. (If `node --import tsx` is unavailable, wrap the same three lines in `scripts/manual-export.ts` and run `npx tsx scripts/manual-export.ts`.)

- [ ] **Step 7: Commit**

```bash
git add lib/xlsx/export.ts lib/xlsx/export.test.ts
git commit -m "feat: identical-format xlsx exporter (template round-trip + fidelity tests)"
```

---

### Task 6: Drizzle schema + Neon client + migration

**Files:**
- Create: `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`, `.env.local` (gitignored), `drizzle/` (generated)

**Interfaces:**
- Consumes: `DATABASE_URL` env.
- Produces: `pcn` table (Drizzle), `db` client. Columns mirror `PcnRow` plus `id`, `imageUrl`, `createdAt`, `updatedAt`.

- [ ] **Step 1: Provision Neon + set `DATABASE_URL`**

Add the Neon Postgres integration from the Vercel Marketplace (or any Postgres), then put its pooled connection string in `.env.local`:
```
DATABASE_URL=postgres://...
```
Expected: `.env.local` present (already gitignored via `.env*.local`).

- [ ] **Step 2: Implement `db/schema.ts`**

```ts
import { pgTable, uuid, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const categoryEnum = pgEnum("category", ["council", "private"]);

export const pcn = pgTable("pcn", {
  id: uuid("id").defaultRandom().primaryKey(),
  sortSeq: integer("sort_seq").notNull(),
  category: categoryEnum("category").notNull(),
  pcnNumber: text("pcn_number").notNull(),
  authority: text("authority").notNull().default(""),
  vehicleReg: text("vehicle_reg").notNull().default(""),
  costPence: integer("cost_pence"),
  fullCostPence: integer("full_cost_pence"),
  discountedCostPence: integer("discounted_cost_pence"),
  dateOfPcn: date("date_of_pcn"),
  discountPeriodDays: integer("discount_period_days"),
  driverName: text("driver_name"),
  aliPaid: text("ali_paid"),
  moneyRequested: text("money_requested"),
  driverPaid: text("driver_paid"),
  status: text("status"),
  notes: text("notes"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PcnInsert = typeof pcn.$inferInsert;
export type PcnSelect = typeof pcn.$inferSelect;
```

- [ ] **Step 3: Implement `db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 4: Implement `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Generate and apply the migration**

Run:
```bash
npm run db:generate
npm run db:migrate
```
Expected: a SQL file appears under `drizzle/`; migrate creates the `pcn` table and `category` enum in Neon. Verify with `npx tsx -e "import 'dotenv/config'; import {db} from './db/index.ts'; import {pcn} from './db/schema.ts'; db.select().from(pcn).limit(1).then(r=>{console.log('ok',r.length);})"` → prints `ok 0`.

- [ ] **Step 6: Commit**

```bash
git add db/schema.ts db/index.ts drizzle.config.ts drizzle/
git commit -m "feat: drizzle pcn schema + neon client + initial migration"
```

---

### Task 7: Import script + export query + `/api/export` route

**Files:**
- Create: `db/import-pcns.ts`, `db/queries.ts`, `app/api/export/route.ts`

**Interfaces:**
- Consumes: `parseWorkbook` (Task 4), `buildXlsx` (Task 5), `TEMPLATE_B64` (Task 1), `db`/`pcn` (Task 6), `PcnRow` (Task 3).
- Produces: `getRowsForExport(): Promise<PcnRow[]>` (ordered by `sort_seq` asc), the seeded DB, and `GET /api/export`.

- [ ] **Step 1: Implement `db/import-pcns.ts` (one-time seed)**

```ts
import "dotenv/config";
import { db } from "./index";
import { pcn } from "./schema";
import { parseWorkbook } from "../lib/xlsx/import";
import { TEMPLATE_B64 } from "../lib/xlsx/template-data";
import type { PcnInsert } from "./schema";

async function main() {
  const existing = await db.select({ id: pcn.id }).from(pcn).limit(1);
  if (existing.length > 0) { console.log("pcn table not empty — refusing to re-import."); return; }

  const rows = parseWorkbook(Buffer.from(TEMPLATE_B64, "base64"));
  const records: PcnInsert[] = rows.map((r) => ({
    sortSeq: r.sortSeq, category: r.category, pcnNumber: r.pcnNumber,
    authority: r.authority, vehicleReg: r.vehicleReg, costPence: r.costPence,
    fullCostPence: r.fullCostPence, discountedCostPence: r.discountedCostPence,
    dateOfPcn: r.dateOfPcn, discountPeriodDays: r.discountPeriodDays, driverName: r.driverName,
    aliPaid: r.aliPaid, moneyRequested: r.moneyRequested, driverPaid: r.driverPaid,
    status: r.status, notes: r.notes,
  }));
  await db.insert(pcn).values(records);
  console.log(`Imported ${records.length} PCNs.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the import**

Run: `npm run db:import`
Expected: prints `Imported <N> PCNs.` Re-running prints the refusal message (idempotent).

- [ ] **Step 3: Implement `db/queries.ts`**

```ts
import { asc } from "drizzle-orm";
import { db } from "./index";
import { pcn } from "./schema";
import type { PcnRow } from "../lib/pcn/types";

export async function getRowsForExport(): Promise<PcnRow[]> {
  const rows = await db.select().from(pcn).orderBy(asc(pcn.sortSeq));
  return rows.map((r) => ({
    sortSeq: r.sortSeq, category: r.category, pcnNumber: r.pcnNumber,
    authority: r.authority, vehicleReg: r.vehicleReg, costPence: r.costPence,
    fullCostPence: r.fullCostPence, discountedCostPence: r.discountedCostPence,
    dateOfPcn: r.dateOfPcn, discountPeriodDays: r.discountPeriodDays, driverName: r.driverName,
    aliPaid: r.aliPaid, moneyRequested: r.moneyRequested, driverPaid: r.driverPaid,
    status: r.status, notes: r.notes,
  }));
}
```

- [ ] **Step 4: Implement `app/api/export/route.ts`**

```ts
import { buildXlsx } from "@/lib/xlsx/export";
import { TEMPLATE_B64 } from "@/lib/xlsx/template-data";
import { getRowsForExport } from "@/db/queries";

export const runtime = "nodejs";

export async function GET() {
  const rows = await getRowsForExport();
  const bytes = buildXlsx(Buffer.from(TEMPLATE_B64, "base64"), rows);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="pcn-register.xlsx"',
    },
  });
}
```

- [ ] **Step 5: Verify the route end-to-end**

Run (dev server on a free port, since 3000 is taken):
```bash
PORT=3217 npm run dev &
sleep 4
curl -sf "http://localhost:3217/api/export" -o /tmp/pcn-api.xlsx && echo "bytes: $(wc -c < /tmp/pcn-api.xlsx)"
open /tmp/pcn-api.xlsx
kill %1
```
Expected: a non-trivial `.xlsx` downloads and opens identical to the original, now reflecting DB contents.

- [ ] **Step 6: Commit**

```bash
git add db/import-pcns.ts db/queries.ts app/api/export/route.ts
git commit -m "feat: seed import + /api/export streaming identical workbook"
```

---

## Self-Review (against spec §3–§7, §11)

- **§6 data model** → Task 6 schema mirrors `PcnRow` + `id`/`imageUrl`/timestamps; `sort_seq` integer set on import (Task 7). ✓
- **§6 Excel mapping** → Task 3 column specs (Private 9 / Council 13) drive both import (Task 4) and export (Task 5). ✓
- **§7 export round-trip** → Task 5: regenerate only `<sheetData>`, copy other entries verbatim, bump `dimension`/`autoFilter`/CF/`dataValidation` (sheet) + `_xlnm._FilterDatabase` (workbook). Inline strings, serial dates, currency/date style indices, escaping. ✓
- **§7 ordering / ranges** (resolved decisions) → `buildSheetData` sorts by `sortSeq` asc; ranges **extended** to new last row. ✓
- **§10 testing** → Task 5 fidelity test (only sheets+workbook change; metadata/styles byte-identical; round-trip values equal) + unit tests; Task 2 conversion tests. ✓
- **§11 env** → `DATABASE_URL` (Task 6). Blob/Anthropic/auth secrets belong to Plan 2. ✓
- **Type consistency:** `PcnRow` field names identical across Tasks 3/4/5/7; `STYLE.currency="3"`/`STYLE.date="4"` used consistently; `buildXlsx`/`parseWorkbook`/`getRowsForExport` signatures match their call sites. ✓
- **Deferred to Plan 2 (not gaps):** UI on DB, PCN rebrand/copy, auth, OCR add-flow, the Export button. ✓

> First-run watch-items called out inline: the fidelity "changes only" test is byte-strict — if empty-cell representation legitimately differs, fall back to comparing parsed cell values for the two sheet XMLs (Task 5 Step 5); confirm the exact CF/dataValidation tokens from Task 5 Step 1 before trusting the range regexes.
