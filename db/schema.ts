import { pgTable, uuid, integer, text, date, timestamp, pgEnum, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const categoryEnum = pgEnum("category", ["council", "private"]);

export const pcn = pgTable("pcn", {
  id: uuid("id").defaultRandom().primaryKey(),
  sortSeq: integer("sort_seq").notNull(),
  category: categoryEnum("category").notNull(),
  pcnNumber: text("pcn_number").notNull(),
  authority: text("authority").notNull().default(""),
  vehicleReg: text("vehicle_reg").notNull().default(""),
  costPence: integer("cost_pence"),
  fullCostPence: integer("full_cost_pence"),
  discountedCostPence: integer("discounted_cost_pence"),
  dateOfPcn: date("date_of_pcn"),
  discountPeriodDays: integer("discount_period_days"),
  driverName: text("driver_name"),
  // Legacy free-text columns, kept until Alan's UI proves out; server writes mirror
  // the structured columns below into these so xlsx export/reset stays coherent.
  aliPaid: text("ali_paid"),
  moneyRequested: text("money_requested"),
  driverPaid: text("driver_paid"),
  aliFeePence: integer("ali_fee_pence"),
  aliPaidAt: date("ali_paid_at"),
  moneyRequestedAt: date("money_requested_at"),
  driverPaidPence: integer("driver_paid_pence"),
  driverPaidAt: date("driver_paid_at"),
  // Stamped when status first becomes "Appeal won"; used for monthly money attribution.
  appealWonAt: date("appeal_won_at"),
  status: text("status"),
  notes: text("notes"),
  imageUrl: text("image_url"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Ali's fee is only ever £30 (sent early) or £40 (delayed) — reject typos like 300.
  check("pcn_ali_fee_30_or_40", sql`${t.aliFeePence} in (3000, 4000)`),
]);

export type PcnInsert = typeof pcn.$inferInsert;
export type PcnSelect = typeof pcn.$inferSelect;
