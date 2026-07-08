import { deleteProduct, updateProduct, markDemoDirty } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let title: unknown, brand: unknown, category: unknown;
  try {
    ({ title, brand, category } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const found = await updateProduct(db, id, {
    title: typeof title === "string" && title.trim() ? title.trim() : undefined,
    brand: typeof brand === "string" ? brand.trim() || null : undefined,
    category: typeof category === "string" ? category.trim() || null : undefined,
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  await markDemoDirty(db);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await deleteProduct(db, id);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  await markDemoDirty(db);
  return NextResponse.json({ ok: true });
}
