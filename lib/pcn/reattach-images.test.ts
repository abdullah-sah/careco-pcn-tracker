import { describe, it, expect } from "vitest";
import { reattachImages } from "./reattach-images";
import type { PcnRow } from "./types";

function row(pcnNumber: string): PcnRow {
  return {
    sortSeq: 1, category: "council", pcnNumber, authority: "Ealing", vehicleReg: "AB12 CDE",
    costPence: null, fullCostPence: 13000, discountedCostPence: 6500, dateOfPcn: "2026-06-01",
    discountPeriodDays: 14, driverName: null, aliPaid: null, moneyRequested: null,
    driverPaid: null, status: null, notes: null,
  };
}

describe("reattachImages", () => {
  it("attaches imageUrl where PCN number matches", () => {
    const out = reattachImages([row("WE111")], [{ pcnNumber: "WE111", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBe("blob://a");
  });
  it("leaves imageUrl null when unmatched", () => {
    const out = reattachImages([row("WE111")], [{ pcnNumber: "ZZ999", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBeNull();
  });
  it("matches case-insensitively and trims whitespace", () => {
    const out = reattachImages([row("  we111 ")], [{ pcnNumber: "WE111", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBe("blob://a");
  });
  it("never matches blank PCN numbers", () => {
    const out = reattachImages([row("   ")], [{ pcnNumber: "  ", imageUrl: "blob://a" }]);
    expect(out[0].imageUrl).toBeNull();
  });
  it("skips existing entries with null imageUrl", () => {
    const out = reattachImages([row("WE111")], [{ pcnNumber: "WE111", imageUrl: null }]);
    expect(out[0].imageUrl).toBeNull();
  });
  it("first wins on duplicate existing PCN numbers", () => {
    const out = reattachImages(
      [row("WE111")],
      [{ pcnNumber: "WE111", imageUrl: "blob://first" }, { pcnNumber: "WE111", imageUrl: "blob://second" }],
    );
    expect(out[0].imageUrl).toBe("blob://first");
  });
  it("preserves all row fields", () => {
    const r = row("WE111");
    const out = reattachImages([r], []);
    expect(out[0]).toEqual({ ...r, imageUrl: null });
  });
});
