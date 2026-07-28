import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isTicketRequestAllowed } from "@/lib/eventAuth";
import type { NewTicketPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await isTicketRequestAllowed(req, id))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

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

  await reportDemandeFacture(id, (data as { id: string }).id);

  return NextResponse.json(data, { status: 201 });
}

// Une correction annule l'ancien ticket et en crée un nouveau : si le client
// avait demandé une facture, elle doit suivre la vente réelle, sinon on
// facturerait un ticket annulé. La demande d'origine reste attachée au
// ticket annulé (jamais de suppression), on en recopie une sur le nouveau.
async function reportDemandeFacture(ancienTicketId: string, nouveauTicketId: string) {
  const { data: demande } = await supabaseServer
    .from("demandes_facture")
    .select("*")
    .eq("ticket_id", ancienTicketId)
    .maybeSingle();

  if (!demande) return;

  await supabaseServer.from("demandes_facture").insert({
    ticket_id: nouveauTicketId,
    event_id: demande.event_id,
    client_nom: demande.client_nom,
    client_prenom: demande.client_prenom,
    client_adresse: demande.client_adresse,
    client_telephone: demande.client_telephone,
    client_email: demande.client_email,
    client_siret: demande.client_siret,
    created_by: demande.created_by,
  });
}
