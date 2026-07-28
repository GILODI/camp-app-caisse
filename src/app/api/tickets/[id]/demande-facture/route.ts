import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { NewDemandeFacturePayload } from "@/lib/types";

export const runtime = "nodejs";

// Enregistre une demande de facture sur un ticket déjà validé — la facture
// elle-même n'est jamais générée par l'appli, seulement la demande et les
// coordonnées du client (voir schema.sql, table demandes_facture).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let payload: NewDemandeFacturePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const client_nom = (payload.client_nom ?? "").trim();
  const client_prenom = (payload.client_prenom ?? "").trim();
  const client_adresse = (payload.client_adresse ?? "").trim();
  const client_telephone = (payload.client_telephone ?? "").trim();
  const client_siret = (payload.client_siret ?? "").trim();
  const by = (payload.by ?? "").trim() || "Inconnu";

  if (!client_nom || !client_prenom || !client_adresse || !client_telephone) {
    return NextResponse.json({ error: "Nom, prénom, adresse et téléphone requis" }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await supabaseServer
    .from("tickets")
    .select("event_id")
    .eq("id", id)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const { data, error } = await supabaseServer
    .from("demandes_facture")
    .insert({
      ticket_id: id,
      event_id: ticket.event_id,
      client_nom,
      client_prenom,
      client_adresse,
      client_telephone,
      client_siret: client_siret || null,
      created_by: by,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
