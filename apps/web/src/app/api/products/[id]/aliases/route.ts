import { addAlias, listAliases } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await listAliases(db, id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let alias: unknown;
  try {
    ({ alias } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof alias !== "string" || !alias.trim()) {
    return NextResponse.json({ error: "alias required" }, { status: 400 });
  }
  const row = await addAlias(db, id, alias.trim());
  return NextResponse.json(row, { status: 201 });
}
