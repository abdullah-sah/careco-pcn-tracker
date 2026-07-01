"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pcn } from "@/db/schema";
import { toView, type PcnView } from "@/lib/pcn/view";
import type { Category } from "@/lib/pcn/types";

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
