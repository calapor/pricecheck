import pino from "pino";

/**
 * Shared structured logger. Set LOG_LEVEL (default "info") and NODE_ENV.
 * In production we emit JSON for Loki/promtail; in dev we pretty-print if
 * `pino-pretty` is available.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "pricecheck" },
});

export type Logger = typeof logger;

/** Child logger carrying a correlation id (e.g. scrape_run_id) on every line. */
export function withRunId(runId: string): Logger {
  return logger.child({ scrape_run_id: runId });
}
