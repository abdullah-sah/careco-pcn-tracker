"use server";

import { eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pcn } from "@/db/schema";
import { getAllPcns } from "@/db/queries";
import { toView, type PcnView } from "@/lib/pcn/view";
import type { Category, PcnRow } from "@/lib/pcn/types";
import { parseWorkbook } from "@/lib/xlsx/import";
import { reattachImages } from "@/lib/pcn/reattach-images";

export interface CreatePcnInput {
  category: Category;
  pcnNumber: string;
  authority: string;
  vehicleReg: string;
  costPence: number | null;
  fullCostPence: number | null;
  discountedCostPence: number | null;
  dateOfPcn: string | null;
  discountPeriodDays: number | null;
  driverName: string | null;
  status: string | null;
  notes: string | null;
  imageUrl: string | null;
}

export type UpdatePcnInput = Partial<
  Pick<PcnView, "status" | "driverName" | "notes" | "aliPaid" | "moneyRequested" | "driverPaid">
>;

export async function createPcn(input: CreatePcnInput): Promise<PcnView> {
  const [row] = await db
    .insert(pcn)
    .values({ ...input, sortSeq: sql`(select coalesce(max(${pcn.sortSeq}), 0) + 1 from ${pcn})` })
    .returning();
  if (!row) throw new Error("PCN not found");
  revalidatePath("/");
  return toView(row);
}

export async function updatePcn(id: string, patch: UpdatePcnInput): Promise<PcnView> {
  const [row] = await db
    .update(pcn)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pcn.id, id))
    .returning();
  if (!row) throw new Error("PCN not found");
  revalidatePath("/");
  return toView(row);
}

const MAX_XLSX_BYTES = 5 * 1024 * 1024;

export type ResetPreview =
  | { ok: true; fileRows: number; privateCount: number; councilCount: number; currentRows: number }
  | { ok: false; error: string };

export type ResetResult = { ok: true; pcns: PcnView[] } | { ok: false; error: string };

// Not exported: in a "use server" file every runtime export must be an action.
async function rowsFromUpload(fd: FormData): Promise<PcnRow[]> {
  const f = fd.get("file");
  if (!(f instanceof File)) throw new Error("No file uploaded.");
  if (f.size > MAX_XLSX_BYTES) throw new Error("File too large (max 5 MB).");
  return parseWorkbook(Buffer.from(await f.arrayBuffer()));
}

function parseError(e: unknown): string {
  return e instanceof Error ? e.message : "Couldn't read that file.";
}

export async function previewReset(fd: FormData): Promise<ResetPreview> {
  try {
    const rows = await rowsFromUpload(fd);
    const privateCount = rows.filter((r) => r.category === "private").length;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(pcn);
    return {
      ok: true,
      fileRows: rows.length,
      privateCount,
      councilCount: rows.length - privateCount,
      currentRows: n,
    };
  } catch (e) {
    return { ok: false, error: parseError(e) };
  }
}

export async function resetFromXlsx(fd: FormData): Promise<ResetResult> {
  let rows: PcnRow[];
  try {
    rows = await rowsFromUpload(fd);
  } catch (e) {
    return { ok: false, error: parseError(e) };
  }
  try {
    const existing = await db
      .select({ pcnNumber: pcn.pcnNumber, imageUrl: pcn.imageUrl })
      .from(pcn)
      .where(isNotNull(pcn.imageUrl));
    const records = reattachImages(rows, existing);
    // neon-http runs a batch as a single transaction: wipe + insert commit or fail together.
    if (records.length > 0) {
      await db.batch([db.delete(pcn), db.insert(pcn).values(records)]);
    } else {
      await db.batch([db.delete(pcn)]);
    }
  } catch (e) {
    console.error("resetFromXlsx failed:", e);
    return { ok: false, error: "Reset failed — register unchanged." };
  }
  revalidatePath("/");
  try {
    return { ok: true, pcns: await getAllPcns() };
  } catch {
    return { ok: false, error: "Reset done, but refreshing failed — reload the page." };
  }
}
