import { compilePlugin, makeScraperContext } from "@pricecheck/scrapers";
import { upsertPlugin, markDemoDirty, seedTescoDemo } from "@pricecheck/db";
import { scrapeResultSchema } from "@pricecheck/core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TESCO_DEMO } from "@/lib/tesco-demo";

export const dynamic = "force-dynamic";
const DEMO = process.env.DEMO_MODE === "true";

/** GET → canned generate payload (zero Claude cost) */
export async function GET() {
  if (!DEMO) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(TESCO_DEMO);
}

/** POST → install the demo plugin offline + seed Tesco comparison data */
export async function POST() {
  if (!DEMO) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    // 1. Compile and validate the bundle shape
    const scraper = compilePlugin({
      slug: TESCO_DEMO.slug,
      displayName: TESCO_DEMO.displayName,
      baseUrl: TESCO_DEMO.baseUrl,
      bundleJs: TESCO_DEMO.bundleJs,
      version: "1",
    });

    // 2. Offline smoke test — stub fetcher so no network or Chromium is used
    const ctx = makeScraperContext(async () => "");
    const result = await scraper.scrape(
      { url: scraper.searchUrl!("salmon"), retailerSku: "smoke" },
      ctx,
    );
    scrapeResultSchema.parse(result);

    // 3. Persist plugin + seed comparison data
    await upsertPlugin(db, {
      slug: TESCO_DEMO.slug,
      displayName: TESCO_DEMO.displayName,
      baseUrl: TESCO_DEMO.baseUrl,
      bundleJs: TESCO_DEMO.bundleJs,
    });
    await seedTescoDemo(db);
    await markDemoDirty(db);

    return NextResponse.json({ ok: true, slug: TESCO_DEMO.slug }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Demo install failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
