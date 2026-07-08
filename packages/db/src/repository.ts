import type { Money, ScrapeResult } from "@pricecheck/core";
import { computeDeal } from "@pricecheck/core";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  aiUsage,
  alerts,
  demoState,
  offers,
  priceHistory,
  productAliases,
  products,
  requestLogs,
  retailers,
  scraperPlugins,
} from "./schema";
import type { AiUsageRow, RequestLogRow } from "./schema";

export interface RecordScrapeOutcome {
  /** True when the price/stock changed (a new history row was written). */
  changed: boolean;
  /** The price held before this scrape, for anomaly detection. Null if first scrape. */
  previousPrice: Money | null;
}

/**
 * Idempotently persist a scrape result for an offer. If the result's
 * `sourceHash` matches what we already have, we only bump freshness timestamps
 * (no duplicate history row) — making at-least-once queue retries safe.
 */
export async function recordScrape(
  db: Database,
  offerId: string,
  result: ScrapeResult,
  scrapedAt = new Date(),
): Promise<RecordScrapeOutcome> {
  return db.transaction(async (tx) => {
    const [offer] = await tx
      .select({
        productId: offers.productId,
        lastSourceHash: offers.lastSourceHash,
        latestPriceMinor: offers.latestPriceMinor,
        currency: offers.currency,
      })
      .from(offers)
      .where(eq(offers.id, offerId))
      .for("update");

    if (!offer) throw new Error(`Offer ${offerId} not found`);

    // Capture a product thumbnail from the first scrape that yields one. Only set
    // it when the product has no image yet, so a manual choice is never clobbered.
    if (result.imageUrl) {
      await tx
        .update(products)
        .set({ imageUrl: result.imageUrl })
        .where(and(eq(products.id, offer.productId), isNull(products.imageUrl)));
    }

    const previousPrice: Money | null =
      offer.latestPriceMinor != null
        ? { amountMinor: offer.latestPriceMinor, currency: offer.currency }
        : null;
    const changed = offer.lastSourceHash !== result.sourceHash;

    if (changed) {
      await tx.insert(priceHistory).values({
        offerId,
        priceMinor: result.price.amountMinor,
        currency: result.price.currency,
        inStock: result.inStock,
        scrapedAt,
        sourceHash: result.sourceHash,
        parserVersion: result.parserVersion,
      });
    }

    const [histRef] = await tx
      .select({ maxPrice: sql<number>`max(${priceHistory.priceMinor})` })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.offerId, offerId),
          sql`${priceHistory.scrapedAt} >= now() - interval '60 days'`,
        ),
      );

    // Use the larger of the 60-day history max and the retailer's own "Was" price
    // so on-sale is detected on the very first scrape when the page shows one.
    const referenceMinor = Math.max(
      histRef?.maxPrice ?? 0,
      result.retailerOriginalPriceMinor ?? 0,
    );
    const deal = referenceMinor > 0
      ? computeDeal(result.price.amountMinor, referenceMinor)
      : { onSale: false, reductionBps: 0 };

    await tx
      .update(offers)
      .set({
        latestPriceMinor: result.price.amountMinor,
        latestInStock: result.inStock,
        currency: result.price.currency,
        lastSourceHash: result.sourceHash,
        lastScrapedAt: scrapedAt,
        lastSeenAt: scrapedAt,
        updatedAt: scrapedAt,
        referencePriceMinor: referenceMinor || null,
        onSale: deal.onSale,
        reductionBps: deal.reductionBps,
      })
      .where(eq(offers.id, offerId));

    return { changed, previousPrice };
  });
}

/**
 * Offers whose freshness SLA has elapsed — the scheduler enqueues these daily.
 * `lastScrapedAt IS NULL OR lastScrapedAt < now() - freshness_target`.
 */
export interface OfferListing {
  offerId: string;
  productTitle: string;
  retailerName: string;
  retailerSlug: string;
  priceMinor: number | null;
  currency: string;
  inStock: boolean | null;
  productUrl: string;
  lastScrapedAt: Date | null;
}

/** Latest-state rows for the UI read path. Reads only denormalized `offers` columns. */
export async function listLatestOffers(db: Database, limit = 100): Promise<OfferListing[]> {
  return db
    .select({
      offerId: offers.id,
      productTitle: products.title,
      retailerName: retailers.name,
      retailerSlug: retailers.slug,
      priceMinor: offers.latestPriceMinor,
      currency: offers.currency,
      inStock: offers.latestInStock,
      productUrl: offers.productUrl,
      lastScrapedAt: offers.lastScrapedAt,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .innerJoin(retailers, eq(offers.retailerId, retailers.id))
    .where(eq(offers.enabled, true))
    .limit(limit);
}

export interface StaleScrapeJob {
  offerId: string;
  retailerId: string;
  retailerSlug: string;
  retailerSku: string;
  productUrl: string;
}

/** Resolve a single offer into the fields needed to enqueue an on-demand scrape. */
export async function getScrapeJobForOffer(
  db: Database,
  offerId: string,
): Promise<StaleScrapeJob | null> {
  const [row] = await db
    .select({
      offerId: offers.id,
      retailerId: offers.retailerId,
      retailerSlug: retailers.slug,
      retailerSku: offers.retailerSku,
      productUrl: offers.productUrl,
    })
    .from(offers)
    .innerJoin(retailers, eq(offers.retailerId, retailers.id))
    .where(eq(offers.id, offerId))
    .limit(1);
  return row ?? null;
}

export async function findStaleScrapeJobs(db: Database, limit = 1000): Promise<StaleScrapeJob[]> {
  return db
    .select({
      offerId: offers.id,
      retailerId: offers.retailerId,
      retailerSlug: retailers.slug,
      retailerSku: offers.retailerSku,
      productUrl: offers.productUrl,
    })
    .from(offers)
    .innerJoin(retailers, eq(offers.retailerId, retailers.id))
    .where(
      and(
        eq(offers.enabled, true),
        eq(retailers.enabled, true),
        or(
          isNull(offers.lastScrapedAt),
          lt(
            offers.lastScrapedAt,
            sql`now() - (${offers.freshnessTargetMinutes} * interval '1 minute')`,
          ),
        ),
      ),
    )
    .limit(limit);
}

// ── Product CRUD ──────────────────────────────────────────────────────────────

export interface ProductAliasRow {
  id: string;
  alias: string;
}

export interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  aliases: ProductAliasRow[];
}

const productCols = {
  id: products.id,
  title: products.title,
  brand: products.brand,
  category: products.category,
  imageUrl: products.imageUrl,
};

/** Fetch and group aliases for a set of products, keyed by productId. */
async function aliasesByProduct(
  db: Database,
  productIds: string[],
): Promise<Map<string, ProductAliasRow[]>> {
  const map = new Map<string, ProductAliasRow[]>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({ id: productAliases.id, alias: productAliases.alias, productId: productAliases.productId })
    .from(productAliases)
    .where(inArray(productAliases.productId, productIds))
    .orderBy(asc(productAliases.position), asc(productAliases.createdAt));
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({ id: r.id, alias: r.alias });
    map.set(r.productId, list);
  }
  return map;
}

export async function listProducts(db: Database): Promise<ProductRow[]> {
  const rows = await db.select(productCols).from(products).orderBy(asc(products.title));
  const aliasMap = await aliasesByProduct(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, aliases: aliasMap.get(r.id) ?? [] }));
}

export async function createProduct(
  db: Database,
  data: { title: string; brand?: string | null; category?: string | null; imageUrl?: string | null },
): Promise<ProductRow> {
  const [row] = await db
    .insert(products)
    .values({
      title: data.title,
      brand: data.brand ?? null,
      category: data.category ?? null,
      imageUrl: data.imageUrl ?? null,
      fuzzyKey: data.title.toLowerCase(),
    })
    .returning(productCols);
  return { ...row!, aliases: [] };
}

export async function updateProduct(
  db: Database,
  id: string,
  data: { title?: string; brand?: string | null; category?: string | null; imageUrl?: string | null },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title) { set.title = data.title; set.fuzzyKey = data.title.toLowerCase(); }
  if ("brand" in data) set.brand = data.brand;
  if ("category" in data) set.category = data.category;
  if ("imageUrl" in data) set.imageUrl = data.imageUrl;
  const [row] = await db.update(products).set(set).where(eq(products.id, id)).returning({ id: products.id });
  return !!row;
}

export async function deleteProduct(db: Database, id: string): Promise<boolean> {
  const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return !!row;
}

export async function getProduct(db: Database, id: string): Promise<ProductRow | null> {
  const [row] = await db.select(productCols).from(products).where(eq(products.id, id)).limit(1);
  if (!row) return null;
  const aliasMap = await aliasesByProduct(db, [id]);
  return { ...row, aliases: aliasMap.get(id) ?? [] };
}

// ── Product aliases CRUD ──────────────────────────────────────────────────────

export async function listAliases(db: Database, productId: string): Promise<ProductAliasRow[]> {
  return (await aliasesByProduct(db, [productId])).get(productId) ?? [];
}

/** Append an alias at the end of the product's ordered list. */
export async function addAlias(
  db: Database,
  productId: string,
  alias: string,
): Promise<ProductAliasRow> {
  const [max] = await db
    .select({ pos: sql<number>`coalesce(max(${productAliases.position}), -1)::int` })
    .from(productAliases)
    .where(eq(productAliases.productId, productId));
  const [row] = await db
    .insert(productAliases)
    .values({ productId, alias, position: (max?.pos ?? -1) + 1 })
    .returning({ id: productAliases.id, alias: productAliases.alias });
  return row!;
}

export async function updateAlias(db: Database, aliasId: string, alias: string): Promise<boolean> {
  const [row] = await db
    .update(productAliases)
    .set({ alias })
    .where(eq(productAliases.id, aliasId))
    .returning({ id: productAliases.id });
  return !!row;
}

export async function deleteAlias(db: Database, aliasId: string): Promise<boolean> {
  const [row] = await db
    .delete(productAliases)
    .where(eq(productAliases.id, aliasId))
    .returning({ id: productAliases.id });
  return !!row;
}

// ── Retailer CRUD ─────────────────────────────────────────────────────────────

export interface RetailerRow {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export async function listRetailers(db: Database): Promise<RetailerRow[]> {
  return db
    .select({ id: retailers.id, slug: retailers.slug, name: retailers.name, baseUrl: retailers.baseUrl, enabled: retailers.enabled })
    .from(retailers)
    .orderBy(asc(retailers.name));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createRetailer(
  db: Database,
  data: { name: string; baseUrl: string; slug?: string },
): Promise<RetailerRow> {
  const slug = data.slug ?? slugify(data.name);
  const [row] = await db
    .insert(retailers)
    .values({ name: data.name, slug, baseUrl: data.baseUrl })
    .onConflictDoUpdate({ target: retailers.slug, set: { name: data.name, baseUrl: data.baseUrl, updatedAt: new Date() } })
    .returning({ id: retailers.id, slug: retailers.slug, name: retailers.name, baseUrl: retailers.baseUrl, enabled: retailers.enabled });
  return row!;
}

export async function updateRetailer(
  db: Database,
  id: string,
  data: { name?: string; baseUrl?: string; enabled?: boolean },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name) { set.name = data.name; set.slug = slugify(data.name); }
  if (data.baseUrl) set.baseUrl = data.baseUrl;
  if (typeof data.enabled === "boolean") set.enabled = data.enabled;
  const [row] = await db.update(retailers).set(set).where(eq(retailers.id, id)).returning({ id: retailers.id });
  return !!row;
}

export async function deleteRetailer(db: Database, id: string): Promise<boolean> {
  const [row] = await db.delete(retailers).where(eq(retailers.id, id)).returning({ id: retailers.id });
  return !!row;
}

// ── Offers ────────────────────────────────────────────────────────────────────

/**
 * Create (or refresh the URL of) an offer linking a product to a retailer. Keyed
 * by the unique (retailerId, retailerSku) pair so re-running is idempotent.
 * Returns the offer id and whether a new row was inserted.
 */
export async function upsertOffer(
  db: Database,
  data: {
    productId: string;
    retailerId: string;
    retailerSku: string;
    productUrl: string;
    currency?: string;
  },
): Promise<{ id: string; created: boolean }> {
  const now = new Date();
  const [row] = await db
    .insert(offers)
    .values({
      productId: data.productId,
      retailerId: data.retailerId,
      retailerSku: data.retailerSku,
      productUrl: data.productUrl,
      currency: data.currency ?? "EUR",
      enabled: true,
    })
    .onConflictDoUpdate({
      target: [offers.retailerId, offers.retailerSku],
      set: { productUrl: data.productUrl, enabled: true, updatedAt: now },
    })
    .returning({ id: offers.id, createdAt: offers.createdAt, updatedAt: offers.updatedAt });

  // On a fresh insert createdAt === updatedAt; on conflict-update they diverge.
  const created = row!.createdAt.getTime() === row!.updatedAt.getTime();
  return { id: row!.id, created };
}

// ─────────────────────────────────────────────────────────────────────────────

/** All enabled offers (no freshness filter) — for "Refresh all" on-demand enqueue. */
export async function listEnabledScrapeJobs(
  db: Database,
  limit = 1000,
): Promise<StaleScrapeJob[]> {
  return db
    .select({
      offerId: offers.id,
      retailerId: offers.retailerId,
      retailerSlug: retailers.slug,
      retailerSku: offers.retailerSku,
      productUrl: offers.productUrl,
    })
    .from(offers)
    .innerJoin(retailers, eq(offers.retailerId, retailers.id))
    .where(and(eq(offers.enabled, true), eq(retailers.enabled, true)))
    .limit(limit);
}

export interface OnSaleListing {
  offerId: string;
  productTitle: string;
  productImageUrl: string | null;
  retailerName: string;
  latestPriceMinor: number;
  referencePriceMinor: number | null;
  reductionBps: number;
  currency: string;
  alertEnabled: boolean;
}

type OnSaleSort = "reductionBps" | "product" | "shop" | "save";
type SortDir = "asc" | "desc";

export async function listOnSaleOffers(
  db: Database,
  opts: { sort?: OnSaleSort; dir?: SortDir; limit?: number } = {},
): Promise<OnSaleListing[]> {
  const { sort = "reductionBps", dir = "desc", limit = 100 } = opts;
  const sortCol =
    sort === "product"
      ? products.title
      : sort === "shop"
        ? retailers.name
        : offers.reductionBps;
  const orderFn = dir === "asc" ? asc : desc;

  return db
    .select({
      offerId: offers.id,
      productTitle: products.title,
      productImageUrl: products.imageUrl,
      retailerName: retailers.name,
      latestPriceMinor: offers.latestPriceMinor,
      referencePriceMinor: offers.referencePriceMinor,
      reductionBps: offers.reductionBps,
      currency: offers.currency,
      alertEnabled: sql<boolean>`coalesce(${alerts.enabled}, false)`,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .innerJoin(retailers, eq(offers.retailerId, retailers.id))
    .leftJoin(alerts, eq(alerts.offerId, offers.id))
    .where(eq(offers.enabled, true))
    .orderBy(orderFn(sortCol))
    .limit(limit) as unknown as OnSaleListing[];
}

export async function getPriceHistorySeries(
  db: Database,
  offerIds: string[],
  days = 30,
): Promise<Map<string, { at: Date; priceMinor: number }[]>> {
  if (offerIds.length === 0) return new Map();
  const rows = await db
    .select({
      offerId: priceHistory.offerId,
      at: priceHistory.scrapedAt,
      priceMinor: priceHistory.priceMinor,
    })
    .from(priceHistory)
    .where(
      and(
        inArray(priceHistory.offerId, offerIds),
        sql`${priceHistory.scrapedAt} >= now() - ${days} * interval '1 day'`,
      ),
    )
    .orderBy(priceHistory.offerId, priceHistory.scrapedAt);

  const map = new Map<string, { at: Date; priceMinor: number }[]>();
  for (const row of rows) {
    if (!map.has(row.offerId)) map.set(row.offerId, []);
    map.get(row.offerId)!.push({ at: row.at, priceMinor: row.priceMinor });
  }
  return map;
}

export async function setAlert(
  db: Database,
  offerId: string,
  enabled: boolean,
): Promise<void> {
  const now = new Date();
  await db
    .insert(alerts)
    .values({ offerId, enabled, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: alerts.offerId,
      set: { enabled, updatedAt: now },
    });
}

// ── Scraper plugins ───────────────────────────────────────────────────────────

export interface PluginRow {
  slug: string;
  displayName: string;
  baseUrl: string;
  bundleJs: string;
  version: string;
}

export async function getPlugin(db: Database, slug: string): Promise<PluginRow | null> {
  const [row] = await db
    .select({
      slug: scraperPlugins.slug,
      displayName: scraperPlugins.displayName,
      baseUrl: scraperPlugins.baseUrl,
      bundleJs: scraperPlugins.bundleJs,
      version: scraperPlugins.version,
    })
    .from(scraperPlugins)
    .where(and(eq(scraperPlugins.slug, slug), eq(scraperPlugins.enabled, true)));
  return row ?? null;
}

export async function getEnabledPlugins(db: Database): Promise<PluginRow[]> {
  return db
    .select({
      slug: scraperPlugins.slug,
      displayName: scraperPlugins.displayName,
      baseUrl: scraperPlugins.baseUrl,
      bundleJs: scraperPlugins.bundleJs,
      version: scraperPlugins.version,
    })
    .from(scraperPlugins)
    .where(eq(scraperPlugins.enabled, true))
    .orderBy(asc(scraperPlugins.slug));
}

export async function listPlugins(
  db: Database,
): Promise<Array<{ slug: string; displayName: string; baseUrl: string; enabled: boolean }>> {
  return db
    .select({
      slug: scraperPlugins.slug,
      displayName: scraperPlugins.displayName,
      baseUrl: scraperPlugins.baseUrl,
      enabled: scraperPlugins.enabled,
    })
    .from(scraperPlugins)
    .orderBy(asc(scraperPlugins.slug));
}

export async function upsertPlugin(
  db: Database,
  rec: { slug: string; displayName: string; baseUrl: string; bundleJs: string },
): Promise<void> {
  const now = new Date();
  // Version is bumped to current timestamp so the worker's in-process cache invalidates.
  await db
    .insert(scraperPlugins)
    .values({ ...rec, version: String(Date.now()), createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: scraperPlugins.slug,
      set: {
        displayName: rec.displayName,
        baseUrl: rec.baseUrl,
        bundleJs: rec.bundleJs,
        version: String(Date.now()),
        enabled: true,
        updatedAt: now,
      },
    });
}

// ── AI usage / cost ─────────────────────────────────────────────────────────────

/**
 * Anthropic list price per MILLION tokens, in USD, keyed by model. Kept here so the
 * cost dashboard has a single source of truth; update when Anthropic pricing changes.
 * Unknown models fall back to Sonnet-class pricing.
 */
export const AI_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};
const DEFAULT_PRICING = { inputPerMTok: 3, outputPerMTok: 15 };

/** USD micro-dollars (1e-6 USD) for a call, so we can store an integer. */
export function estimateCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = AI_PRICING[model] ?? DEFAULT_PRICING;
  const usd = (inputTokens / 1e6) * p.inputPerMTok + (outputTokens / 1e6) * p.outputPerMTok;
  return Math.round(usd * 1e6);
}

export interface AiUsageInput {
  route: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Log one Anthropic API call. Cost is derived from {@link AI_PRICING}. */
export async function recordAiUsage(db: Database, u: AiUsageInput): Promise<void> {
  await db.insert(aiUsage).values({
    route: u.route,
    operation: u.operation,
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    costMicros: estimateCostMicros(u.model, u.inputTokens, u.outputTokens),
  });
}

export interface AiUsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

/** All-time totals plus the last `days` window, for the admin header cards. */
export async function getAiUsageSummary(db: Database): Promise<AiUsageSummary> {
  const [row] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)::int`,
    })
    .from(aiUsage);
  return row ?? { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 };
}

export interface AiUsageDailyPoint {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

/** Per-day usage buckets for the last `days`, oldest first — feeds the usage chart. */
export async function getAiUsageDaily(db: Database, days = 30): Promise<AiUsageDailyPoint[]> {
  return db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${aiUsage.createdAt}), 'YYYY-MM-DD')`,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)::int`,
    })
    .from(aiUsage)
    .where(sql`${aiUsage.createdAt} >= now() - (${days} * interval '1 day')`)
    .groupBy(sql`date_trunc('day', ${aiUsage.createdAt})`)
    .orderBy(sql`date_trunc('day', ${aiUsage.createdAt}) asc`);
}

/** Most recent calls for the admin table. */
export async function getRecentAiUsage(db: Database, limit = 20): Promise<AiUsageRow[]> {
  return db.select().from(aiUsage).orderBy(desc(aiUsage.createdAt)).limit(limit);
}

// ── Web-traffic logging ───────────────────────────────────────────────────────

export interface RequestLogInput {
  method: string;
  path: string;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
}

/** Log one web request. Called fire-and-forget from the middleware. */
export async function recordRequestLog(db: Database, r: RequestLogInput): Promise<void> {
  await db.insert(requestLogs).values({
    method: r.method,
    path: r.path,
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    country: r.country ?? null,
    region: r.region ?? null,
    city: r.city ?? null,
  });
}

/** Most recent visits for the admin table. */
export async function getRecentRequestLogs(db: Database, limit = 30): Promise<RequestLogRow[]> {
  return db.select().from(requestLogs).orderBy(desc(requestLogs.createdAt)).limit(limit);
}

export interface CountryCount {
  country: string;
  visits: number;
}

// ── Demo state ────────────────────────────────────────────────────────────────

/** Mark demo data as dirty (records the first edit time; subsequent calls are no-ops). */
export async function markDemoDirty(db: Database): Promise<void> {
  if (process.env.DEMO_MODE !== "true") return;
  await db
    .insert(demoState)
    .values({ id: 1, lastEditedAt: new Date() })
    .onConflictDoUpdate({
      target: demoState.id,
      // Only update if currently null — preserve the earliest edit timestamp.
      set: { lastEditedAt: sql`CASE WHEN demo_state.last_edited_at IS NULL THEN now() ELSE demo_state.last_edited_at END` },
    });
}

/** Clear dirty state after a reseed. */
export async function clearDemoDirty(db: Database): Promise<void> {
  await db
    .insert(demoState)
    .values({ id: 1, lastEditedAt: null })
    .onConflictDoUpdate({ target: demoState.id, set: { lastEditedAt: null } });
}

/** Get the current demo state row, or null if the table is empty. */
export async function getDemoState(db: Database): Promise<{ lastEditedAt: Date | null } | null> {
  const [row] = await db.select({ lastEditedAt: demoState.lastEditedAt }).from(demoState).limit(1);
  return row ?? null;
}

/** Visit counts grouped by country over the last `days`, busiest first. */
export async function getTopCountries(db: Database, days = 30, limit = 8): Promise<CountryCount[]> {
  return db
    .select({
      country: sql<string>`coalesce(${requestLogs.country}, 'Unknown')`,
      visits: sql<number>`count(*)::int`,
    })
    .from(requestLogs)
    .where(sql`${requestLogs.createdAt} >= now() - (${days} * interval '1 day')`)
    .groupBy(sql`coalesce(${requestLogs.country}, 'Unknown')`)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}
