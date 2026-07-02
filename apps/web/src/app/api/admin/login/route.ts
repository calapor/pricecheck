import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, safeEqual, tokenFor } from "@/lib/admin-auth";

/** Exchange a password for an admin session cookie. */
export async function POST(req: Request) {
  const token = adminToken();
  if (!token) {
    return NextResponse.json(
      { error: "Admin is not configured — set ADMIN_PASSWORD in the environment." },
      { status: 503 },
    );
  }

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof password !== "string" || !safeEqual(tokenFor(password), token)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return NextResponse.json({ ok: true });
}

/** Log out — clear the admin cookie. */
export async function DELETE() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
