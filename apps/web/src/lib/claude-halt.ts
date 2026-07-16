import "server-only";
import { neon } from "@neondatabase/serverless";

// All apps read the SAME key so one UPDATE stops Claude everywhere.
const FLAG_KEY = "claude_api";
const TTL_MS = 30_000; // cache the flag ~30s to avoid a DB hit on every request

let cache: { enabled: boolean; at: number } | null = null;

export const CLAUDE_HALTED_MESSAGE =
  "Claude API budget for today has been used, please try again tomorrow.";

/**
 * True when the shared Claude-API kill switch is engaged.
 * Fail-open: if FLAGS_DATABASE_URL is unset or the flags DB is unreachable, returns false
 * (does NOT block) so an unconfigured app or a transient Neon blip never breaks the product.
 * To fail-closed instead (block on doubt), change the two `return false` in the catch/no-url
 * paths to `return true`.
 */
export async function isClaudeHalted(): Promise<boolean> {
  const url = process.env.FLAGS_DATABASE_URL;
  if (!url) return false;
  if (cache && Date.now() - cache.at < TTL_MS) return !cache.enabled;
  try {
    const sql = neon(url);
    const rows = (await sql`SELECT enabled FROM global_flags WHERE key = ${FLAG_KEY} LIMIT 1`) as Array<{
      enabled: boolean;
    }>;
    const enabled = rows[0]?.enabled ?? true;
    cache = { enabled, at: Date.now() };
    return !enabled;
  } catch {
    return false;
  }
}
