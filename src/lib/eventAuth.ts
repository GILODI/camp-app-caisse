import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { EVENT_CODE_HEADER, normalizeAccessCode } from "@/lib/accessCode";

// Le code d'accès de l'événement peut arriver par en-tête (requêtes fetch)
// ou par paramètre d'URL (ouverture directe d'un PDF via window.open, où
// l'on ne maîtrise pas les en-têtes).
function readCode(req: NextRequest): string | null {
  const header = req.headers.get(EVENT_CODE_HEADER);
  if (header) return header;
  return new URL(req.url).searchParams.get("code");
}

// Autorise l'accès aux opérations de vente d'un événement : soit l'admin
// (cookie), soit le vendeur qui a déverrouillé l'événement avec son code.
// Sans ce contrôle, n'importe qui connaissant l'URL pourrait créer ou
// annuler des tickets — les identifiants d'événement et de ticket sont
// lisibles publiquement (policies RLS nécessaires au temps réel).
export async function isEventRequestAllowed(req: NextRequest, eventId: string): Promise<boolean> {
  if (await isAdminRequest(req)) return true;

  const code = readCode(req);
  if (!code) return false;

  const { data: event } = await supabaseServer
    .from("events")
    .select("code_acces")
    .eq("id", eventId)
    .single();

  if (!event?.code_acces) return false;
  return normalizeAccessCode(code) === normalizeAccessCode(event.code_acces);
}

// Même contrôle à partir d'un ticket : on remonte à son événement.
export async function isTicketRequestAllowed(req: NextRequest, ticketId: string): Promise<boolean> {
  if (await isAdminRequest(req)) return true;

  const { data: ticket } = await supabaseServer
    .from("tickets")
    .select("event_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) return false;
  return isEventRequestAllowed(req, ticket.event_id);
}
