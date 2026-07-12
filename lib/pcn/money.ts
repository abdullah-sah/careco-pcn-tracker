import type { PcnView } from "./view";

// Every ticket arrives in the owner's name, so an unrecovered council ticket is a
// flat £80 cost to the business; drivers pay that £80 back when a ticket clears.
export const COUNCIL_RECOVERY_PENCE = 8000;
// Flat margin the business makes on each cleared private ticket.
export const PRIVATE_PROFIT_PENCE = 6000;

export type MoneyPcn = Pick<
  PcnView,
  | "category" | "status" | "driverName" | "costPence" | "discountedCostPence"
  | "aliPaid" | "aliFeePence" | "aliPaidAt"
  | "moneyRequested" | "moneyRequestedAt"
  | "driverPaid" | "driverPaidPence" | "driverPaidAt"
>;

// Legacy spreadsheet rows hold free text ("Yes" / "No" / "N/A"); only "Yes" counts.
const yes = (s: string | null) => (s ?? "").trim().toLowerCase() === "yes";

// Legacy rows record Ali's fee as "30" / "40" text; the structured column wins.
export function aliFeePenceOf(p: MoneyPcn): number | null {
  if (p.aliFeePence != null) return p.aliFeePence;
  const t = (p.aliPaid ?? "").trim();
  return t === "30" ? 3000 : t === "40" ? 4000 : null;
}

export const isDriverPaid = (p: MoneyPcn): boolean =>
  yes(p.driverPaid) || p.driverPaidAt != null || p.driverPaidPence != null;

export const isMoneyRequested = (p: MoneyPcn): boolean =>
  yes(p.moneyRequested) || p.moneyRequestedAt != null;

// Private tickets have no payment checkpoints — their lifecycle's "Paid" status is
// the clearing event. Council clears only once the driver paid AND Ali's fee is known.
export function isCleared(p: MoneyPcn): boolean {
  return p.category === "council"
    ? isDriverPaid(p) && aliFeePenceOf(p) != null
    : p.status === "Paid" || isDriverPaid(p);
}

// Actual amount recovered; legacy "Yes" rows carry no amount, so assume the flat £80.
export function recoveredPence(p: MoneyPcn): number {
  return p.driverPaidPence ?? (p.category === "council" ? COUNCIL_RECOVERY_PENCE : p.costPence ?? p.discountedCostPence ?? 0);
}

export function owedPence(p: MoneyPcn): number {
  return p.category === "council" ? COUNCIL_RECOVERY_PENCE : p.costPence ?? p.discountedCostPence ?? 0;
}

// A council ticket is "cleared" when its second checkpoint lands.
function clearedAtOf(p: MoneyPcn): string | null {
  if (p.category !== "council") return p.driverPaidAt;
  const ds = [p.driverPaidAt, p.aliPaidAt].filter((d): d is string => d != null).sort();
  return ds.length ? ds[ds.length - 1] : null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKeyOf = (now: Date) => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
const inMonth = (iso: string | null, monthKey: string) => iso != null && iso.slice(0, 7) === monthKey;

// Whole days between an ISO date and "now" (local calendar dates, DST-safe via UTC).
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((b - a) / 86_400_000);
}

export interface Totals { allPence: number; allCount: number; monthPence: number; monthCount: number }
export interface AgeBucket { pence: number; count: number }
export interface Debtor { name: string; pence: number; tickets: number; oldestDays: number | null }

export interface MoneySummary {
  recovered: Totals;
  saved: Totals;
  profit: { council: Totals; private: Totals };
  owed: {
    totalPence: number;
    tickets: number;
    drivers: number;
    ageing: { d0to30: AgeBucket; d31to60: AgeBucket; d60plus: AgeBucket };
    top: Debtor[];
  };
}

const emptyTotals = (): Totals => ({ allPence: 0, allCount: 0, monthPence: 0, monthCount: 0 });

function add(t: Totals, pence: number, isThisMonth: boolean): void {
  t.allPence += pence;
  t.allCount += 1;
  if (isThisMonth) {
    t.monthPence += pence;
    t.monthCount += 1;
  }
}

export function computeMoney(pcns: MoneyPcn[], now: Date): MoneySummary {
  const monthKey = monthKeyOf(now);
  const recovered = emptyTotals();
  const saved = emptyTotals();
  const council = emptyTotals();
  const priv = emptyTotals();

  const ageing = { d0to30: { pence: 0, count: 0 }, d31to60: { pence: 0, count: 0 }, d60plus: { pence: 0, count: 0 } };
  const debtors = new Map<string, Debtor & { undated: boolean }>();
  let owedTotal = 0;
  let owedTickets = 0;

  for (const p of pcns) {
    if (isDriverPaid(p)) add(recovered, recoveredPence(p), inMonth(p.driverPaidAt, monthKey));

    if (isCleared(p)) {
      const clearedThisMonth = inMonth(clearedAtOf(p), monthKey);
      if (p.category === "council") {
        add(saved, COUNCIL_RECOVERY_PENCE, clearedThisMonth);
        add(council, COUNCIL_RECOVERY_PENCE - (aliFeePenceOf(p) ?? 0), clearedThisMonth);
      } else {
        add(priv, PRIVATE_PROFIT_PENCE, clearedThisMonth);
      }
    }

    if (isMoneyRequested(p) && !isDriverPaid(p)) {
      const pence = owedPence(p);
      owedTotal += pence;
      owedTickets += 1;
      const age = daysSince(p.moneyRequestedAt, now);
      // Undated requests predate date stamping (legacy spreadsheet rows) → oldest bucket.
      const bucket = age == null || age > 60 ? ageing.d60plus : age <= 30 ? ageing.d0to30 : ageing.d31to60;
      bucket.pence += pence;
      bucket.count += 1;

      const name = (p.driverName ?? "").trim() || "Unassigned";
      const d = debtors.get(name) ?? { name, pence: 0, tickets: 0, oldestDays: null, undated: false };
      d.pence += pence;
      d.tickets += 1;
      if (age == null) d.undated = true;
      else if (d.oldestDays == null || age > d.oldestDays) d.oldestDays = age;
      debtors.set(name, d);
    }
  }

  const top = [...debtors.values()]
    .sort((a, b) => b.pence - a.pence)
    .slice(0, 3)
    // An undated debt is a legacy row and definitionally the oldest → age unknown.
    .map(({ undated, ...d }) => ({ ...d, oldestDays: undated ? null : d.oldestDays }));

  return {
    recovered,
    saved,
    profit: { council, private: priv },
    owed: { totalPence: owedTotal, tickets: owedTickets, drivers: debtors.size, ageing, top },
  };
}
