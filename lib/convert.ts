const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30
const DAY_MS = 86_400_000;

export function poundsToPence(n: number): number {
  return Math.round(n * 100);
}

export function penceToPounds(p: number): number {
  return p / 100;
}

export function dateToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_MS) / DAY_MS);
}

export function serialToDate(serial: number): string {
  const dt = new Date(EXCEL_EPOCH_MS + serial * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
