import { compilePlugin, makeScraperContext, httpFetcher } from "@pricecheck/scrapers";
import { upsertPlugin } from "@pricecheck/db";
import { scrapeResultSchema } from "@pricecheck/core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  let slug: unknown, displayName: unknown, baseUrl: unknown, bundleJs: unknown;
  try {
    ({ slug, displayName, baseUrl, bundleJs } = await req.json());
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

  // 2. Smoke-test: call scrape() against the shop's base URL and verify the result shape
  try {
    const ctx = makeScraperContext(httpFetcher());
    const result = await scraper.scrape({ url: baseUrl.trim(), retailerSku: "smoke-test" }, ctx);
    scrapeResultSchema.parse(result); // throws ZodError if shape is wrong
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A 401/403 here is the site's bot protection (e.g. Akamai/Cloudflare), not a
    // bug in the bundle — plain HTTP can't get past it, so flag it as unsupported.
    const hint = /\b(401|403|forbidden|access denied)\b/i.test(message)
      ? " — the site blocks automated access (bot protection); it needs a headless browser, which isn't supported."
      : "";
    return NextResponse.json({ error: `Smoke-test scrape failed: ${message}${hint}` }, { status: 422 });
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
