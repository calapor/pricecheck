import { Redis } from "ioredis";

/**
 * Shared Redis connection for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` on the connection it blocks on.
 */
export function createRedis(url = process.env.REDIS_URL ?? "redis://localhost:6379"): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
