"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateTimeFR } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/types";
import type { Ticket, TicketWithItems } from "@/lib/types";
import { CancelTicketDialog } from "./CancelTicketDialog";

const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export function SalesList({ tickets, currentVendeur }: { tickets: TicketWithItems[]; currentVendeur: string }) {
  const [cancelling, setCancelling] = useState<Ticket | null>(null);

  if (tickets.length === 0) {
    return <p className="py-10 text-center text-black/40">Aucune vente enregistrée pour l&apos;instant aujourd&apos;hui.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {tickets.map((ticket) => (
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
                </p>
                <p className="text-xs text-black/50">
                  {ticket.vendeur} · {labelByMethod.get(ticket.mode_paiement)} · {formatDateTimeFR(ticket.created_at)}
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
              <div className="mt-2 flex gap-2">
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
        ))}
      </ul>

      {cancelling && (
        <CancelTicketDialog ticket={cancelling} by={currentVendeur} onClose={() => setCancelling(null)} />
      )}
    </>
  );
}
