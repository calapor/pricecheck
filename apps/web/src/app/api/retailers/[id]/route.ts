import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { retailers } from "@pricecheck/db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name: unknown, baseUrl: unknown, enabled: unknown;
  try {
    ({ name, baseUrl, enabled } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof name === "string" && name.trim()) {
    set.name = name.trim();
    set.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  if (typeof baseUrl === "string" && baseUrl.trim()) set.baseUrl = baseUrl.trim();
  if (typeof enabled === "boolean") set.enabled = enabled;

  const [row] = await db.update(retailers).set(set).where(eq(retailers.id, id)).returning({ id: retailers.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(retailers).where(eq(retailers.id, id)).returning({ id: retailers.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
