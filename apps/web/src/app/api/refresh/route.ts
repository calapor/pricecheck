import { getScrapeJobForOffer } from "@pricecheck/db";
import { enqueueScrape } from "@pricecheck/queue";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** On-demand refresh: enqueue a high-priority scrape for a single offer. */
export async function POST(req: Request) {
  let offerId: unknown;
  try {
    ({ offerId } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof offerId !== "string") {
    return NextResponse.json({ error: "offerId required" }, { status: 400 });
  }

  const job = await getScrapeJobForOffer(db, offerId);
  if (!job) return NextResponse.json({ error: "offer not found" }, { status: 404 });

  await enqueueScrape(scrapeQueue, {
    offerId: job.offerId,
    retailerId: job.retailerId,
    retailerSlug: job.retailerSlug,
    retailerSku: job.retailerSku,
    productUrl: job.productUrl,
    reason: "on_demand",
  });

  return NextResponse.json({ queued: true });
}
