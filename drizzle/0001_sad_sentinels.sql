ALTER TABLE "pcn" ADD COLUMN "ali_fee_pence" integer;--> statement-breakpoint
ALTER TABLE "pcn" ADD COLUMN "ali_paid_at" date;--> statement-breakpoint
ALTER TABLE "pcn" ADD COLUMN "money_requested_at" date;--> statement-breakpoint
ALTER TABLE "pcn" ADD COLUMN "driver_paid_pence" integer;--> statement-breakpoint
ALTER TABLE "pcn" ADD COLUMN "driver_paid_at" date;--> statement-breakpoint
ALTER TABLE "pcn" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "pcn" ADD CONSTRAINT "pcn_ali_fee_30_or_40" CHECK ("pcn"."ali_fee_pence" in (3000, 4000));--> statement-breakpoint
UPDATE "pcn" SET "ali_fee_pence" = 3000, "ali_paid_at" = "updated_at"::date WHERE "ali_paid" = '30';--> statement-breakpoint
UPDATE "pcn" SET "ali_fee_pence" = 4000, "ali_paid_at" = "updated_at"::date WHERE "ali_paid" = '40';--> statement-breakpoint
UPDATE "pcn" SET "money_requested_at" = "updated_at"::date WHERE "money_requested" = 'Yes';--> statement-breakpoint
UPDATE "pcn" SET "driver_paid_at" = "updated_at"::date, "driver_paid_pence" = "discounted_cost_pence" WHERE "driver_paid" = 'Yes';
