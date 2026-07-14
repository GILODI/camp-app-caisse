import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { TAUX_TVA_DEFAUT, type NewFacturePayload } from "@/lib/types";

export const runtime = "nodejs";

// Émet une facture sur un ticket déjà validé. Le ticket reste la pièce de
// caisse ; la facture est un document client complémentaire, demandé au
// moment de l'encaissement (ou juste après).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let payload: NewFacturePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const client_nom = (payload.client_nom ?? "").trim();
  const client_adresse = (payload.client_adresse ?? "").trim();
  const by = (payload.by ?? "").trim() || "Inconnu";

  if (!client_nom || !client_adresse) {
    return NextResponse.json({ error: "Nom et adresse du client requis" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .rpc("create_facture", {
      p_ticket_id: id,
      p_client_nom: client_nom,
      p_client_adresse: client_adresse,
      p_client_siret: (payload.client_siret ?? "").trim(),
      p_client_tva_intraco: (payload.client_tva_intraco ?? "").trim(),
      p_taux_tva: payload.taux_tva ?? TAUX_TVA_DEFAUT,
      p_by: by,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
