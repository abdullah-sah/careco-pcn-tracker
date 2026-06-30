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
