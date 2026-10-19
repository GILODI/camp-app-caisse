import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isEventRequestAllowed } from "@/lib/eventAuth";
import type { NewTicketPayload } from "@/lib/types";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let payload: NewTicketPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { event_id, vendeur, mode_paiement, items, client_ref } = payload;

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
  if (client_ref !== undefined && (typeof client_ref !== "string" || !UUID_RE.test(client_ref))) {
    return NextResponse.json({ error: "Référence de vente invalide" }, { status: 400 });
  }
  if (!(await isEventRequestAllowed(req, event_id))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const legacyArgs = {
    p_event_id: event_id,
    p_vendeur: vendeur,
    p_mode_paiement: mode_paiement,
    p_items: items,
  };

  // Chemin normal : création idempotente. Un renvoi de la même vente (la
  // confirmation s'est perdue en route) retrouve le ticket déjà créé au lieu
  // d'en créer un second.
  let result = client_ref
    ? await supabaseServer.rpc("create_ticket_idempotent", { p_client_ref: client_ref, ...legacyArgs }).single()
    : null;

  // PGRST202 : la fonction n'existe pas encore en base (code déployé avant la
  // migration). On retombe sur la création classique pour que les ventes ne
  // s'arrêtent pas — mais sans protection contre les doublons, d'où l'alerte.
  if (result?.error?.code === "PGRST202") {
    console.warn("create_ticket_idempotent introuvable : migration non exécutée, repli sur create_ticket");
    result = null;
  }

  if (!result) {
    result = await supabaseServer.rpc("create_ticket", legacyArgs).single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json(result.data, { status: 201 });
}
