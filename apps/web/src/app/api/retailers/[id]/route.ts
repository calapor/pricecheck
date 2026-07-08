import { deleteRetailer, updateRetailer, markDemoDirty } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name: unknown, baseUrl: unknown, enabled: unknown;
  try {
    ({ name, baseUrl, enabled } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const found = await updateRetailer(db, id, {
    name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    baseUrl: typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : undefined,
    enabled: typeof enabled === "boolean" ? enabled : undefined,
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  await markDemoDirty(db);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await deleteRetailer(db, id);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  await markDemoDirty(db);
  return NextResponse.json({ ok: true });
}
