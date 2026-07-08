import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { NewTicketPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let payload: NewTicketPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { event_id, vendeur, mode_paiement, items } = payload;

  if (!event_id || !vendeur || !mode_paiement) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Le ticket doit contenir au moins une ligne" }, { status: 400 });
  }
  for (const item of items) {
    if (!item.reference || !item.designation || !(item.quantite > 0) || !(item.prix_unitaire >= 0)) {
      return NextResponse.json({ error: "Ligne de ticket invalide" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseServer
    .rpc("create_ticket", {
      p_event_id: event_id,
      p_vendeur: vendeur,
      p_mode_paiement: mode_paiement,
      p_items: items,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
