CREATE TYPE "public"."run_status" AS ENUM('pending', 'success', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."scrape_strategy" AS ENUM('http', 'browser', 'api');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"retailer_id" uuid NOT NULL,
	"retailer_sku" text NOT NULL,
	"product_url" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"latest_price_minor" integer,
	"latest_in_stock" boolean,
	"last_scraped_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_source_hash" text,
	"freshness_target_minutes" integer DEFAULT 1440 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"in_stock" boolean NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_hash" text NOT NULL,
	"parser_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gtin" text,
	"title" text NOT NULL,
	"brand" text,
	"category" text,
	"image_url" text,
	"fuzzy_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"strategy" "scrape_strategy" DEFAULT 'http' NOT NULL,
	"max_concurrency" integer DEFAULT 2 NOT NULL,
	"crawl_delay_ms" integer DEFAULT 1000 NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retailers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid,
	"retailer_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error" text,
	"duration_ms" integer,
	"parser_version" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offers" ADD CONSTRAINT "offers_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_history" ADD CONSTRAINT "price_history_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offers_retailer_sku_unique" ON "offers" USING btree ("retailer_id","retailer_sku");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offers_product_idx" ON "offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offers_stale_idx" ON "offers" USING btree ("last_scraped_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_offer_time_idx" ON "price_history" USING btree ("offer_id","scraped_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_gtin_unique" ON "products" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_fuzzy_key_idx" ON "products" USING btree ("fuzzy_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scrape_runs_retailer_time_idx" ON "scrape_runs" USING btree ("retailer_id","started_at");