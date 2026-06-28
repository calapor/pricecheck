import { listBuiltIns } from "@pricecheck/scrapers";
import { listPlugins } from "@pricecheck/db";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Returns all available scrapers: built-ins from the registry + installed DB plugins. */
export async function GET() {
  const builtIns = listBuiltIns().map((s) => ({ ...s, source: "built-in" as const }));
  const plugins = (await listPlugins(db)).map((p) => ({
    slug: p.slug,
    displayName: p.displayName,
    baseUrl: p.baseUrl,
    source: "plugin" as const,
  }));
  return NextResponse.json([...builtIns, ...plugins]);
}
