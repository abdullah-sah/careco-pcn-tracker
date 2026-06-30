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
    expect(v).not.toHaveProperty("imageUrl");
    expect(v.hasImage).toBe(false);
  });

  it("sets hasImage true when imageUrl present", () => {
    const row: any = {
      id: "y", sortSeq: 2, category: "private", pcnNumber: "P2", authority: "NCP",
      vehicleReg: "XY99ZZZ", costPence: 10000, fullCostPence: null, discountedCostPence: null,
      dateOfPcn: "2026-06-20", discountPeriodDays: null, driverName: null, aliPaid: null,
      moneyRequested: null, driverPaid: null, status: null, notes: null,
      imageUrl: "https://blob.example.com/pcn.jpg",
      createdAt: new Date(), updatedAt: new Date(),
    };
    const v = toView(row);
    expect(v).not.toHaveProperty("imageUrl");
    expect(v.hasImage).toBe(true);
  });
});
