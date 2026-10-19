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

  const { event_id, vendeur, mode_paiement, items, client_ref, vendu_le } = payload;

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
  if (vendu_le !== undefined && (typeof vendu_le !== "string" || Number.isNaN(Date.parse(vendu_le)))) {
    return NextResponse.json({ error: "Date de vente invalide" }, { status: 400 });
  }
  if (!(await isEventRequestAllowed(req, event_id))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // vendu_le est une information du téléphone : le serveur décide seul s'il
  // la retient (voir create_ticket : moins de 48 h, pas dans le futur, et
  // jamais sur une journée déjà clôturée). On la transmet telle quelle.
  const base = {
    p_event_id: event_id,
    p_vendeur: vendeur,
    p_mode_paiement: mode_paiement,
    p_items: items,
  };
  const withDate = vendu_le ? { ...base, p_vendu_le: vendu_le } : base;

  // Du plus complet au plus ancien. On ne passe à la variante suivante que si
  // la fonction (ou sa signature) n'existe pas encore en base (PGRST202) —
  // c'est-à-dire si le code est déployé avant la migration. Les ventes ne
  // s'arrêtent alors jamais, au prix d'une protection en moins (doublons,
  // date réelle), signalée dans les journaux Vercel.
  const attempts: [string, Record<string, unknown>][] = [];
  if (client_ref) {
    attempts.push(["create_ticket_idempotent", { p_client_ref: client_ref, ...withDate }]);
    if (vendu_le) attempts.push(["create_ticket_idempotent", { p_client_ref: client_ref, ...base }]);
  }
  attempts.push(["create_ticket", withDate]);
  if (vendu_le) attempts.push(["create_ticket", base]);

  let result = await supabaseServer.rpc(attempts[0][0], attempts[0][1]).single();
  for (const [fn, args] of attempts.slice(1)) {
    if (result.error?.code !== "PGRST202") break;
    console.warn(`Signature introuvable en base (migration non exécutée ?), repli sur ${fn}`);
    result = await supabaseServer.rpc(fn, args).single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json(result.data, { status: 201 });
}
