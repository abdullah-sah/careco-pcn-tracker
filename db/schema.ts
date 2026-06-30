import { pgTable, uuid, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";

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
  aliPaid: text("ali_paid"),
  moneyRequested: text("money_requested"),
  driverPaid: text("driver_paid"),
  status: text("status"),
  notes: text("notes"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PcnInsert = typeof pcn.$inferInsert;
export type PcnSelect = typeof pcn.$inferSelect;
