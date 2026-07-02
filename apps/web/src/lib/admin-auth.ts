import "server-only";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "pc_admin";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** The cookie value that proves admin auth: sha256 of the configured password. */
export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? sha256(pw) : null;
}

/** Token derived from a submitted password, for comparison against {@link adminToken}. */
export function tokenFor(password: string): string {
  return sha256(password);
}

/** Constant-time string compare so token checks don't leak length/content via timing. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True when the request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  const token = adminToken();
  if (!token) return false;
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!cookie && safeEqual(cookie, token);
}
