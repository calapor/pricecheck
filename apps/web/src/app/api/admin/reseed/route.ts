import { NextResponse } from "next/server";
import { seedDemoData } from "@pricecheck/db";
import { isAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

/**
 * Wipe and reload the SuperValu sample dataset. Demo-only: refuses unless
 * DEMO_MODE=true so the real deployment can never be reset, and requires an admin
 * session on top of that.
 */
export async function POST() {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Reseed is only available on the demo." }, { status: 404 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await seedDemoData(db, { reset: true });
  return NextResponse.json({ ok: true });
}
