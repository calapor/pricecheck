export const dynamic = "force-dynamic";

/** Liveness/readiness probe for k8s. */
export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain" } });
}
