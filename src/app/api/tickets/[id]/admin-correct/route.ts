import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import type { NewTicketPayload } from "@/lib/types";

export const runtime = "nodejs";

// Correction d'un ticket d'une journée passée. Réservée à l'admin (mot de
// passe), contrairement à la correction du jour accessible au vendeur : le
// ticket de remplacement garde la date de vente d'origine, donc il ne faut
// pas que n'importe qui puisse réécrire une journée déjà comptabilisée.
// La journée clôturée reste refusée par la base (garde de cancel_ticket).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let payload: NewTicketPayload & { by?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { vendeur, mode_paiement, items, by } = payload;

  if (!vendeur || !mode_paiement || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  for (const item of items) {
    if (!item.reference || !item.designation || !(item.quantite > 0) || !(item.prix_unitaire >= 0)) {
      return NextResponse.json({ error: "Ligne de ticket invalide" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseServer
    .rpc("admin_correct_ticket", {
      p_ticket_id: id,
      p_vendeur: vendeur,
      p_mode_paiement: mode_paiement,
      p_items: items,
      p_by: by ?? "Admin",
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Si le client avait demandé une facture, elle doit suivre la vente réelle
  // et non rester sur le ticket annulé (même logique que la correction du
  // jour) — l'originale est conservée, rattachée au ticket annulé.
  const { data: demande } = await supabaseServer
    .from("demandes_facture")
    .select("*")
    .eq("ticket_id", id)
    .maybeSingle();

  if (demande) {
    await supabaseServer.from("demandes_facture").insert({
      ticket_id: (data as { id: string }).id,
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

  return NextResponse.json(data, { status: 201 });
}
