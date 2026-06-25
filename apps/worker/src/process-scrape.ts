import { detectPriceAnomaly } from "@pricecheck/core";
import { getDb, recordScrape, scrapeRuns } from "@pricecheck/db";
import {
  logger,
  parseFailures,
  priceAnomalies,
  scrapeAttempts,
  scrapeDuration,
} from "@pricecheck/observability";
import {
  BreakerRegistry,
  getScraper,
  httpFetcher,
  type ScraperContext,
} from "@pricecheck/scrapers";
import type { Job, ScrapeJobData } from "@pricecheck/queue";

const breakers = new BreakerRegistry(
  Number(process.env.BREAKER_THRESHOLD ?? 5),
  Number(process.env.BREAKER_COOLDOWN_MS ?? 60_000),
);

const httpCtx: ScraperContext = { fetchHtml: httpFetcher() };

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

  const scraper = getScraper(data.retailerSlug);
  const endTimer = scrapeDuration.startTimer({ retailer: data.retailerSlug });
  const db = getDb();
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
