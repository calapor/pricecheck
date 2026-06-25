import { Worker, type Processor } from "bullmq";
import type { Redis } from "ioredis";
import { createRedis } from "./connection";
import { SCRAPE_QUEUE, type ScrapeJobData } from "./scrape-queue";

export interface ScrapeWorkerOptions {
  /** Global concurrency for this worker pod. Per-retailer caps are enforced separately. */
  concurrency?: number;
  connection?: Redis;
}

/**
 * Create a BullMQ worker for the scrape queue. The processor receives each
 * {@link ScrapeJobData} and should perform fetch -> parse -> persist.
 */
export function createScrapeWorker(
  processor: Processor<ScrapeJobData>,
  options: ScrapeWorkerOptions = {},
): Worker<ScrapeJobData> {
  return new Worker<ScrapeJobData>(SCRAPE_QUEUE, processor, {
    connection: options.connection ?? createRedis(),
    concurrency: options.concurrency ?? Number(process.env.WORKER_CONCURRENCY ?? 4),
  });
}
