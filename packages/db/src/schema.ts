import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const scrapeStrategy = pgEnum("scrape_strategy", ["http", "browser", "api"]);
export const runStatus = pgEnum("run_status", ["pending", "success", "failed", "skipped"]);

/** A retailer we scrape. One adapter per retailer, keyed by `slug`. */
export const retailers = pgTable("retailers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  strategy: scrapeStrategy("strategy").notNull().default("http"),
  /** Politeness controls so scaling out never violates a site's limits. */
  maxConcurrency: integer("max_concurrency").notNull().default(2),
  crawlDelayMs: integer("crawl_delay_ms").notNull().default(1000),
  /** Free-form ToS/robots posture notes for legal guardrails. */
  policy: jsonb("policy").$type<Record<string, unknown>>().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Canonical product, shared across retailers. GTIN is the cross-retailer key. */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gtin: text("gtin"),
    title: text("title").notNull(),
    brand: text("brand"),
    category: text("category"),
    imageUrl: text("image_url"),
    /** Lowercased "brand title" for fallback matching when GTIN is absent. */
    fuzzyKey: text("fuzzy_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    gtinUnique: uniqueIndex("products_gtin_unique").on(t.gtin),
    fuzzyIdx: index("products_fuzzy_key_idx").on(t.fuzzyKey),
  }),
);

/**
 * Alternative names for a product. Different shops name the same item slightly
 * differently; when the canonical `products.title` finds no match at a shop, the
 * sync path retries the search with each alias (ordered by `position`).
 */
export const productAliases = pgTable(
  "product_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("product_aliases_product_idx").on(t.productId),
  }),
);

/**
 * A product *at a retailer*. Holds denormalized "current state" (`latest*`) for
 * O(1) reads on the UI path, plus `lastSourceHash` for idempotent upserts.
 */
export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),
    retailerSku: text("retailer_sku").notNull(),
    productUrl: text("product_url").notNull(),
    currency: text("currency").notNull().default("USD"),
    latestPriceMinor: integer("latest_price_minor"),
    latestInStock: boolean("latest_in_stock"),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastSourceHash: text("last_source_hash"),
    /** How fresh this offer should be kept, in minutes. Drives the scheduler. */
    freshnessTargetMinutes: integer("freshness_target_minutes").notNull().default(1440),
    enabled: boolean("enabled").notNull().default(true),
    /** Deal columns — populated by recordScrape after each price write. */
    referencePriceMinor: integer("reference_price_minor"),
    onSale: boolean("on_sale").notNull().default(false),
    reductionBps: integer("reduction_bps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    retailerSkuUnique: uniqueIndex("offers_retailer_sku_unique").on(t.retailerId, t.retailerSku),
    productIdx: index("offers_product_idx").on(t.productId),
    staleIdx: index("offers_stale_idx").on(t.lastScrapedAt),
    onSaleReductionIdx: index("offers_on_sale_reduction_idx").on(t.onSale, t.reductionBps),
  }),
);

/** Append-only price time series. Partition by month once it grows. */
export const priceHistory = pgTable(
  "price_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    inStock: boolean("in_stock").notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
    sourceHash: text("source_hash").notNull(),
    parserVersion: text("parser_version").notNull(),
  },
  (t) => ({
    offerTimeIdx: index("price_history_offer_time_idx").on(t.offerId, t.scrapedAt),
  }),
);

/** Audit/observability row for every scrape attempt. */
export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailers.id, { onDelete: "cascade" }),
    status: runStatus("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(1),
    error: text("error"),
    durationMs: integer("duration_ms"),
    parserVersion: text("parser_version"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    retailerTimeIdx: index("scrape_runs_retailer_time_idx").on(t.retailerId, t.startedAt),
  }),
);

/** Per-offer alert subscription (single-household, no auth). */
export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  offerId: uuid("offer_id")
    .notNull()
    .unique()
    .references(() => offers.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  targetPriceMinor: integer("target_price_minor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** AI-generated or user-installed scraper plugins, loaded lazily by the worker. */
export const scraperPlugins = pgTable("scraper_plugins", {
  slug: text("slug").primaryKey(),
  displayName: text("display_name").notNull(),
  baseUrl: text("base_url").notNull(),
  bundleJs: text("bundle_js").notNull(),
  /** Bumped on each upsert so the worker's in-process cache invalidates. */
  version: text("version").notNull().default("1"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-call log of Anthropic (Claude) API usage, for the admin cost dashboard.
 * One row per API call (generator, judge, …). Cost is stored in USD micro-dollars
 * (1e-6 USD) as an integer to avoid float drift.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    route: text("route").notNull(),
    operation: text("operation").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
  },
  (t) => ({ createdIdx: index("ai_usage_created_idx").on(t.createdAt) }),
);

export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;

/**
 * Per-request web-traffic log, for the admin dashboard. Populated by the Next.js
 * middleware with the client IP (from X-Forwarded-For) and offline geolocation.
 */
export const requestLogs = pgTable(
  "request_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
  },
  (t) => ({ createdIdx: index("request_logs_created_idx").on(t.createdAt) }),
);

export type RequestLogRow = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;

export type Retailer = typeof retailers.$inferSelect;
export type NewRetailer = typeof retailers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductAlias = typeof productAliases.$inferSelect;
export type NewProductAlias = typeof productAliases.$inferInsert;
export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type ScraperPlugin = typeof scraperPlugins.$inferSelect;
export type NewScraperPlugin = typeof scraperPlugins.$inferInsert;

/** Single-row table tracking when demo data was last modified by a visitor. */
export const demoState = pgTable("demo_state", {
  id: integer("id").primaryKey().default(1),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
});
