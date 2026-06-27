import { createRetailer, listRetailers } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listRetailers(db);
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

  const row = await createRetailer(db, { name: name.trim(), baseUrl: baseUrl.trim() });
  return NextResponse.json(row, { status: 201 });
}
