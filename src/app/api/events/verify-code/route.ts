import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizeAccessCode } from "@/lib/accessCode";

export const runtime = "nodejs";

// Ne renvoie jamais le code lui-même — seulement si celui fourni correspond.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const event_id = typeof body.event_id === "string" ? body.event_id : "";
  const code = typeof body.code === "string" ? body.code : "";

  if (!event_id || !code) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { data } = await supabaseServer.from("events").select("code_acces").eq("id", event_id).single();

  const ok = !!data?.code_acces && normalizeAccessCode(data.code_acces) === normalizeAccessCode(code);
  return NextResponse.json({ ok });
}
