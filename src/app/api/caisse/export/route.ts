import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { generateCaisseExport, buildCaisseExportFilename } from "@/lib/excelExport";
import { computeCaisseRows } from "@/lib/caisseCalc";
import type { CaisseComptage } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json({ error: "event_id requis" }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("nom")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }

  const [{ data: comptagesData, error: comptagesError }, { data: ticketsData, error: ticketsError }] =
    await Promise.all([
      supabaseServer.from("caisse_comptages").select("*").eq("event_id", eventId),
      supabaseServer
        .from("tickets")
        .select("vente_date, total_ttc")
        .eq("event_id", eventId)
        .eq("mode_paiement", "ESPECES")
        .eq("statut", "VALIDE"),
    ]);

  if (comptagesError) return NextResponse.json({ error: comptagesError.message }, { status: 500 });
  if (ticketsError) return NextResponse.json({ error: ticketsError.message }, { status: 500 });

  const especesParJour: Record<string, number> = {};
  for (const t of ticketsData ?? []) {
    especesParJour[t.vente_date] = (especesParJour[t.vente_date] ?? 0) + Number(t.total_ttc);
  }

  const comptages = (comptagesData ?? []) as CaisseComptage[];
  const rows = computeCaisseRows(comptages, especesParJour);
  const buffer = await generateCaisseExport(event.nom, rows, comptages);
  const filename = buildCaisseExportFilename(event.nom);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
