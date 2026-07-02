import { browserFallbacks, logger } from "@pricecheck/observability";
import type { HtmlFetcher } from "./types";

/**
 * A thrown error whose message names a bot-wall status is our signal to escalate.
 * Same pattern the install smoke-test uses to explain 401/403s to the user
 * (apps/web/src/app/api/scrapers/install/route.ts) — httpFetcher throws
 * `GET <url> -> 403 Forbidden`, so the code rides along in the message.
 */
const BOT_BLOCK_RE = /\b(401|403|forbidden|access denied)\b/i;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

/**
 * Compose two fetchers into one: try `primary` (plain HTTP), and only if it fails
 * with a bot-block error fall back to `fallback` (the stealth browser). Any other
 * error — network, timeout, 404, 5xx — is rethrown untouched, so we never spin up
 * Chromium for failures a browser can't fix.
 *
 * The fallback is transparent to scrapers: they call `ctx.fetchHtml(url)` exactly
 * as before and never learn which path served the HTML.
 */
export function escalatingFetcher(primary: HtmlFetcher, fallback: HtmlFetcher): HtmlFetcher {
  return async function fetchHtml(url: string): Promise<string> {
    try {
      return await primary(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!BOT_BLOCK_RE.test(message)) throw err;

      const host = hostOf(url);
      browserFallbacks.inc({ host });
      logger.info({ host, reason: message }, "HTTP blocked — escalating to headless browser");
      return await fallback(url);
    }
  };
}
