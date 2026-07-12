import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseWorkbook } from "../lib/xlsx/import";
import type { PcnSelect } from "./schema";

const XLSX_PATH =
  "/Users/abdullahsahraoui/Library/Mobile Documents/com~apple~CloudDocs/CARECO CAR DOX/careco-pcn-tracker.xlsx";

const key = (s: string) => s.trim().toLowerCase();

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const deleteArg = argv.find((a) => a.startsWith("--delete-ids="));
  const deleteIds = deleteArg
    ? deleteArg
        .slice("--delete-ids=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { apply, deleteIds };
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function main() {
  const { apply, deleteIds } = parseArgs(process.argv.slice(2));
  const { db } = await import("./index");
  const { pcn } = await import("./schema");
  const { eq, inArray } = await import("drizzle-orm");

  console.log(`=== merge-council-statuses (${apply ? "APPLY" : "DRY RUN"}) ===\n`);

  // --- Parse sheet: council rows only, last-occurrence-wins by key ---
  const buf = readFileSync(XLSX_PATH);
  const allRows = parseWorkbook(buf);
  const councilSheetRows = allRows.filter((r) => r.category === "council");
  const sheetByKey = new Map<string, (typeof councilSheetRows)[number]>();
  for (const r of councilSheetRows) sheetByKey.set(key(r.pcnNumber), r);
  console.log(
    `Sheet: ${councilSheetRows.length} council rows, ${sheetByKey.size} distinct keys (last-occurrence-wins).\n`,
  );

  // --- Load DB council rows ---
  const dbRows: PcnSelect[] = await db
    .select()
    .from(pcn)
    .where(eq(pcn.category, "council"));

  const dbByKey = new Map<string, PcnSelect[]>();
  for (const row of dbRows) {
    const k = key(row.pcnNumber);
    const list = dbByKey.get(k) ?? [];
    list.push(row);
    dbByKey.set(k, list);
  }

  const dupKeys = [...dbByKey.entries()].filter(([, list]) => list.length > 1);
  console.log(
    `DB: ${dbRows.length} council rows over ${dbByKey.size} distinct keys; ${dupKeys.length} duplicated keys.\n`,
  );

  // --- Duplicate pairs, full detail ---
  console.log("=== DUPLICATE PAIRS (choose one row per pair to DELETE via --delete-ids) ===");
  for (const [k, list] of dupKeys) {
    console.log(`\n--- duplicated key: "${k}" (${list.length} rows) ---`);
    for (const r of list.sort((a, b) => a.sortSeq - b.sortSeq)) {
      console.log(
        [
          `  id:            ${r.id}`,
          `  sortSeq:       ${r.sortSeq}`,
          `  pcnNumber:     ${fmt(r.pcnNumber)}`,
          `  vehicleReg:    ${fmt(r.vehicleReg)}`,
          `  driverName:    ${fmt(r.driverName)}`,
          `  status:        ${fmt(r.status)}`,
          `  aliPaid:       ${fmt(r.aliPaid)}  aliFeePence: ${fmt(r.aliFeePence)}  aliPaidAt: ${fmt(r.aliPaidAt)}`,
          `  moneyRequested:${fmt(r.moneyRequested)}  moneyRequestedAt: ${fmt(r.moneyRequestedAt)}`,
          `  driverPaid:    ${fmt(r.driverPaid)}  driverPaidPence: ${fmt(r.driverPaidPence)}  driverPaidAt: ${fmt(r.driverPaidAt)}`,
          `  notes:         ${fmt(r.notes)}`,
          `  hasImage:      ${r.imageUrl != null}`,
          `  createdAt:     ${fmt(r.createdAt)}`,
          `  updatedAt:     ${fmt(r.updatedAt)}`,
        ].join("\n"),
      );
    }
  }
  console.log("");

  // --- Resolve deletions against duplicate pairs ---
  const deleteIdSet = new Set(deleteIds);
  const rowById = new Map(dbRows.map((r) => [r.id, r] as const));

  // survivorByKey: after applying deletions, which single row survives each dup key
  const survivorByKey = new Map<string, PcnSelect>();
  const unresolvedDupKeys: string[] = [];
  for (const [k, list] of dupKeys) {
    const survivors = list.filter((r) => !deleteIdSet.has(r.id));
    if (survivors.length === 1) survivorByKey.set(k, survivors[0]);
    else unresolvedDupKeys.push(k);
  }

  // Validate provided delete ids
  const unknownDeleteIds = deleteIds.filter((id) => !rowById.has(id));
  const nonDupDeleteIds = deleteIds.filter((id) => {
    const r = rowById.get(id);
    return r && dbByKey.get(key(r.pcnNumber))!.length === 1;
  });

  // --- Compute status changes ---
  // For matching, use survivor for dup keys, the sole row otherwise.
  const willChange: { pcnNumber: string; from: string | null; to: string | null; id: string }[] = [];
  let alreadyInSync = 0;
  const sheetMissingFromDb: string[] = [];

  for (const [k, sheetRow] of sheetByKey) {
    const dbList = dbByKey.get(k);
    if (!dbList) {
      sheetMissingFromDb.push(sheetRow.pcnNumber);
      continue;
    }
    const target = survivorByKey.get(k) ?? (dbList.length === 1 ? dbList[0] : null);
    // If unresolved dup, we can't pick a target row for a definite change; note both.
    const targets = target ? [target] : dbList;
    for (const t of targets) {
      if ((t.status ?? null) === (sheetRow.status ?? null)) {
        alreadyInSync++;
      } else {
        willChange.push({
          pcnNumber: t.pcnNumber,
          from: t.status ?? null,
          to: sheetRow.status ?? null,
          id: t.id,
        });
      }
    }
  }

  const dbKeysUnmatched = [...dbByKey.keys()].filter((k) => !sheetByKey.has(k));

  console.log("=== PLANNED STATUS CHANGES ===");
  for (const c of willChange) {
    console.log(`  ${c.pcnNumber}: "${fmt(c.from)}" -> "${fmt(c.to)}"`);
  }
  if (willChange.length === 0) console.log("  (none)");
  console.log("");

  console.log("=== COUNTS ===");
  console.log(`  total sheet council rows:        ${councilSheetRows.length}`);
  console.log(`  distinct sheet keys:             ${sheetByKey.size}`);
  console.log(`  already in sync:                 ${alreadyInSync}`);
  console.log(`  will change:                     ${willChange.length}`);
  console.log(`  unmatched-in-DB (sheet->no DB):  ${sheetMissingFromDb.length}`);
  if (sheetMissingFromDb.length) console.log(`      ${sheetMissingFromDb.join(", ")}`);
  console.log(`  DB keys not present in sheet:    ${dbKeysUnmatched.length}`);
  if (dbKeysUnmatched.length) console.log(`      ${dbKeysUnmatched.join(", ")}`);
  console.log("");

  // --- Dedupe / blob action preview ---
  console.log("=== DEDUPE + BLOB ACTIONS (apply mode) ===");
  const blobPlans: { loserId: string; survivorId: string; action: string }[] = [];
  for (const [k, list] of dupKeys) {
    const loser = list.find((r) => deleteIdSet.has(r.id));
    const survivors = list.filter((r) => !deleteIdSet.has(r.id));
    if (!loser || survivors.length !== 1) {
      console.log(`  key "${k}": UNRESOLVED (need exactly one --delete-ids entry among this pair).`);
      continue;
    }
    const survivor = survivors[0];
    let action: string;
    if (loser.imageUrl && !survivor.imageUrl) action = `move imageUrl from loser -> survivor (DB update)`;
    else if (loser.imageUrl && survivor.imageUrl) action = `del() loser blob (both have images)`;
    else action = `no image action`;
    blobPlans.push({ loserId: loser.id, survivorId: survivor.id, action });
    console.log(`  key "${k}": delete ${loser.id}, keep ${survivor.id} -> ${action}`);
  }
  if (dupKeys.length === 0) console.log("  (no duplicate keys)");
  console.log("");

  console.log("=== APPLY-MODE BACKUP ===");
  console.log(`  Would dump full pcn table (${dbRows.length + (allRows.length - councilSheetRows.length)} council + private rows) to data/backups/pcn-backup-<ISO>.json`);
  console.log("");

  if (!apply) {
    console.log("DRY RUN complete. No writes performed. Re-run with --apply --delete-ids=... to execute.");
    return;
  }

  // ================= APPLY MODE =================
  // Guard: every duplicated key must resolve to exactly one survivor.
  const problems: string[] = [];
  if (unresolvedDupKeys.length)
    problems.push(`Unresolved duplicate keys (need exactly one survivor each): ${unresolvedDupKeys.join(", ")}`);
  if (unknownDeleteIds.length)
    problems.push(`--delete-ids reference unknown row ids: ${unknownDeleteIds.join(", ")}`);
  if (nonDupDeleteIds.length)
    problems.push(`--delete-ids reference non-duplicated rows (refusing): ${nonDupDeleteIds.join(", ")}`);
  if (problems.length) {
    console.error("REFUSING TO APPLY:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }

  // (a) Backup — full pcn table.
  const fullTable = await db.select().from(pcn);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("data/backups", { recursive: true });
  const backupPath = `data/backups/pcn-backup-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(fullTable, null, 2));
  console.log(`Backup written: ${backupPath} (${fullTable.length} rows).`);

  // (b) Dedupe deletions (+ blob handling).
  const { del } = await import("@vercel/blob");
  for (const [k, list] of dupKeys) {
    const loser = list.find((r) => deleteIdSet.has(r.id))!;
    const survivor = list.filter((r) => !deleteIdSet.has(r.id))[0];
    if (loser.imageUrl && !survivor.imageUrl) {
      await db.update(pcn).set({ imageUrl: loser.imageUrl }).where(eq(pcn.id, survivor.id));
      console.log(`[${k}] moved imageUrl to survivor ${survivor.id}`);
    } else if (loser.imageUrl && survivor.imageUrl) {
      await del(loser.imageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      console.log(`[${k}] deleted loser blob`);
    }
  }
  if (deleteIds.length) {
    await db.delete(pcn).where(inArray(pcn.id, deleteIds));
    console.log(`Deleted ${deleteIds.length} duplicate rows.`);
  }

  // (c) Status updates.
  let updated = 0;
  for (const [k, sheetRow] of sheetByKey) {
    const dbList = dbByKey.get(k);
    if (!dbList) continue;
    const target = survivorByKey.get(k) ?? dbList[0];
    if ((target.status ?? null) === (sheetRow.status ?? null)) continue;
    await db
      .update(pcn)
      .set({ status: sheetRow.status ?? null, updatedBy: "admin", updatedAt: new Date() })
      .where(eq(pcn.id, target.id));
    updated++;
  }
  console.log(`Status updated: ${updated} rows.`);
  console.log("APPLY complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
