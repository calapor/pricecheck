import { compilePlugin, makeScraperContext, httpFetcher, escalatingFetcher } from "@pricecheck/scrapers";
import { browserFetcher } from "@pricecheck/scrapers/browser";
import { upsertPlugin } from "@pricecheck/db";
import { scrapeResultSchema } from "@pricecheck/core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  let slug: unknown, displayName: unknown, baseUrl: unknown, bundleJs: unknown, query: unknown;
  try {
    ({ slug, displayName, baseUrl, bundleJs, query } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    typeof slug !== "string" || !slug.trim() ||
    typeof displayName !== "string" || !displayName.trim() ||
    typeof baseUrl !== "string" || !baseUrl.trim() ||
    typeof bundleJs !== "string" || !bundleJs.trim()
  ) {
    return NextResponse.json({ error: "slug, displayName, baseUrl, and bundleJs are required" }, { status: 400 });
  }

  // 1. Compile and validate the bundle shape in the vm sandbox
  let scraper: ReturnType<typeof compilePlugin>;
  try {
    scraper = compilePlugin({ slug: slug.trim(), displayName: displayName.trim(), baseUrl: baseUrl.trim(), bundleJs: bundleJs.trim(), version: "1" });
  } catch (err) {
    return NextResponse.json(
      { error: `Bundle failed sandbox validation: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  // 2. Smoke-test: scrape a real product and verify the result shape. Prefer a search
  // query (e.g. "Alpro Barista Almond") via the scraper's searchUrl(), since the bare
  // homepage has no product card; fall back to baseUrl when no query/searchUrl exists.
  // Uses the same escalating fetcher as the worker — plain HTTP, then a stealth headless
  // browser on a 401/403 — so bot-protected shops (Akamai/Cloudflare) validate here too.
  const smokeQuery = typeof query === "string" ? query.trim() : "";
  const smokeUrl = smokeQuery && scraper.searchUrl ? scraper.searchUrl(smokeQuery) : baseUrl.trim();
  try {
    const ctx = makeScraperContext(escalatingFetcher(httpFetcher(), browserFetcher()));
    const result = await scraper.scrape({ url: smokeUrl, retailerSku: "smoke-test" }, ctx);
    scrapeResultSchema.parse(result); // throws ZodError if shape is wrong
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If a 401/403 survives even the browser fallback, the site is hard-blocking us.
    const hint = /\b(401|403|forbidden|access denied)\b/i.test(message)
      ? " — the site blocks automated access (bot protection) even via the headless browser."
      : !scraper.searchUrl && smokeQuery
        ? " — the generated scraper has no searchUrl(); regenerate so it can search by product name."
        : "";
    return NextResponse.json(
      { error: `Smoke-test scrape failed (${smokeUrl}): ${message}${hint}` },
      { status: 422 },
    );
  }

  // 3. Persist to DB — version is bumped inside upsertPlugin so worker cache invalidates
  await upsertPlugin(db, {
    slug: slug.trim(),
    displayName: displayName.trim(),
    baseUrl: baseUrl.trim(),
    bundleJs: bundleJs.trim(),
  });

  return NextResponse.json({ ok: true, slug: slug.trim() }, { status: 201 });
}
