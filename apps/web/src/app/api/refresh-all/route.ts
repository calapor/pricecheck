import { listEnabledScrapeJobs } from "@pricecheck/db";
import { enqueueScrape } from "@pricecheck/queue";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scrapeQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** Enqueue on-demand refreshes for every enabled offer. */
export async function POST() {
  const jobs = await listEnabledScrapeJobs(db);
  await Promise.all(
    jobs.map((job) =>
      enqueueScrape(scrapeQueue, {
        offerId: job.offerId,
        retailerId: job.retailerId,
        retailerSlug: job.retailerSlug,
        retailerSku: job.retailerSku,
        productUrl: job.productUrl,
        reason: "on_demand",
      }),
    ),
  );
  return NextResponse.json({ queued: jobs.length });
}
