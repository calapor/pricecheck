import { createDb, findStaleScrapeJobs } from "@pricecheck/db";
import { logger } from "@pricecheck/observability";
import { createScrapeQueue, createRedis, enqueueScrape } from "@pricecheck/queue";

/**
 * Run-to-completion enqueuer, invoked by the k8s CronJob (daily). Finds offers
 * whose freshness SLA has elapsed and pushes a scrape job for each. Idempotent:
 * the queue de-dupes by offer jobId, so overlapping runs won't double-scrape.
 */
async function main() {
  const limit = Number(process.env.SCHEDULER_BATCH ?? 1000);
  const { db, client } = createDb();
  const connection = createRedis();
  const queue = createScrapeQueue(connection);

  try {
    const jobs = await findStaleScrapeJobs(db, limit);
    logger.info({ count: jobs.length }, "enqueuing stale offers");

    for (const job of jobs) {
      await enqueueScrape(queue, {
        offerId: job.offerId,
        retailerId: job.retailerId,
        retailerSlug: job.retailerSlug,
        retailerSku: job.retailerSku,
        productUrl: job.productUrl,
        reason: "scheduled",
      });
    }
    logger.info({ count: jobs.length }, "scheduler done");
  } finally {
    await queue.close();
    connection.disconnect();
    await client.end();
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "scheduler failed");
  process.exit(1);
});
