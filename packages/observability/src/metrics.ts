import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * A single process-wide Prometheus registry. Expose it at `/metrics` on each
 * service (web + worker) and let Prometheus scrape per-retailer success rates,
 * latencies, and DLQ growth.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const scrapeAttempts = new Counter({
  name: "pricecheck_scrape_attempts_total",
  help: "Scrape attempts by retailer and outcome",
  labelNames: ["retailer", "outcome"] as const,
  registers: [registry],
});

export const scrapeDuration = new Histogram({
  name: "pricecheck_scrape_duration_seconds",
  help: "Wall-clock duration of a scrape by retailer",
  labelNames: ["retailer"] as const,
  buckets: [0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const parseFailures = new Counter({
  name: "pricecheck_parse_failures_total",
  help: "Parse/validation failures by retailer (usually a layout change)",
  labelNames: ["retailer"] as const,
  registers: [registry],
});

export const priceAnomalies = new Counter({
  name: "pricecheck_price_anomalies_total",
  help: "Suspicious price movements flagged by retailer and kind",
  labelNames: ["retailer", "kind"] as const,
  registers: [registry],
});

/** Serialize all metrics for an HTTP `/metrics` handler. */
export async function renderMetrics(): Promise<{ contentType: string; body: string }> {
  return { contentType: registry.contentType, body: await registry.metrics() };
}
