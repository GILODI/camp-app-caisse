import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const motif: string = (body.motif ?? "").trim() || "Non précisé";
  const by: string = (body.by ?? "").trim() || "Inconnu";

  const { error } = await supabaseServer.rpc("cancel_ticket", {
    p_ticket_id: id,
    p_motif: motif,
    p_by: by,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
