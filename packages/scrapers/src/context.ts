import * as cheerio from "cheerio";
import { contentHash, parsePriceToMinor } from "@pricecheck/core";
import type { HtmlFetcher, ScraperContext } from "./types";

/** Build the context object injected into every scraper invocation. */
export function makeScraperContext(fetchHtml: HtmlFetcher): ScraperContext {
  return { fetchHtml, cheerio, parsePriceToMinor, contentHash };
}
