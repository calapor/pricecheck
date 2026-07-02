import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext } from "playwright";
import { logger } from "@pricecheck/observability";
import type { HtmlFetcher } from "./types";

/**
 * Real desktop-Chrome UA. Kept in sync with the browser-like headers the generate
 * route already uses; presenting a genuine Chrome fingerprint (paired with the
 * stealth plugin) is what gets us past Cloudflare/Akamai bot walls.
 */
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface BrowserFetcherOptions {
  /** Per-navigation timeout in ms for the initial load. JS-heavy shops need headroom. */
  timeoutMs?: number;
  /** Locale advertised to sites; affects Accept-Language and JS `navigator.language`. */
  locale?: string;
  timezoneId?: string;
}

// Lazy singletons: nothing launches until the first browser fetch actually fires,
// so the common (HTTP-only) path pays zero Chromium cost.
let browserPromise: Promise<Browser> | null = null;
let stealthRegistered = false;
const contexts = new Map<string, Promise<BrowserContext>>();

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // Register the stealth evasions lazily, on first launch — never at import time,
    // so merely importing this module (e.g. for typechecking) has no side effects.
    if (!stealthRegistered) {
      chromium.use(StealthPlugin());
      stealthRegistered = true;
    }
    logger.info("launching stealth chromium for browser-fallback scraping");
    browserPromise = chromium.launch({
      headless: true,
      // --disable-dev-shm-usage: k8s mounts a tiny (64Mi) /dev/shm by default, which
      // crashes Chromium under load; this routes shared memory to /tmp instead.
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browserPromise;
}

/**
 * One persistent context per origin. Reusing it means cookies and any JS-challenge
 * tokens acquired on the first navigation carry into later fetches for the same
 * shop — so a scraper's sequence of fetchHtml calls behaves like a real session
 * walking the site, not a burst of cold, independent GETs.
 */
function getContext(browser: Browser, origin: string, opts: BrowserFetcherOptions): Promise<BrowserContext> {
  let ctx = contexts.get(origin);
  if (!ctx) {
    ctx = browser.newContext({
      userAgent: CHROME_UA,
      viewport: { width: 1280, height: 800 },
      locale: opts.locale ?? "en-US",
      timezoneId: opts.timezoneId,
    });
    contexts.set(origin, ctx);
  }
  return ctx;
}

/**
 * Build an {@link HtmlFetcher} backed by a stealth headless browser. Same contract
 * as {@link httpFetcher} (URL in, rendered HTML out) so it drops straight into a
 * ScraperContext — see {@link escalatingFetcher} for the 403 → browser handoff.
 */
export function browserFetcher(opts: BrowserFetcherOptions = {}): HtmlFetcher {
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return async function fetchHtml(url: string): Promise<string> {
    const origin = new URL(url).origin;
    const browser = await getBrowser();
    const context = await getContext(browser, origin, opts);
    const page = await context.newPage();
    try {
      // domcontentloaded is reliable; "networkidle" often never fires on shops with
      // constant analytics/polling, so wait for it only best-effort (short cap) to give
      // client-rendered content time to appear without failing the whole navigation.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      return await page.content();
    } finally {
      // Drop the page but keep the context alive so its cookie jar persists.
      await page.close().catch(() => undefined);
    }
  };
}

/** Tear down all contexts and the browser. Call on worker shutdown so Chromium doesn't leak. */
export async function closeBrowser(): Promise<void> {
  const pending = [...contexts.values()];
  contexts.clear();
  for (const ctxPromise of pending) {
    await ctxPromise.then((c) => c.close()).catch(() => undefined);
  }
  if (browserPromise) {
    const browser = browserPromise;
    browserPromise = null;
    await browser.then((b) => b.close()).catch(() => undefined);
  }
}
