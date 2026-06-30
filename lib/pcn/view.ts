import type { PcnSelect } from "@/db/schema";

export type PcnView = Omit<PcnSelect, "createdAt" | "updatedAt">;

export function toView(r: PcnSelect): PcnView {
  const { createdAt: _c, updatedAt: _u, ...rest } = r;
  return rest;
}
