import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@pricecheck/db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let title: unknown, brand: unknown, category: unknown;
  try {
    ({ title, brand, category } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof title === "string" && title.trim()) {
    set.title = title.trim();
    set.fuzzyKey = title.trim().toLowerCase();
  }
  if (typeof brand === "string") set.brand = brand.trim() || null;
  if (typeof category === "string") set.category = category.trim() || null;

  const [row] = await db.update(products).set(set).where(eq(products.id, id)).returning({ id: products.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
