import type { Money, ScrapeResult } from "@pricecheck/core";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "./client";
import { offers, priceHistory, products, retailers } from "./schema";

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
