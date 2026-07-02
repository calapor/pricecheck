import { supervaluScraper } from "./adapters/supervalu";
import type { Scraper } from "./types";

/** All built-in adapters, keyed by retailer slug. Add new built-ins here. */
export const builtInScrapers: Record<string, Scraper> = {
  [supervaluScraper.slug]: supervaluScraper,
};

/** @deprecated Use builtInScrapers or resolveScraper in the worker. */
export const scrapers = builtInScrapers;

export function getScraper(slug: string): Scraper {
  const scraper = builtInScrapers[slug];
  if (!scraper) throw new Error(`No scraper registered for retailer "${slug}"`);
  return scraper;
}

export function listBuiltIns(): Array<{ slug: string; displayName: string; baseUrl: string }> {
  return Object.values(builtInScrapers).map(({ slug, displayName, baseUrl }) => ({
    slug,
    displayName,
    baseUrl,
  }));
}
