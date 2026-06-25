import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import { createRedis } from "./connection";

export const SCRAPE_QUEUE = "scrape";

/** Payload for a single offer scrape job. */
export interface ScrapeJobData {
  offerId: string;
  retailerId: string;
  retailerSlug: string;
  retailerSku: string;
  productUrl: string;
  /** Why this job was enqueued — useful in logs/metrics. */
  reason: "scheduled" | "on_demand" | "retry";
}

/** Lower number = higher priority. On-demand "hot" refreshes jump the queue. */
export const PRIORITY = { onDemand: 1, scheduled: 10 } as const;

/** Default resilience policy: bounded retries with exponential backoff + jitter. */
export const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  // Keep failures around as a de-facto dead-letter queue for inspection.
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function createScrapeQueue(connection: Redis = createRedis()): Queue<ScrapeJobData> {
  return new Queue<ScrapeJobData>(SCRAPE_QUEUE, { connection });
}

export async function enqueueScrape(
  queue: Queue<ScrapeJobData>,
  data: ScrapeJobData,
  opts: JobsOptions = {},
): Promise<void> {
  const priority = data.reason === "on_demand" ? PRIORITY.onDemand : PRIORITY.scheduled;
  // De-dupe in-flight jobs for the same offer via a stable jobId.
  await queue.add("scrape", data, {
    ...DEFAULT_JOB_OPTS,
    priority,
    jobId: `${data.offerId}:${data.reason}`,
    ...opts,
  });
}
