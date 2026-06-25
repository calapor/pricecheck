import { z } from "zod";

/** How a retailer's pages are fetched. */
export const scrapeStrategySchema = z.enum(["http", "browser", "api"]);
export type ScrapeStrategy = z.infer<typeof scrapeStrategySchema>;

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

/**
 * The normalized result every scraper adapter must produce for a single offer.
 * This is the contract between `packages/scrapers` and the persistence layer.
 */
export const scrapeResultSchema = z.object({
  /** Price as integer minor units + currency. */
  price: moneySchema,
  inStock: z.boolean(),
  /** Canonical product URL at the retailer (may differ from the requested URL). */
  url: z.string().url(),
  /** Optional product metadata captured opportunistically. */
  title: z.string().optional(),
  brand: z.string().optional(),
  gtin: z.string().optional(),
  imageUrl: z.string().url().optional(),
  /**
   * Stable hash of the meaningful scraped content. Identical re-scrapes produce
   * the same hash, making DB upserts idempotent and de-duplicating history rows.
   */
  sourceHash: z.string(),
  /** Adapter version that produced this result, for provenance. */
  parserVersion: z.string(),
});
export type ScrapeResult = z.infer<typeof scrapeResultSchema>;
