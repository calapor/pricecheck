import geoip from "geoip-lite";
import { getDb, recordRequestLog } from "@pricecheck/db";
import { NextResponse, type NextRequest } from "next/server";

// Node.js runtime is required: geoip-lite reads data files from disk and the
// postgres-js DB client is Node-only — neither works on the Edge runtime.
export const config = {
  runtime: "nodejs",
  // Log real page/route hits only: skip Next internals, static assets, the
  // metrics/health probes, and anything with a file extension (favicons, images…).
  matcher: ["/((?!_next/static|_next/image|api/metrics|api/healthz|.*\\.[\\w]+$).*)"],
};

/** First hop in X-Forwarded-For (the original client), falling back to x-real-ip. */
function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export function middleware(req: NextRequest) {
  const ip = clientIp(req);
  const geo = ip ? geoip.lookup(ip) : null;

  // Fire-and-forget: logging must never add latency to or fail the response.
  void recordRequestLog(getDb(), {
    method: req.method,
    path: req.nextUrl.pathname,
    ip,
    userAgent: req.headers.get("user-agent"),
    country: geo?.country ?? null,
    region: geo?.region ?? null,
    city: geo?.city ?? null,
  }).catch(() => undefined);

  return NextResponse.next();
}
