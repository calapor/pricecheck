CREATE TABLE IF NOT EXISTS "scraper_plugins" (
	"slug" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"base_url" text NOT NULL,
	"bundle_js" text NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
