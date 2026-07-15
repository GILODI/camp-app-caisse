import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Clôture (verrouille) une journée de vente d'un événement — plus aucun
// ticket ne peut ensuite être créé, corrigé ou annulé sur cette date.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const vente_date = typeof body.vente_date === "string" ? body.vente_date : "";
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "Admin";

  if (!vente_date) {
    return NextResponse.json({ error: "vente_date requise" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .rpc("close_day", { p_event_id: id, p_vente_date: vente_date, p_by: by })
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data, { status: 201 });
}
