import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { NewTicketPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let payload: NewTicketPayload & { by?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { event_id, vendeur, mode_paiement, items, by } = payload;

  if (!event_id || !vendeur || !mode_paiement || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .rpc("correct_ticket", {
      p_ticket_id: id,
      p_event_id: event_id,
      p_vendeur: vendeur,
      p_mode_paiement: mode_paiement,
      p_items: items,
      p_by: by ?? vendeur,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
