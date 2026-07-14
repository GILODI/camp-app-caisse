import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { generateEventArchive, buildEventArchiveFilename } from "@/lib/excelExport";
import { computeCaisseRows } from "@/lib/caisseCalc";
import { computeStockLines } from "@/lib/stock";
import type { CaisseComptage, MouvementStock, TicketWithItems } from "@/lib/types";

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

  const [
    { data: tickets, error: ticketsError },
    { data: comptagesData, error: comptagesError },
    { data: catalogue },
    { data: mouvementsData, error: mouvementsError },
  ] = await Promise.all([
    supabaseServer.from("tickets").select("*, ticket_items(*)").eq("event_id", eventId).order("numero", { ascending: true }),
    supabaseServer.from("caisse_comptages").select("*").eq("event_id", eventId),
    supabaseServer.from("catalogue_items").select("reference, designation, stock_initial").eq("event_id", eventId),
    supabaseServer.from("mouvements_stock").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
  ]);

  if (ticketsError) return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  if (comptagesError) return NextResponse.json({ error: comptagesError.message }, { status: 500 });
  if (mouvementsError) return NextResponse.json({ error: mouvementsError.message }, { status: 500 });

  const allTickets = (tickets ?? []) as TicketWithItems[];

  const especesParJour: Record<string, number> = {};
  const ventes: { reference: string; quantite: number }[] = [];
  for (const t of allTickets) {
    if (t.statut !== "VALIDE") continue;
    if (t.mode_paiement === "ESPECES") {
      especesParJour[t.vente_date] = (especesParJour[t.vente_date] ?? 0) + Number(t.total_ttc);
    }
    ventes.push(...t.ticket_items.map((i) => ({ reference: i.reference, quantite: i.quantite })));
  }

  const comptages = (comptagesData ?? []) as CaisseComptage[];
  const caisseRows = computeCaisseRows(comptages, especesParJour);
  const stockLines = computeStockLines(catalogue ?? [], ventes, (mouvementsData ?? []) as MouvementStock[]);

  const buffer = await generateEventArchive(
    event.nom,
    allTickets,
    caisseRows,
    comptages,
    stockLines,
    (mouvementsData ?? []) as MouvementStock[]
  );
  const filename = buildEventArchiveFilename(event.nom);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
