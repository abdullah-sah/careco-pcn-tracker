"use server";

import { eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { get } from "@vercel/blob";
import { db } from "@/db";
import { pcn } from "@/db/schema";
import { getAllPcns } from "@/db/queries";
import { toView, type PcnView } from "@/lib/pcn/view";
import type { Category, PcnRow } from "@/lib/pcn/types";
import { canSendToAli, statusesFor } from "@/lib/pcn/status";
import { getSessionRole, type Role } from "@/lib/auth";
import { sendPcnEmail } from "@/lib/email/send-to-ali";
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

export type UpdatePcnInput = Partial<{
  status: string | null;
  driverName: string | null; // admin only — silently dropped for other roles
  notes: string | null;
  aliFeePence: number | null; // 3000 | 4000; null clears the payment
  moneyRequested: boolean;
  driverPaid: boolean;
}>;

async function requireRole(): Promise<Role> {
  const role = await getSessionRole();
  if (!role) throw new Error("Not signed in");
  return role;
}

async function requireAdmin(): Promise<Role> {
  const role = await requireRole();
  if (role !== "admin") throw new Error("Not allowed");
  return role;
}

export async function createPcn(input: CreatePcnInput): Promise<PcnView> {
  const role = await requireAdmin();
  const [row] = await db
    .insert(pcn)
    .values({ ...input, updatedBy: role, sortSeq: sql`(select coalesce(max(${pcn.sortSeq}), 0) + 1 from ${pcn})` })
    .returning();
  if (!row) throw new Error("PCN not found");
  revalidatePath("/");
  return toView(row);
}

const ALI_FEES = [3000, 4000]; // £30 sent early, £40 delayed — the only amounts Ali charges
const today = () => new Date().toISOString().slice(0, 10);

export async function updatePcn(id: string, patch: UpdatePcnInput): Promise<PcnView> {
  const role = await requireRole();
  const [existing] = await db.select().from(pcn).where(eq(pcn.id, id)).limit(1);
  if (!existing) throw new Error("PCN not found");

  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: role };

  if ("status" in patch) {
    const s = patch.status ?? null;
    // Allow the category's list, or leaving a legacy value untouched.
    if (s !== null && s !== existing.status && !statusesFor(existing.category).includes(s))
      throw new Error("Invalid status");
    set.status = s;
  }
  if ("driverName" in patch && role === "admin") set.driverName = patch.driverName ?? null;
  if ("notes" in patch) set.notes = patch.notes ?? null;

  // Payment fields only exist for council tickets. Legacy text columns are
  // mirrored on every write so xlsx export/reset stays coherent.
  if (existing.category === "council") {
    if ("aliFeePence" in patch) {
      const fee = patch.aliFeePence ?? null;
      if (fee !== null && !ALI_FEES.includes(fee)) throw new Error("Ali's fee is £30 or £40");
      set.aliFeePence = fee;
      set.aliPaid = fee === null ? null : String(fee / 100);
      // Keep the original payment date when the fee is merely corrected later.
      set.aliPaidAt = fee === null ? null : existing.aliPaidAt ?? today();
    }
    if ("moneyRequested" in patch) {
      const on = patch.moneyRequested === true;
      set.moneyRequestedAt = on ? existing.moneyRequestedAt ?? today() : null;
      set.moneyRequested = on ? "Yes" : null;
    }
    if ("driverPaid" in patch) {
      const on = patch.driverPaid === true;
      set.driverPaidAt = on ? existing.driverPaidAt ?? today() : null;
      set.driverPaidPence = on ? existing.driverPaidPence ?? existing.discountedCostPence : null;
      set.driverPaid = on ? "Yes" : null;
    }
  }

  const [row] = await db.update(pcn).set(set).where(eq(pcn.id, id)).returning();
  if (!row) throw new Error("PCN not found");
  revalidatePath("/");
  return toView(row);
}

export type SendToAliResult = { ok: true } | { ok: false; error: string };

export async function sendToAli(id: string): Promise<SendToAliResult> {
  try {
    await requireRole();
    const [row] = await db.select().from(pcn).where(eq(pcn.id, id)).limit(1);
    if (!row) return { ok: false, error: "PCN not found." };
    if (!canSendToAli(row.category, row.status))
      return { ok: false, error: "Only new or new-correspondence council PCNs can be sent to Ali." };
    if (!row.imageUrl) return { ok: false, error: "No PCN image on file — add one first." };
    let attachment: { base64: string; contentType: string };
    try {
      const res = await get(row.imageUrl, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
      if (!res || res.statusCode !== 200) throw new Error(`blob fetch failed (${res?.statusCode})`);
      const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
      attachment = {
        base64: buf.toString("base64"),
        contentType: res.blob.contentType ?? res.headers.get("content-type") ?? "image/jpeg",
      };
    } catch (e) {
      console.error("sendToAli image fetch failed:", e);
      return { ok: false, error: "Couldn't load the PCN image — try again." };
    }
    try {
      await sendPcnEmail(row, attachment);
    } catch (e) {
      console.error("sendToAli email failed:", e);
      // sendPcnEmail throws user-friendly messages.
      return { ok: false, error: e instanceof Error ? e.message : "Send failed — try again." };
    }
    return { ok: true };
  } catch (e) {
    console.error("sendToAli failed:", e);
    return { ok: false, error: "Send failed — try again." };
  }
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
  let rows: PcnRow[];
  try {
    await requireAdmin();
    rows = await rowsFromUpload(fd);
  } catch (e) {
    return { ok: false, error: parseError(e) };
  }
  try {
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
    console.error("previewReset failed:", e);
    return { ok: false, error: "Couldn't check the register — try again." };
  }
}

export async function resetFromXlsx(fd: FormData): Promise<ResetResult> {
  let rows: PcnRow[];
  try {
    await requireAdmin();
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
