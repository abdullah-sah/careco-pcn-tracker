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
  it("yields null (never NaN) for numeric fields", () => {
    for (const r of rows) {
      for (const k of ["costPence", "fullCostPence", "discountedCostPence", "discountPeriodDays"] as const) {
        expect(Number.isNaN(r[k] as number)).toBe(false);
      }
    }
  });
  it("all non-null dates are valid ISO (no NaN-NaN-NaN)", () => {
    for (const r of rows) {
      if (r.dateOfPcn !== null) expect(r.dateOfPcn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
