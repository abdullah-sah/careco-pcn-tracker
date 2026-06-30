import { asc } from "drizzle-orm";
import { db } from "./index";
import { pcn } from "./schema";
import type { PcnRow } from "../lib/pcn/types";

export async function getRowsForExport(): Promise<PcnRow[]> {
  const rows = await db.select().from(pcn).orderBy(asc(pcn.sortSeq));
  return rows.map((r) => ({
    sortSeq: r.sortSeq,
    category: r.category,
    pcnNumber: r.pcnNumber,
    authority: r.authority,
    vehicleReg: r.vehicleReg,
    costPence: r.costPence,
    fullCostPence: r.fullCostPence,
    discountedCostPence: r.discountedCostPence,
    dateOfPcn: r.dateOfPcn,
    discountPeriodDays: r.discountPeriodDays,
    driverName: r.driverName,
    aliPaid: r.aliPaid,
    moneyRequested: r.moneyRequested,
    driverPaid: r.driverPaid,
    status: r.status,
    notes: r.notes,
  }));
}
