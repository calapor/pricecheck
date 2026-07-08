import { NextResponse } from "next/server";
import { getDemoState } from "@pricecheck/db";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Returns when the demo data was last edited by a visitor. Demo-mode only, no auth required. */
export async function GET() {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ lastEditedAt: null });
  }
  const state = await getDemoState(db);
  return NextResponse.json({ lastEditedAt: state?.lastEditedAt ?? null });
}
