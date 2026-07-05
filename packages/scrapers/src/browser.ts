import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import { logger } from "@pricecheck/observability";
import type { HtmlFetcher } from "./types";

/**
 * Real desktop-Chrome UA. Kept in sync with the browser-like headers the generate
 * route already uses; presenting a genuine Chrome fingerprint (paired with the
 * stealth plugin) is what gets us past Cloudflare/Akamai bot walls.
 */
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// A short spread of common desktop viewports. Picking one per context (not per request)
// gives each shop-session a stable-but-not-hardcoded window size — a fixed 1280x800 on
// every request is itself a mild bot tell.
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

// Markers of a Cloudflare/anti-bot JS interstitial that RESOLVES ITSELF once the browser
// runs the challenge (unlike Akamai's static "Access Denied", which never clears). When we
// see these we wait, nudge the page like a human, and re-read — the challenge then mints a
// clearance cookie into the persistent context and the real page renders.
const CHALLENGE_RE =
  /just a moment|checking your browser|cf-chl|challenge-platform|_cf_chl|enable javascript and cookies|attention required/i;

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
// Origins whose context has already done its homepage warm-up (see fetchHtml).
const warmedOrigins = new Set<string>();

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Random human-ish pause. Real users don't act on exact millisecond boundaries. */
const humanPause = (min = 150, max = 650) => sleep(randInt(min, max));

/**
 * Simulate a moment of human presence: a few eased mouse moves and a scroll. Behavioural
 * signals (mouse entropy, scroll) feed anti-bot scoring; a page that loads and is read
 * with zero pointer movement looks automated.
 */
async function humanize(page: Page): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  for (let i = 0; i < randInt(2, 4); i++) {
    await page.mouse.move(randInt(0, vp.width), randInt(0, vp.height), { steps: randInt(5, 14) }).catch(() => undefined);
    await humanPause(80, 320);
  }
  await page.mouse.wheel(0, randInt(200, 1200)).catch(() => undefined);
  await humanPause(200, 700);
}

/**
 * Wait out a self-resolving JS challenge. Re-reads the page a few times, nudging it like a
 * human between attempts, until the challenge markers are gone or we run out of budget.
 * Returns the freshest HTML (challenge page included, if it never clears — the caller's
 * bot-wall detection handles that).
 */
async function settleChallenge(page: Page, budgetMs: number): Promise<string> {
  const deadline = Date.now() + budgetMs;
  let html = await page.content();
  let attempts = 0;
  while (CHALLENGE_RE.test(html.slice(0, 4000)) && Date.now() < deadline && attempts < 6) {
    attempts++;
    await humanize(page);
    // A solved Cloudflare challenge navigates to the real page; wait best-effort for it.
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
    await humanPause(1_200, 2_600);
    html = await page.content();
  }
  return html;
}

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
      viewport: VIEWPORTS[randInt(0, VIEWPORTS.length - 1)],
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

    // Warm-up (once per origin): land on the homepage first, like a real visitor, so
    // Cloudflare's JS challenge runs and banks a clearance cookie in the persistent
    // context BEFORE we hit the often more-heavily-protected deep link (search results).
    // Hitting a results URL cold — no cookie, no referer, no prior page — is a classic
    // scraper signature; a homepage-first session is far less likely to be scored a bot.
    if (!warmedOrigins.has(origin)) {
      warmedOrigins.add(origin);
      const warm = await context.newPage();
      try {
        await humanPause(200, 600);
        await warm.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => undefined);
        await settleChallenge(warm, 15_000);
        await humanize(warm);
      } finally {
        await warm.close().catch(() => undefined);
      }
    }

    const page = await context.newPage();
    try {
      await humanPause(120, 500);
      // domcontentloaded is reliable; "networkidle" often never fires on shops with
      // constant analytics/polling, so wait for it only best-effort (short cap) to give
      // client-rendered content time to appear without failing the whole navigation.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const settled = await settleChallenge(page, 15_000);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await humanize(page);
      // Return the freshest content after any challenge cleared and lazy content rendered.
      const finalHtml = await page.content();
      return finalHtml.length >= settled.length ? finalHtml : settled;
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
  warmedOrigins.clear();
  for (const ctxPromise of pending) {
    await ctxPromise.then((c) => c.close()).catch(() => undefined);
  }
  if (browserPromise) {
    const browser = browserPromise;
    browserPromise = null;
    await browser.then((b) => b.close()).catch(() => undefined);
  }
}
