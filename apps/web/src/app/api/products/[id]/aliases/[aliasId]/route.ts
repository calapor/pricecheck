import { deleteAlias, updateAlias } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; aliasId: string }> },
) {
  const { aliasId } = await params;
  let alias: unknown;
  try {
    ({ alias } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof alias !== "string" || !alias.trim()) {
    return NextResponse.json({ error: "alias required" }, { status: 400 });
  }
  const found = await updateAlias(db, aliasId, alias.trim());
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; aliasId: string }> },
) {
  const { aliasId } = await params;
  const found = await deleteAlias(db, aliasId);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
