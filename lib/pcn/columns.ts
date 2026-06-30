import type { PcnRow } from "./types";

export type ColKind = "string" | "currency" | "date" | "number" | "paidish";
export interface ColSpec { field: keyof PcnRow; kind: ColKind }

export const STYLE = { currency: "3", date: "4" } as const;

export const PRIVATE_COLS: ColSpec[] = [
  { field: "pcnNumber", kind: "string" },
  { field: "authority", kind: "string" },
  { field: "vehicleReg", kind: "string" },
  { field: "costPence", kind: "currency" },
  { field: "dateOfPcn", kind: "date" },
  { field: "discountPeriodDays", kind: "number" },
  { field: "driverName", kind: "string" },
  { field: "status", kind: "string" },
  { field: "notes", kind: "string" },
];

export const COUNCIL_COLS: ColSpec[] = [
  { field: "pcnNumber", kind: "string" },
  { field: "authority", kind: "string" },
  { field: "vehicleReg", kind: "string" },
  { field: "fullCostPence", kind: "currency" },
  { field: "discountedCostPence", kind: "currency" },
  { field: "dateOfPcn", kind: "date" },
  { field: "discountPeriodDays", kind: "number" },
  { field: "driverName", kind: "string" },
  { field: "aliPaid", kind: "paidish" },
  { field: "moneyRequested", kind: "paidish" },
  { field: "driverPaid", kind: "paidish" },
  { field: "status", kind: "string" },
  { field: "notes", kind: "string" },
];
