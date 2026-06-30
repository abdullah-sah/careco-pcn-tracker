export type Category = "council" | "private";

export interface PcnRow {
  sortSeq: number;
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
  aliPaid: string | null;
  moneyRequested: string | null;
  driverPaid: string | null;
  status: string | null;
  notes: string | null;
}
