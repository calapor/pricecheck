import { detectPriceAnomaly } from "@pricecheck/core";
import { getDb, getPlugin, recordScrape, scrapeRuns } from "@pricecheck/db";
import {
  logger,
  parseFailures,
  priceAnomalies,
  scrapeAttempts,
  scrapeDuration,
} from "@pricecheck/observability";
import {
  BreakerRegistry,
  builtInScrapers,
  compilePlugin,
  httpFetcher,
  makeScraperContext,
  type Scraper,
} from "@pricecheck/scrapers";
import type { Job, ScrapeJobData } from "@pricecheck/queue";
import type { Database } from "@pricecheck/db";

const breakers = new BreakerRegistry(
  Number(process.env.BREAKER_THRESHOLD ?? 5),
  Number(process.env.BREAKER_COOLDOWN_MS ?? 60_000),
);

const httpCtx = makeScraperContext(httpFetcher());

/** In-process cache so repeat jobs don't re-compile the same plugin from DB. */
const pluginCache = new Map<string, { version: string; scraper: Scraper }>();

/**
 * Resolve a scraper by slug: check built-ins first, then fall back to the DB
 * plugin table with a version-keyed cache so installs take effect without a
 * worker restart.
 */
async function resolveScraper(db: Database, slug: string): Promise<Scraper> {
  const builtIn = builtInScrapers[slug];
  if (builtIn) return builtIn;

  const row = await getPlugin(db, slug);
  if (!row) throw new Error(`No scraper or plugin registered for "${slug}"`);

  const cached = pluginCache.get(slug);
  if (cached && cached.version === row.version) return cached.scraper;

  const scraper = compilePlugin(row);
  pluginCache.set(slug, { version: row.version, scraper });
  return scraper;
}

/**
 * Process one scrape job: fetch -> parse -> validate -> anomaly-check -> persist.
 * Throwing lets BullMQ apply its retry/backoff policy; the circuit breaker stops
 * us hammering a retailer that keeps failing.
 */
export async function processScrape(job: Job<ScrapeJobData>): Promise<void> {
  const data = job.data;
  const log = logger.child({ offerId: data.offerId, retailer: data.retailerSlug });
  const breaker = breakers.get(data.retailerSlug);

  if (!breaker.canRequest()) {
    // Breaker open: fail fast so the job retries later instead of hammering.
    scrapeAttempts.inc({ retailer: data.retailerSlug, outcome: "breaker_open" });
    throw new Error(`circuit breaker open for ${data.retailerSlug}`);
  }

  const db = getDb();
  const scraper = await resolveScraper(db, data.retailerSlug);
  const endTimer = scrapeDuration.startTimer({ retailer: data.retailerSlug });
  const startedAt = new Date();

  try {
    const result = await scraper.scrape(
      { url: data.productUrl, retailerSku: data.retailerSku },
      httpCtx,
    );

    const { changed, previousPrice } = await recordScrape(db, data.offerId, result);

    const anomaly = detectPriceAnomaly(result.price, previousPrice);
    if (anomaly) {
      priceAnomalies.inc({ retailer: data.retailerSlug, kind: anomaly.kind });
      log.warn({ anomaly }, "price anomaly flagged");
    }

    breaker.recordSuccess();
    scrapeAttempts.inc({ retailer: data.retailerSlug, outcome: "success" });
    endTimer();

    await db.insert(scrapeRuns).values({
      offerId: data.offerId,
      retailerId: data.retailerId,
      status: "success",
      attempt: job.attemptsMade + 1,
      durationMs: Date.now() - startedAt.getTime(),
      parserVersion: result.parserVersion,
      finishedAt: new Date(),
    });

    log.info({ changed, price: result.price }, "scrape ok");
  } catch (err) {
    breaker.recordFailure();
    endTimer();
    const message = err instanceof Error ? err.message : String(err);
    // A parse/validation error usually means the site layout changed.
    const isParseError = /parse|invalid|ZodError|could not/i.test(message);
    if (isParseError) parseFailures.inc({ retailer: data.retailerSlug });
    scrapeAttempts.inc({ retailer: data.retailerSlug, outcome: "failure" });

    await db
      .insert(scrapeRuns)
      .values({
        offerId: data.offerId,
        retailerId: data.retailerId,
        status: "failed",
        attempt: job.attemptsMade + 1,
        error: message.slice(0, 500),
        durationMs: Date.now() - startedAt.getTime(),
        finishedAt: new Date(),
      })
      .catch(() => undefined);

    log.error({ err: message }, "scrape failed");
    throw err; // let BullMQ retry per DEFAULT_JOB_OPTS
  }
}
