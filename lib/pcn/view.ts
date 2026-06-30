import type { PcnSelect } from "@/db/schema";

export type PcnView = Omit<PcnSelect, "createdAt" | "updatedAt" | "imageUrl"> & {
  hasImage: boolean;
};

export function toView(r: PcnSelect): PcnView {
  const { createdAt: _c, updatedAt: _u, imageUrl, ...rest } = r;
  return { ...rest, hasImage: imageUrl != null };
}
