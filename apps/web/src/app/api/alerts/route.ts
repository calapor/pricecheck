import { setAlert } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let offerId: unknown, enabled: unknown;
  try {
    ({ offerId, enabled } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof offerId !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "offerId (string) and enabled (boolean) required" }, { status: 400 });
  }

  await setAlert(db, offerId, enabled);
  return NextResponse.json({ ok: true });
}
