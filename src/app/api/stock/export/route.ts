import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { generateStockExport, buildStockExportFilename } from "@/lib/excelExport";
import { computeStockLines } from "@/lib/stock";

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

  const [{ data: catalogue }, { data: tickets }, { data: mouvements }] = await Promise.all([
    supabaseServer.from("catalogue_items").select("reference, designation, stock_initial").eq("event_id", eventId),
    supabaseServer
      .from("tickets")
      .select("statut, ticket_items(reference, quantite)")
      .eq("event_id", eventId)
      .eq("statut", "VALIDE"),
    supabaseServer.from("mouvements_stock").select("reference, quantite").eq("event_id", eventId),
  ]);

  const ventes: { reference: string; quantite: number }[] = [];
  for (const t of tickets ?? []) {
    const items = (t as { ticket_items?: { reference: string; quantite: number }[] }).ticket_items ?? [];
    ventes.push(...items);
  }

  const lines = computeStockLines(catalogue ?? [], ventes, mouvements ?? []);
  const buffer = await generateStockExport(event.nom, lines);
  const filename = buildStockExportFilename(event.nom);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
