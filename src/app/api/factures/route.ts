import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Liste des factures émises pour un événement (Admin > Factures) — les
// factures ne sont jamais lisibles depuis le navigateur (RLS verrouillée,
// données client), donc cette liste ne passe que par une route serveur
// authentifiée.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id requis" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("factures")
    .select("*, tickets(numero, vente_date)")
    .eq("event_id", eventId)
    .order("numero_seq", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
