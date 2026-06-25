import type { ScrapeResult, ScrapeStrategy } from "@pricecheck/core";

/** What the worker hands an adapter for a single offer. */
export interface ScrapeInput {
  url: string;
  retailerSku: string;
}

/** Fetches a URL and returns the raw HTML. Swappable: plain HTTP vs headless browser. */
export type HtmlFetcher = (url: string) => Promise<string>;

export interface ScraperContext {
  fetchHtml: HtmlFetcher;
}

/**
 * The contract every retailer adapter implements. Keep adapters pure: fetch via
 * the injected `ctx.fetchHtml`, parse, and return a validated {@link ScrapeResult}.
 * Bump `parserVersion` whenever parsing logic changes (provenance + cache busting).
 */
export interface Scraper {
  readonly slug: string;
  readonly strategy: ScrapeStrategy;
  readonly parserVersion: string;
  scrape(input: ScrapeInput, ctx: ScraperContext): Promise<ScrapeResult>;
}
