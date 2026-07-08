import { NextResponse } from "next/server";
import { seedDemoData, getDemoState } from "@pricecheck/db";
import { db } from "@/lib/db";

const RESET_MINUTES = parseInt(process.env.DEMO_RESET_MINUTES ?? "10", 10);

/**
 * Public auto-reset endpoint — no admin cookie required. Triggered by the client
 * countdown when the timer expires. Guards:
 *   1. Demo-mode only.
 *   2. Only fires when lastEditedAt is set AND the timeout has elapsed, preventing
 *      a visitor from resetting mid-session before the grace period is up.
 */
export async function POST() {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const state = await getDemoState(db);
  if (!state?.lastEditedAt) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const elapsed = (Date.now() - state.lastEditedAt.getTime()) / 1000 / 60;
  if (elapsed < RESET_MINUTES) {
    return NextResponse.json({ ok: false, error: "Too early" }, { status: 409 });
  }

  await seedDemoData(db, { reset: true });
  return NextResponse.json({ ok: true });
}
