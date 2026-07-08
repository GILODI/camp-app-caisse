import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const nom = (body.nom ?? "").trim();
  if (!nom) return NextResponse.json({ error: "Nom de l'événement requis" }, { status: 400 });

  const { data, error } = await supabaseServer.from("events").insert({ nom }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
