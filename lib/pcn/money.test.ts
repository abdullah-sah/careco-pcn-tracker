import { describe, expect, it } from "vitest";
import {
  aliFeePenceOf, computeMoney, daysSince, isCleared, isDriverPaid, isMoneyRequested,
  owedPence, recoveredPence, type MoneyPcn,
} from "./money";

const NOW = new Date(2026, 6, 12); // 12 Jul 2026 (local)

function pcn(over: Partial<MoneyPcn> = {}): MoneyPcn {
  return {
    category: "council", status: null, driverName: null,
    costPence: null, discountedCostPence: null,
    aliPaid: null, aliFeePence: null, aliPaidAt: null,
    moneyRequested: null, moneyRequestedAt: null,
    driverPaid: null, driverPaidPence: null, driverPaidAt: null,
    appealWonAt: null,
    ...over,
  };
}

describe("checkpoint truthiness", () => {
  it("reads legacy free text — only Yes counts", () => {
    expect(isDriverPaid(pcn({ driverPaid: "Yes" }))).toBe(true);
    expect(isDriverPaid(pcn({ driverPaid: "No" }))).toBe(false);
    expect(isDriverPaid(pcn({ driverPaid: "N/A" }))).toBe(false);
    expect(isMoneyRequested(pcn({ moneyRequested: "Yes" }))).toBe(true);
    expect(isMoneyRequested(pcn({ moneyRequested: "N/A" }))).toBe(false);
  });

  it("treats structured columns as set", () => {
    expect(isDriverPaid(pcn({ driverPaidAt: "2026-07-01" }))).toBe(true);
    expect(isDriverPaid(pcn({ driverPaidPence: 8000 }))).toBe(true);
    expect(isMoneyRequested(pcn({ moneyRequestedAt: "2026-07-01" }))).toBe(true);
  });
});

describe("aliFeePenceOf", () => {
  it("prefers the structured column and parses legacy 30/40 text", () => {
    expect(aliFeePenceOf(pcn({ aliFeePence: 4000, aliPaid: "30" }))).toBe(4000);
    expect(aliFeePenceOf(pcn({ aliPaid: "30" }))).toBe(3000);
    expect(aliFeePenceOf(pcn({ aliPaid: "40" }))).toBe(4000);
    expect(aliFeePenceOf(pcn({ aliPaid: "No" }))).toBe(null);
    expect(aliFeePenceOf(pcn({ aliPaid: "N/A" }))).toBe(null);
  });
});

describe("isCleared", () => {
  it("council needs driver paid AND a known Ali fee", () => {
    expect(isCleared(pcn({ driverPaid: "Yes", aliPaid: "40" }))).toBe(true);
    expect(isCleared(pcn({ driverPaid: "Yes" }))).toBe(false);
    expect(isCleared(pcn({ aliFeePence: 3000 }))).toBe(false);
  });

  it("council clears on a won appeal regardless of payment checkpoints", () => {
    expect(isCleared(pcn({ status: "Appeal won" }))).toBe(true);
    expect(isCleared(pcn({ status: "Appeal rejected" }))).toBe(false);
  });

  it("private clears via its Paid status (no payment checkpoints exist)", () => {
    expect(isCleared(pcn({ category: "private", status: "Paid" }))).toBe(true);
    expect(isCleared(pcn({ category: "private", status: "Message sent" }))).toBe(false);
  });
});

describe("amounts", () => {
  it("recovered uses the stored amount, falling back to the flat £80 for council", () => {
    expect(recoveredPence(pcn({ driverPaidPence: 11000 }))).toBe(11000);
    expect(recoveredPence(pcn({ driverPaid: "Yes" }))).toBe(8000);
  });

  it("owed is the flat £80 for council, the ticket cost for private", () => {
    expect(owedPence(pcn({ discountedCostPence: 3500 }))).toBe(8000);
    expect(owedPence(pcn({ category: "private", costPence: 6000 }))).toBe(6000);
  });
});

describe("daysSince", () => {
  it("counts whole days and handles null", () => {
    expect(daysSince("2026-07-12", NOW)).toBe(0);
    expect(daysSince("2026-06-12", NOW)).toBe(30);
    expect(daysSince("2026-05-01", NOW)).toBe(72);
    expect(daysSince(null, NOW)).toBe(null);
  });
});

describe("computeMoney", () => {
  it("splits recovered and saved into all-time and calendar-month figures", () => {
    const m = computeMoney([
      pcn({ driverPaid: "Yes", driverPaidPence: 8000, driverPaidAt: "2026-07-03", aliFeePence: 3000, aliPaidAt: "2026-07-04" }),
      pcn({ driverPaid: "Yes", driverPaidPence: 11000, driverPaidAt: "2026-06-20", aliFeePence: 4000, aliPaidAt: "2026-06-21" }),
      pcn({ driverPaid: "Yes", aliPaid: "30" }), // legacy: undated, no amount → £80, all-time only
    ], NOW);
    expect(m.recovered).toEqual({ allPence: 27000, allCount: 3, monthPence: 8000, monthCount: 1 });
    expect(m.saved).toEqual({ allPence: 24000, allCount: 3, monthPence: 8000, monthCount: 1 });
  });

  it("attributes a council clear to the month its second checkpoint landed", () => {
    const m = computeMoney([
      pcn({ driverPaid: "Yes", driverPaidPence: 8000, driverPaidAt: "2026-06-28", aliFeePence: 4000, aliPaidAt: "2026-07-02" }),
    ], NOW);
    expect(m.saved.monthCount).toBe(1);
    expect(m.profit.council.monthPence).toBe(4000);
  });

  it("keeps council and private profit streams separate", () => {
    const m = computeMoney([
      pcn({ driverPaid: "Yes", driverPaidPence: 8000, driverPaidAt: "2026-07-03", aliFeePence: 3000, aliPaidAt: "2026-07-03" }),
      pcn({ driverPaid: "Yes", aliPaid: "40" }), // legacy cleared → all-time only
      pcn({ category: "private", status: "Paid" }),
      pcn({ category: "private", status: "Canceled" }),
    ], NOW);
    expect(m.profit.council).toEqual({ allPence: 5000 + 4000, allCount: 2, monthPence: 5000, monthCount: 1 });
    expect(m.profit.private).toEqual({ allPence: 6000, allCount: 1, monthPence: 0, monthCount: 0 });
  });

  it("counts a won appeal as saved and profit but never recovered", () => {
    const m = computeMoney([
      pcn({ status: "Appeal won", appealWonAt: "2026-07-05" }), // this month, no Ali fee
      pcn({ status: "Appeal won", appealWonAt: "2026-06-10", aliFeePence: 3000 }), // last month, fee paid pre-win
      pcn({ status: "Appeal won" }), // legacy: no stamp → all-time only
    ], NOW);
    expect(m.recovered).toEqual({ allPence: 0, allCount: 0, monthPence: 0, monthCount: 0 });
    expect(m.saved).toEqual({ allPence: 24000, allCount: 3, monthPence: 8000, monthCount: 1 });
    expect(m.profit.council).toEqual({ allPence: 8000 + 5000 + 8000, allCount: 3, monthPence: 8000, monthCount: 1 });
  });

  it("builds the owed totals, ageing buckets and top debtors", () => {
    const m = computeMoney([
      pcn({ driverName: "Amir", moneyRequestedAt: "2026-07-01" }), // 11 days → 0–30
      pcn({ driverName: "Amir", moneyRequestedAt: "2026-05-30" }), // 43 days → 31–60
      pcn({ driverName: "Bea", moneyRequested: "Yes" }), // undated legacy → 60+
      pcn({ driverName: "Cal", moneyRequestedAt: "2026-03-01" }), // 133 days → 60+
      pcn({ driverName: "Dan", moneyRequestedAt: "2026-07-05", driverPaid: "Yes" }), // paid → not owed
    ], NOW);
    expect(m.owed.totalPence).toBe(32000);
    expect(m.owed.tickets).toBe(4);
    expect(m.owed.drivers).toBe(3);
    expect(m.owed.ageing.d0to30).toEqual({ pence: 8000, count: 1 });
    expect(m.owed.ageing.d31to60).toEqual({ pence: 8000, count: 1 });
    expect(m.owed.ageing.d60plus).toEqual({ pence: 16000, count: 2 });
    expect(m.owed.top.map((d) => d.name)).toEqual(["Amir", "Bea", "Cal"]);
    expect(m.owed.top[0]).toEqual({ name: "Amir", pence: 16000, tickets: 2, oldestDays: 43 });
    expect(m.owed.top[1].oldestDays).toBe(null); // undated legacy debt — age unknown
  });

  it("groups unnamed debtors under Unassigned and caps the list at three", () => {
    const m = computeMoney([
      pcn({ moneyRequested: "Yes" }),
      pcn({ driverName: "  ", moneyRequested: "Yes" }),
      pcn({ driverName: "A", moneyRequested: "Yes" }),
      pcn({ driverName: "B", moneyRequested: "Yes" }),
      pcn({ driverName: "C", moneyRequestedAt: "2026-07-01" }),
    ], NOW);
    expect(m.owed.drivers).toBe(4);
    expect(m.owed.top).toHaveLength(3);
    expect(m.owed.top[0]).toMatchObject({ name: "Unassigned", pence: 16000, tickets: 2 });
  });
});
