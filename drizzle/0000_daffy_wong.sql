CREATE TYPE "public"."category" AS ENUM('council', 'private');--> statement-breakpoint
CREATE TABLE "pcn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sort_seq" integer NOT NULL,
	"category" "category" NOT NULL,
	"pcn_number" text NOT NULL,
	"authority" text DEFAULT '' NOT NULL,
	"vehicle_reg" text DEFAULT '' NOT NULL,
	"cost_pence" integer,
	"full_cost_pence" integer,
	"discounted_cost_pence" integer,
	"date_of_pcn" date,
	"discount_period_days" integer,
	"driver_name" text,
	"ali_paid" text,
	"money_requested" text,
	"driver_paid" text,
	"status" text,
	"notes" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
