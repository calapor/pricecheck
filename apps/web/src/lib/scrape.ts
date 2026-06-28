import "server-only";
import { getPlugin, recordScrape, type Database } from "@pricecheck/db";
import {
  builtInScrapers,
  compilePlugin,
  httpFetcher,
  makeScraperContext,
  type Scraper,
} from "@pricecheck/scrapers";

const httpCtx = makeScraperContext(httpFetcher());

/** In-process cache so repeat scrapes don't re-compile the same plugin from DB. */
const pluginCache = new Map<string, { version: string; scraper: Scraper }>();

/**
 * Resolve a scraper by retailer slug: built-ins first, then the DB plugin table
 * (version-keyed cache). Mirrors the worker's resolver so on-demand scrapes from
 * the web app behave identically to background jobs.
 */
export async function resolveScraper(db: Database, slug: string): Promise<Scraper | null> {
  const builtIn = builtInScrapers[slug];
  if (builtIn) return builtIn;

  const row = await getPlugin(db, slug);
  if (!row) return null;

  const cached = pluginCache.get(slug);
  if (cached && cached.version === row.version) return cached.scraper;

  const scraper = compilePlugin(row);
  pluginCache.set(slug, { version: row.version, scraper });
  return scraper;
}

/**
 * Scrape a single offer synchronously and persist the result. Runs in the request
 * path (no BullMQ worker required) so prices appear immediately. Returns ok/error
 * rather than throwing — one failing retailer must not abort a multi-shop sync.
 */
export async function scrapeOfferNow(
  db: Database,
  job: { offerId: string; retailerSlug: string; productUrl: string; retailerSku: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const scraper = await resolveScraper(db, job.retailerSlug);
    if (!scraper) return { ok: false, error: `no scraper for "${job.retailerSlug}"` };

    const result = await scraper.scrape(
      { url: job.productUrl, retailerSku: job.retailerSku },
      httpCtx,
    );
    await recordScrape(db, job.offerId, result);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
