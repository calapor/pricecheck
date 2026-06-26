import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { retailers } from "@pricecheck/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ id: retailers.id, slug: retailers.slug, name: retailers.name, baseUrl: retailers.baseUrl, enabled: retailers.enabled })
    .from(retailers)
    .orderBy(retailers.name);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let name: unknown, baseUrl: unknown;
  try {
    ({ name, baseUrl } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return NextResponse.json({ error: "baseUrl required" }, { status: 400 });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [row] = await db
    .insert(retailers)
    .values({ name: name.trim(), slug, baseUrl: baseUrl.trim() })
    .onConflictDoUpdate({ target: retailers.slug, set: { name: name.trim(), baseUrl: baseUrl.trim(), updatedAt: new Date() } })
    .returning({ id: retailers.id, slug: retailers.slug, name: retailers.name });
  return NextResponse.json(row, { status: 201 });
}
