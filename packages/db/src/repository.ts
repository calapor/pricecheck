import type { Money, ScrapeResult } from "@pricecheck/core";
import { computeDeal } from "@pricecheck/core";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "./client";
import { alerts, offers, priceHistory, products, retailers, scraperPlugins } from "./schema";

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
        lastSourceHash: offers.lastSourceHash,
        latestPriceMinor: offers.latestPriceMinor,
        currency: offers.currency,
      })
      .from(offers)
      .where(eq(offers.id, offerId))
      .for("update");

    if (!offer) throw new Error(`Offer ${offerId} not found`);

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

export interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
}

export async function listProducts(db: Database): Promise<ProductRow[]> {
  return db
    .select({ id: products.id, title: products.title, brand: products.brand, category: products.category })
    .from(products)
    .orderBy(asc(products.title));
}

export async function createProduct(
  db: Database,
  data: { title: string; brand?: string | null; category?: string | null },
): Promise<ProductRow> {
  const [row] = await db
    .insert(products)
    .values({
      title: data.title,
      brand: data.brand ?? null,
      category: data.category ?? null,
      fuzzyKey: data.title.toLowerCase(),
    })
    .returning({ id: products.id, title: products.title, brand: products.brand, category: products.category });
  return row!;
}

export async function updateProduct(
  db: Database,
  id: string,
  data: { title?: string; brand?: string | null; category?: string | null },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title) { set.title = data.title; set.fuzzyKey = data.title.toLowerCase(); }
  if ("brand" in data) set.brand = data.brand;
  if ("category" in data) set.category = data.category;
  const [row] = await db.update(products).set(set).where(eq(products.id, id)).returning({ id: products.id });
  return !!row;
}

export async function deleteProduct(db: Database, id: string): Promise<boolean> {
  const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return !!row;
}

export async function getProduct(db: Database, id: string): Promise<ProductRow | null> {
  const [row] = await db
    .select({ id: products.id, title: products.title, brand: products.brand, category: products.category })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return row ?? null;
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
