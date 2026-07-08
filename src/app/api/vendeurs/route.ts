import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const event_id = body.event_id as string | undefined;
  const nom = (body.nom ?? "").trim();

  if (!event_id || !nom) {
    return NextResponse.json({ error: "event_id et nom requis" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("vendeurs")
    .insert({ event_id, nom })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
