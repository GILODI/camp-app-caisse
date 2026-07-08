import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nom = (body.nom ?? "").trim();

  if (!nom) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("events")
    .update({ nom })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
