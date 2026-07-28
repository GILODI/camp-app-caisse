import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { normalizeAccessCode } from "@/lib/accessCode";

export const runtime = "nodejs";

// Liste des tickets d'un événement ayant déjà une demande de facture, pour
// que l'écran vendeur "Ventes du jour" puisse afficher le bon état sans
// jamais recevoir les coordonnées client (celles-ci restent réservées à
// l'admin, voir GET /api/demandes-facture).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  const code = searchParams.get("code");

  if (!eventId) return NextResponse.json({ error: "event_id requis" }, { status: 400 });

  const { data: event } = await supabaseServer
    .from("events")
    .select("code_acces")
    .eq("id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });

  const admin = await isAdminRequest(req);
  const validCode =
    !!code && !!event.code_acces && normalizeAccessCode(code) === normalizeAccessCode(event.code_acces);
  if (!admin && !validCode) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from("demandes_facture")
    .select("ticket_id")
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map((d) => d.ticket_id));
}
