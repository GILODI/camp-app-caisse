import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Clôture (verrouille) un événement entier — n'est possible qu'une fois
// tous ses jours de vente déjà clôturés individuellement.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "Admin";

  const { data, error } = await supabaseServer.rpc("close_event", { p_event_id: id, p_by: by }).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data, { status: 201 });
}
