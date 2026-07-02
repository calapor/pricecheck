import vm from "node:vm";
import type { Scraper } from "./types";

export interface PluginRecord {
  slug: string;
  displayName: string;
  baseUrl: string;
  bundleJs: string;
  version: string;
}

/**
 * Compile a DB plugin record into a live Scraper using a vm sandbox.
 *
 * Generated bundles must use CommonJS assignment (`module.exports = { scrape, ... }`)
 * and reference ONLY injected ctx members (ctx.cheerio, ctx.parsePriceToMinor,
 * ctx.contentHash, ctx.fetchHtml) plus input.* — no require, no import, no process.
 *
 * The sandbox deliberately omits require, process, fetch, and globalThis so that a
 * malicious or broken bundle cannot read credentials or make unsandboxed network calls.
 * The async scrape() itself runs outside the vm timeout; the sandbox only guards the
 * top-level evaluation (module definition).
 */
export function compilePlugin(rec: PluginRecord): Scraper {
  const moduleObj = { exports: {} as Record<string, unknown> };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    console: { log() {}, warn() {}, error() {} },
  };
  const context = vm.createContext(sandbox);

  try {
    new vm.Script(rec.bundleJs, { filename: `plugin:${rec.slug}.js` }).runInContext(context, {
      timeout: 1000,
    });
  } catch (err) {
    throw new Error(
      `plugin ${rec.slug}: failed to evaluate bundle — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const exp = moduleObj.exports as Partial<Scraper>;
  if (typeof exp.scrape !== "function") {
    throw new Error(`plugin ${rec.slug}: bundle must assign a scrape() function to module.exports`);
  }

  return {
    slug: rec.slug,
    displayName: rec.displayName,
    baseUrl: rec.baseUrl,
    strategy: (exp.strategy as Scraper["strategy"]) ?? "http",
    parserVersion: exp.parserVersion ?? `${rec.slug}@plugin-${rec.version}`,
    scrape: exp.scrape.bind(exp),
    // Preserve the optional search-URL builder so the smoke-test and offer creation
    // can drive the shop's search page by product name.
    ...(typeof exp.searchUrl === "function" ? { searchUrl: exp.searchUrl.bind(exp) } : {}),
  };
}
