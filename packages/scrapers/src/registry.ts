import { booksToScrapeScraper } from "./adapters/books-toscrape";
import type { Scraper } from "./types";

/** All registered adapters, keyed by retailer slug. Add new retailers here. */
export const scrapers: Record<string, Scraper> = {
  [booksToScrapeScraper.slug]: booksToScrapeScraper,
};

export function getScraper(slug: string): Scraper {
  const scraper = scrapers[slug];
  if (!scraper) throw new Error(`No scraper registered for retailer "${slug}"`);
  return scraper;
}
