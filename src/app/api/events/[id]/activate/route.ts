import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const { error: deactivateError } = await supabaseServer
    .from("events")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });

  const { data, error } = await supabaseServer
    .from("events")
    .update({ is_active: true })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
