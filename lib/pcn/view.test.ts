import { describe, it, expect } from "vitest";
import { toView } from "./view";

describe("toView", () => {
  it("drops timestamps and keeps domain fields", () => {
    const row: any = {
      id: "x", sortSeq: 1, category: "council", pcnNumber: "P1", authority: "Brent",
      vehicleReg: "AB12CDE", costPence: null, fullCostPence: 16000, discountedCostPence: 8000,
      dateOfPcn: "2026-06-19", discountPeriodDays: 14, driverName: null, aliPaid: null,
      moneyRequested: null, driverPaid: null, status: "Paid", notes: null, imageUrl: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const v = toView(row);
    expect(v).not.toHaveProperty("createdAt");
    expect(v.fullCostPence).toBe(16000);
    expect(v.pcnNumber).toBe("P1");
  });
});
