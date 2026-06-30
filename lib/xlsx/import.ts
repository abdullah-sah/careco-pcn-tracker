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
