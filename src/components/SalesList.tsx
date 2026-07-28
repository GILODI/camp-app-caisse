"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateTimeFR } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/types";
import type { Ticket, TicketWithItems } from "@/lib/types";
import { shareTicketPdf } from "@/lib/shareTicket";
import { CancelTicketDialog } from "./CancelTicketDialog";
import { DemandeFactureDialog } from "./DemandeFactureDialog";

const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export function SalesList({
  tickets,
  currentVendeur,
  demandeTicketIds,
  onDemandeCreated,
}: {
  tickets: TicketWithItems[];
  currentVendeur: string;
  // Tickets ayant déjà une demande de facture (ids seuls : les coordonnées
  // client ne sont jamais exposées à l'écran vendeur).
  demandeTicketIds?: Set<string>;
  onDemandeCreated?: (ticketId: string) => void;
}) {
  const [cancelling, setCancelling] = useState<Ticket | null>(null);
  const [demandeFor, setDemandeFor] = useState<Ticket | null>(null);

  if (tickets.length === 0) {
    return <p className="py-10 text-center text-black/40">Aucune vente enregistrée pour l&apos;instant aujourd&apos;hui.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {tickets.map((ticket) => {
          const aDemande = demandeTicketIds?.has(ticket.id) ?? false;
          return (
            <li
              key={ticket.id}
              className={`rounded-lg border bg-white p-3 ${
                ticket.statut === "ANNULE" ? "border-black/10 opacity-60" : "border-black/10"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    N° {ticket.numero}{" "}
                    {ticket.statut === "ANNULE" && (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                        ANNULÉ
                      </span>
                    )}
                    {ticket.statut === "VALIDE" && aDemande && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                        FACTURE DEMANDÉE
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-black/50">
                    {ticket.vendeur} · {labelByMethod.get(ticket.mode_paiement)} ·{" "}
                    {formatDateTimeFR(ticket.created_at)}
                  </p>
                </div>
                <p className="text-lg font-bold">{Number(ticket.total_ttc).toFixed(2)} €</p>
              </div>

              <ul className="mt-1.5 text-xs text-black/60">
                {ticket.ticket_items.map((item) => (
                  <li key={item.id}>
                    {item.quantite} × {item.designation}
                  </li>
                ))}
              </ul>

              {ticket.statut === "ANNULE" && ticket.motif_annulation && (
                <p className="mt-1 text-xs italic text-black/40">Motif : {ticket.motif_annulation}</p>
              )}

              {ticket.statut === "VALIDE" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => shareTicketPdf(ticket.id, ticket.numero, ticket.event_id)}
                    className="rounded-md border border-brand px-3 py-1.5 text-xs font-medium text-brand"
                  >
                    📤 Reçu
                  </button>
                  {!aDemande && (
                    <button
                      onClick={() => setDemandeFor(ticket)}
                      className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
                    >
                      🧾 Facture
                    </button>
                  )}
                  <Link
                    href={`/nouveau?correct=${ticket.id}`}
                    className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
                  >
                    Corriger
                  </Link>
                  <button
                    onClick={() => setCancelling(ticket)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {cancelling && (
        <CancelTicketDialog ticket={cancelling} by={currentVendeur} onClose={() => setCancelling(null)} />
      )}

      {demandeFor && (
        <DemandeFactureDialog
          ticketId={demandeFor.id}
          eventId={demandeFor.event_id}
          vendeur={currentVendeur}
          onClose={() => setDemandeFor(null)}
          onCreated={() => {
            onDemandeCreated?.(demandeFor.id);
            setDemandeFor(null);
          }}
        />
      )}
    </>
  );
}
