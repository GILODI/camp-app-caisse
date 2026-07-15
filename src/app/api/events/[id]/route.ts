import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { generateAccessCode, normalizeAccessCode } from "@/lib/accessCode";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: { nom?: string; code_acces?: string; is_test?: boolean } = {};
  if (typeof body.nom === "string" && body.nom.trim()) update.nom = body.nom.trim();
  if (body.regenerate_code === true) {
    update.code_acces = generateAccessCode();
  } else if (typeof body.code_acces === "string" && body.code_acces.trim()) {
    const code = normalizeAccessCode(body.code_acces);
    if (code.length < 3 || code.length > 20) {
      return NextResponse.json({ error: "Le code doit faire entre 3 et 20 caractères" }, { status: 400 });
    }
    update.code_acces = code;
  }
  if (typeof body.is_test === "boolean") update.is_test = body.is_test;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.from("events").update(update).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
