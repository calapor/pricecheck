import "server-only";
import {
  getProduct,
  listProducts,
  listRetailers,
  upsertOffer,
  type Database,
} from "@pricecheck/db";
import { resolveScraper, scrapeOfferNow } from "./scrape";

export interface SyncSummary {
  retailers: number;
  offersEnsured: number;
  scraped: number;
  failed: number;
  errors: string[];
}

/**
 * Ensure the given product has an offer at every enabled retailer, then scrape
 * each one synchronously so prices show on the next render. Retailers whose
 * scraper can build a search URL get a search-results offer; the rest fall back
 * to the shop's base URL. Offers are created even if a scrape fails, so the
 * product still appears in the UI (with "—" until a price is found).
 */
export async function syncOffersForProduct(db: Database, productId: string): Promise<SyncSummary> {
  const product = await getProduct(db, productId);
  const summary: SyncSummary = { retailers: 0, offersEnsured: 0, scraped: 0, failed: 0, errors: [] };
  if (!product) return summary;

  const query = [product.brand, product.title].filter(Boolean).join(" ");
  const retailers = (await listRetailers(db)).filter((r) => r.enabled);
  summary.retailers = retailers.length;

  for (const retailer of retailers) {
    const scraper = await resolveScraper(db, retailer.slug);
    // Build the product URL: prefer the scraper's search page, else the base URL.
    const productUrl = scraper?.searchUrl ? scraper.searchUrl(query) : retailer.baseUrl;
    // Deterministic per (retailer, product) key so re-syncing is idempotent.
    const retailerSku = `q:${productId}`;

    const { id: offerId } = await upsertOffer(db, {
      productId,
      retailerId: retailer.id,
      retailerSku,
      productUrl,
    });
    summary.offersEnsured++;

    const res = await scrapeOfferNow(db, {
      offerId,
      retailerSlug: retailer.slug,
      productUrl,
      retailerSku,
    });
    if (res.ok) summary.scraped++;
    else {
      summary.failed++;
      summary.errors.push(`${retailer.slug}: ${res.error}`);
    }
  }

  return summary;
}

/** Run {@link syncOffersForProduct} for every configured product. */
export async function syncAllOffers(db: Database): Promise<SyncSummary> {
  const products = await listProducts(db);
  const total: SyncSummary = { retailers: 0, offersEnsured: 0, scraped: 0, failed: 0, errors: [] };

  for (const product of products) {
    const s = await syncOffersForProduct(db, product.id);
    total.retailers = Math.max(total.retailers, s.retailers);
    total.offersEnsured += s.offersEnsured;
    total.scraped += s.scraped;
    total.failed += s.failed;
    total.errors.push(...s.errors);
  }

  return total;
}
