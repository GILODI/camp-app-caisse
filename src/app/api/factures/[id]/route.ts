import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { renderFacturePdf } from "@/lib/facturePdf";
import type { Facture, TicketItem } from "@/lib/types";

export const runtime = "nodejs";

// Sert le PDF d'une facture déjà émise (voir POST /api/tickets/[id]/facture).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: facture, error: factureError } = await supabaseServer
    .from("factures")
    .select("*")
    .eq("id", id)
    .single();

  if (factureError || !facture) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  const { data: ticket, error: ticketError } = await supabaseServer
    .from("tickets")
    .select("numero, vente_date, mode_paiement, event_id, events(nom)")
    .eq("id", (facture as Facture).ticket_id)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Ticket associé introuvable" }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabaseServer
    .from("ticket_items")
    .select("*")
    .eq("ticket_id", (facture as Facture).ticket_id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const eventNom = (ticket as unknown as { events: { nom: string } | { nom: string }[] }).events;
  const eventNomStr = Array.isArray(eventNom) ? eventNom[0]?.nom : eventNom?.nom;

  const pdfBuffer = await renderFacturePdf({
    facture: facture as Facture,
    ticketNumero: ticket.numero,
    venteDate: ticket.vente_date,
    modePaiement: ticket.mode_paiement,
    items: (items ?? []) as TicketItem[],
    eventNom: eventNomStr ?? "",
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${(facture as Facture).numero_affiche}.pdf"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  });
}
