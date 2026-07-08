import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { generateDailyExport, buildExportFilename } from "@/lib/excelExport";
import { isAdminRequest } from "@/lib/adminAuth";
import { normalizeAccessCode } from "@/lib/accessCode";
import type { TicketWithItems } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  const date = searchParams.get("date");
  const code = searchParams.get("code");

  if (!eventId || !date) {
    return NextResponse.json({ error: "event_id et date requis" }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("nom, code_acces")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }

  // Accès admin (mot de passe) OU code d'accès de l'événement (vendeur déjà
  // déverrouillé sur cet appareil) — l'export contient toutes les ventes et
  // les prix, on ne le laisse pas ouvert à n'importe qui connaissant l'URL.
  const admin = await isAdminRequest(req);
  const validCode = !!code && !!event.code_acces && normalizeAccessCode(code) === normalizeAccessCode(event.code_acces);
  if (!admin && !validCode) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { data: tickets, error: ticketsError } = await supabaseServer
    .from("tickets")
    .select("*, ticket_items(*)")
    .eq("event_id", eventId)
    .eq("vente_date", date)
    .order("numero", { ascending: true });

  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  }

  const buffer = await generateDailyExport(event.nom, date, (tickets ?? []) as TicketWithItems[]);
  const filename = buildExportFilename(event.nom, date);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
