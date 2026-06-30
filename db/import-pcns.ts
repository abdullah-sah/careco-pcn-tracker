import { config } from "dotenv";
config({ path: ".env.development.local" });
import { parseWorkbook } from "../lib/xlsx/import";
import { TEMPLATE_B64 } from "../lib/xlsx/template-data";
import type { PcnInsert } from "./schema";

async function main() {
  const { db } = await import("./index");
  const { pcn } = await import("./schema");

  const existing = await db.select({ id: pcn.id }).from(pcn).limit(1);
  if (existing.length > 0) {
    console.log("pcn table not empty — refusing to re-import.");
    return;
  }

  const rows = parseWorkbook(Buffer.from(TEMPLATE_B64, "base64"));

  const records: PcnInsert[] = rows.map((r) => ({
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
  await db.insert(pcn).values(records);
  console.log(`Imported ${records.length} PCNs.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
