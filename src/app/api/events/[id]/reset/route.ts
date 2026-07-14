import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Vide les données de vente (tickets, factures, mouvements, comptages) d'un
// événement — pour repartir d'une base propre sur un événement de test.
// Ne touche jamais au catalogue ni à la séquence légale des factures.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabaseServer.rpc("reset_event_test_data", { p_event_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
