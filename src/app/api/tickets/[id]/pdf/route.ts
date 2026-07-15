import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { renderTicketPdf } from "@/lib/ticketPdf";
import type { TicketItem } from "@/lib/types";

export const runtime = "nodejs";

// Sert le PDF du ticket de caisse (reçu client) — pièce déjà enregistrée en
// base, jamais reconstruite à partir de ce que le vendeur a sous les yeux.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: ticket, error: ticketError } = await supabaseServer
    .from("tickets")
    .select("numero, mode_paiement, created_at, event_id, events(nom)")
    .eq("id", id)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabaseServer
    .from("ticket_items")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const eventNom = (ticket as unknown as { events: { nom: string } | { nom: string }[] }).events;
  const eventNomStr = Array.isArray(eventNom) ? eventNom[0]?.nom : eventNom?.nom;

  const pdfBuffer = await renderTicketPdf({
    numero: ticket.numero,
    createdAt: ticket.created_at,
    modePaiement: ticket.mode_paiement,
    items: (items ?? []) as TicketItem[],
    eventNom: eventNomStr ?? "",
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Ticket-${ticket.numero}.pdf"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  });
}
