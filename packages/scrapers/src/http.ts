import type { HtmlFetcher } from "./types";

const DEFAULT_UA =
  "PriceCheckBot/0.1 (+https://example.com/bot; polite price comparison crawler)";

export interface HttpFetcherOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a polite HTTP {@link HtmlFetcher}: identifies the bot, times out, and
 * retries transient failures (429/5xx/network) with exponential backoff + jitter.
 * Permanent 4xx (except 429) fail fast — retrying won't help.
 */
export function httpFetcher(options: HttpFetcherOptions = {}): HtmlFetcher {
  const ua = options.userAgent ?? DEFAULT_UA;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 3;

  return async function fetchHtml(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml" },
          signal: controller.signal,
        });
        if (res.ok) return await res.text();

        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable) {
          throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
        }
        lastError = new Error(`GET ${url} -> ${res.status}`);
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }

      if (attempt < maxRetries) {
        const backoff = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
        await sleep(backoff);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
}
