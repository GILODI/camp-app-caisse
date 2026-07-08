import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, hashAdminPassword } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const secret = process.env.ADMIN_PASSWORD;

  if (!secret) {
    return NextResponse.json({ error: "ADMIN_PASSWORD non configuré sur le serveur" }, { status: 500 });
  }
  if (password !== secret) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await hashAdminPassword(secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
