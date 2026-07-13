import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { generateMouvementsExport, buildMouvementsExportFilename } from "@/lib/excelExport";
import type { MouvementStock } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id requis" }, { status: 400 });

  const { data: event } = await supabaseServer.from("events").select("nom").eq("id", eventId).single();
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });

  const { data: mouvements, error } = await supabaseServer
    .from("mouvements_stock")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buffer = await generateMouvementsExport(event.nom, (mouvements ?? []) as MouvementStock[]);
  const filename = buildMouvementsExportFilename(event.nom);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
