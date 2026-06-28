import type * as cheerio from "cheerio";
import type { contentHash, parsePriceToMinor, ScrapeResult, ScrapeStrategy } from "@pricecheck/core";

/** What the worker hands an adapter for a single offer. */
export interface ScrapeInput {
  url: string;
  retailerSku: string;
}

/** Fetches a URL and returns the raw HTML. Swappable: plain HTTP vs headless browser. */
export type HtmlFetcher = (url: string) => Promise<string>;

/**
 * Capabilities injected into every scraper invocation.
 * Built-in adapters may also import helpers directly; generated plugins MUST use
 * only these injected references (they run in a vm sandbox with no require/import).
 */
export interface ScraperContext {
  fetchHtml: HtmlFetcher;
  cheerio: typeof cheerio;
  parsePriceToMinor: typeof parsePriceToMinor;
  contentHash: typeof contentHash;
}

/**
 * The contract every retailer adapter implements. Keep adapters pure: fetch via
 * the injected `ctx.fetchHtml`, parse, and return a validated {@link ScrapeResult}.
 * Bump `parserVersion` whenever parsing logic changes (provenance + cache busting).
 */
export interface Scraper {
  readonly slug: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly strategy: ScrapeStrategy;
  readonly parserVersion: string;
  scrape(input: ScrapeInput, ctx: ScraperContext): Promise<ScrapeResult>;
  /**
   * Build a search-results URL for a free-text product query. Adapters that parse
   * a retailer's search page (and take the best match) implement this so the app
   * can create an offer for a product without a pre-known product URL.
   */
  searchUrl?(query: string): string;
}
