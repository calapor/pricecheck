import { createServer } from "node:http";
import { logger, renderMetrics } from "@pricecheck/observability";
import { createScrapeWorker } from "@pricecheck/queue";
import { closeBrowser } from "@pricecheck/scrapers/browser";
import { processScrape } from "./process-scrape";

const worker = createScrapeWorker(processScrape);

worker.on("failed", (job, err) => {
  logger.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, "job failed");
});
worker.on("error", (err) => logger.error({ err: err.message }, "worker error"));

// Lightweight HTTP server for Prometheus scraping + k8s liveness/readiness.
const port = Number(process.env.METRICS_PORT ?? 9091);
createServer(async (req, res) => {
  if (req.url === "/healthz" || req.url === "/readyz") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.url === "/metrics") {
    const { contentType, body } = await renderMetrics();
    res.writeHead(200, { "content-type": contentType }).end(body);
    return;
  }
  res.writeHead(404).end();
}).listen(port, () => logger.info({ port }, "worker metrics server listening"));

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  await worker.close();
  await closeBrowser();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info("scrape worker started");
