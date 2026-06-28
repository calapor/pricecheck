import { createProduct, listProducts } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncOffersForProduct } from "@/lib/offers";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listProducts(db);
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

  const row = await createProduct(db, {
    title: title.trim(),
    brand: typeof brand === "string" ? brand.trim() || null : null,
    category: typeof category === "string" ? category.trim() || null : null,
  });

  // Immediately create + price offers at every configured retailer so the new
  // product shows up on the home page with live prices (on sale or not).
  const sync = await syncOffersForProduct(db, row.id);
  return NextResponse.json({ ...row, sync }, { status: 201 });
}
