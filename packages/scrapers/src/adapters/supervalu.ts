import { contentHash, parsePriceToMinor, scrapeResultSchema, type ScrapeResult } from "@pricecheck/core";
import type { Scraper, ScrapeInput, ScraperContext } from "../types";

const PARSER_VERSION = "supervalu@1";
const RSID = "5550";
const BASE = "https://shop.supervalu.ie";

/** Extract the JSON blob assigned to window.__PRELOADED_STATE__ in the HTML. */
function extractPreloadedState(html: string): Record<string, unknown> | null {
  const marker = "window.__PRELOADED_STATE__=";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const start = markerIdx + marker.length;
  if (html[start] !== "{") return null;

  let depth = 0;
  let i = start;
  while (i < html.length) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }

  try {
    return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Fetch a URL with browser-like headers to bypass Supervalu's WAF, which 403s
 * the default PriceCheckBot user-agent. Uses the host's native fetch rather than
 * the injected ctx.fetchHtml so the UA can be overridden per-request.
 */
async function fetchWithBrowserHeaders(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-IE,en;q=0.9",
      referer: BASE + "/",
    },
  });
  if (!res.ok) throw new Error(`supervalu: GET ${url} → ${res.status} ${res.statusText}`);
  return res.text();
}

export const supervaluScraper: Scraper = {
  slug: "supervalu",
  displayName: "SuperValu Ireland",
  baseUrl: BASE + "/",
  strategy: "http",
  parserVersion: PARSER_VERSION,

  async scrape(input: ScrapeInput, _ctx: ScraperContext): Promise<ScrapeResult> {
    const html = await fetchWithBrowserHeaders(input.url);
    return parseSupervalu(html, input.url);
  },
};

/** Pure parser — accepts the raw HTML from a Supervalu search results page. */
export function parseSupervalu(html: string, sourceUrl: string): ScrapeResult {
  const state = extractPreloadedState(html);
  if (!state) throw new Error("supervalu: could not find window.__PRELOADED_STATE__ in page");

  const search = (state.search ?? {}) as Record<string, unknown>;
  const products = (search.products ?? {}) as Record<string, unknown>;
  const orderedSkus = (products.searchResults ?? []) as string[];
  const dict = (search.productCardDictionary ?? {}) as Record<string, Record<string, unknown>>;

  if (orderedSkus.length === 0) {
    throw new Error(`supervalu: no products found for URL ${sourceUrl}`);
  }

  const firstSku = orderedSkus[0]!;
  const product = dict[firstSku];
  if (!product) {
    throw new Error(`supervalu: product card missing for SKU ${firstSku}`);
  }

  const priceText = String(product.price ?? "");
  const price = parsePriceToMinor(priceText, "EUR");
  if (!price) throw new Error(`supervalu: could not parse price from "${priceText}"`);

  const inStock = product.available === true;

  // "wasPrice" equals price when not on sale; only set retailerOriginalPriceMinor
  // when the site explicitly shows a higher strike-through price.
  const wasPriceText = String(product.wasPrice ?? "");
  const wasPrice = wasPriceText && wasPriceText !== priceText
    ? parsePriceToMinor(wasPriceText, "EUR")
    : null;

  const title = String(product.name ?? "").trim() || undefined;
  const imageObj = (product.image ?? {}) as Record<string, string>;
  const imageUrl = imageObj.default || undefined;

  // Canonical product URL embedded in page links: /sm/delivery/rsid/{rsid}/product/{slug}-id-{sku}
  const canonicalUrl = `${BASE}/sm/delivery/rsid/${RSID}/product/${firstSku}`;

  const result: ScrapeResult = {
    price,
    inStock,
    url: canonicalUrl,
    title,
    imageUrl,
    sourceHash: contentHash([canonicalUrl, price.amountMinor, price.currency, inStock]),
    parserVersion: PARSER_VERSION,
    ...(wasPrice ? { retailerOriginalPriceMinor: wasPrice.amountMinor } : {}),
  };

  return scrapeResultSchema.parse(result);
}
