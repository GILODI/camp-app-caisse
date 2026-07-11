import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import type { MouvementType } from "@/lib/types";

export const runtime = "nodejs";

const TYPES: MouvementType[] = ["VOL", "DOTATION", "CASSE"];

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const event_id = body.event_id as string | undefined;
  const reference = (body.reference ?? "").trim();
  const designation = (body.designation ?? "").trim();
  const type = body.type as MouvementType;
  const quantite = Number(body.quantite);
  const motif = typeof body.motif === "string" && body.motif.trim() ? body.motif.trim() : null;
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : null;

  if (!event_id || !reference || !designation || !TYPES.includes(type)) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  if (!Number.isInteger(quantite) || quantite <= 0) {
    return NextResponse.json({ error: "Quantité invalide" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("mouvements_stock")
    .insert({ event_id, reference, designation, type, quantite, motif, created_by: by })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { error } = await supabaseServer.from("mouvements_stock").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
