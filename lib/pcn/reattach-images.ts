import type { PcnRow } from "./types";

export interface ExistingImageRef {
  pcnNumber: string;
  imageUrl: string | null;
}

const key = (pcnNumber: string) => pcnNumber.trim().toLowerCase();

/** Carry imageUrl over from the old rows onto freshly-parsed file rows, by PCN number. */
export function reattachImages(
  rows: PcnRow[],
  existing: ExistingImageRef[],
): (PcnRow & { imageUrl: string | null })[] {
  const map = new Map<string, string>();
  for (const e of existing) {
    const k = key(e.pcnNumber);
    if (!k || e.imageUrl == null) continue;
    if (!map.has(k)) map.set(k, e.imageUrl); // first wins
  }
  return rows.map((r) => ({ ...r, imageUrl: map.get(key(r.pcnNumber)) ?? null }));
}
