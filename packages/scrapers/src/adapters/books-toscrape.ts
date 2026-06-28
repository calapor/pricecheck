import { contentHash, parsePriceToMinor, scrapeResultSchema, type ScrapeResult } from "@pricecheck/core";
import * as cheerio from "cheerio";
import type { Scraper, ScrapeInput, ScraperContext } from "../types";

const PARSER_VERSION = "books-toscrape@1";

/**
 * Adapter for books.toscrape.com — a public scraping sandbox. Demonstrates the
 * full fetch -> parse -> validate contract that every retailer adapter follows.
 */
export const booksToScrapeScraper: Scraper = {
  slug: "books-toscrape",
  displayName: "Books to Scrape (demo)",
  baseUrl: "https://books.toscrape.com/",
  strategy: "http",
  parserVersion: PARSER_VERSION,

  async scrape(input: ScrapeInput, ctx: ScraperContext): Promise<ScrapeResult> {
    const html = await ctx.fetchHtml(input.url);
    return parseBooksToScrape(html, input.url);
  },
};

/** Pure parser, separated so it can be unit-tested against saved HTML fixtures. */
export function parseBooksToScrape(html: string, url: string): ScrapeResult {
  const $ = cheerio.load(html);

  const priceText = $("p.price_color").first().text().trim();
  const price = parsePriceToMinor(priceText, "GBP");
  if (!price) {
    throw new Error(`books-toscrape: could not parse price from "${priceText}"`);
  }

  const availabilityText = $("p.availability, .availability").first().text().trim();
  const inStock = /in stock/i.test(availabilityText);

  const title = $("div.product_main h1").first().text().trim() || undefined;

  const result: ScrapeResult = {
    price,
    inStock,
    url,
    title,
    sourceHash: contentHash([url, price.amountMinor, price.currency, inStock]),
    parserVersion: PARSER_VERSION,
  };

  // Validate before returning — a parser regression surfaces here, not in the DB.
  return scrapeResultSchema.parse(result);
}
