import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncAllOffers } from "@/lib/offers";

export const dynamic = "force-dynamic";

/**
 * Ensure every configured product has an offer at every configured retailer, then
 * scrape them all synchronously and persist the latest prices. Runs in-request so
 * it works without the background worker, and backfills offers for products that
 * were configured before any offer existed.
 */
export async function POST() {
  const summary = await syncAllOffers(db);
  return NextResponse.json(summary);
}
