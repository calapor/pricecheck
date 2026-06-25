import "server-only";
import { createScrapeQueue, type Queue, type ScrapeJobData } from "@pricecheck/queue";

// Reuse one queue/Redis connection across requests (survives HMR in dev).
const globalForQueue = globalThis as unknown as { scrapeQueue?: Queue<ScrapeJobData> };

function getQueue(): Queue<ScrapeJobData> {
  if (!globalForQueue.scrapeQueue) {
    globalForQueue.scrapeQueue = createScrapeQueue();
  }
  return globalForQueue.scrapeQueue;
}

// Lazy proxy: defer the Redis connection to first use so importing this module
// during `next build` page-data collection doesn't open a socket.
export const scrapeQueue: Queue<ScrapeJobData> = new Proxy({} as Queue<ScrapeJobData>, {
  get(_target, prop) {
    const real = getQueue();
    const value = Reflect.get(real as object, prop);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
