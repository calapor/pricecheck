export * from "./types";
export * from "./html";
export * from "./http";
// NOTE: "./browser" is intentionally NOT re-exported here — it pulls in Playwright +
// the stealth plugin, and re-exporting it from this barrel would drag Chromium into
// every HTTP-only importer. Consumers that need the browser-fallback fetcher (the
// worker, and the web "scrapers/generate" route for bot-protected shops) import it
// directly from "@pricecheck/scrapers/browser". In the web image that deep import is
// why web.Dockerfile has to hand-copy Playwright into the standalone bundle.
export * from "./fetcher";
export * from "./circuit-breaker";
export * from "./registry";
export * from "./context";
export * from "./plugin-loader";
export * from "./prompts/generator";
export * from "./prompts/judge";
export { parseSupervalu } from "./adapters/supervalu";
