import { renderMetrics } from "@pricecheck/observability";

export const dynamic = "force-dynamic";

/** Prometheus scrape endpoint for the web tier. */
export async function GET() {
  const { contentType, body } = await renderMetrics();
  return new Response(body, { headers: { "content-type": contentType } });
}
