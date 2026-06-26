import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@pricecheck/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ id: products.id, title: products.title, brand: products.brand, category: products.category })
    .from(products)
    .orderBy(products.title);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let title: unknown, brand: unknown, category: unknown;
  try {
    ({ title, brand, category } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const [row] = await db
    .insert(products)
    .values({
      title: title.trim(),
      brand: typeof brand === "string" ? brand.trim() || null : null,
      category: typeof category === "string" ? category.trim() || null : null,
      fuzzyKey: title.trim().toLowerCase(),
    })
    .returning({ id: products.id, title: products.title });
  return NextResponse.json(row, { status: 201 });
}
