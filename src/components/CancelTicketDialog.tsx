"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Ticket } from "@/lib/types";

export function CancelTicketDialog({
  ticket,
  by,
  onClose,
}: {
  ticket: Ticket;
  by: string;
  onClose: () => void;
}) {
  const [motif, setMotif] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif, by }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de l'annulation");
      toast.success(`Ticket n° ${ticket.numero} annulé`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 className="text-lg font-bold">Annuler le ticket n° {ticket.numero}</h2>
        <p className="mt-1 text-sm text-black/60">
          Le ticket restera visible dans l&apos;historique, marqué comme annulé. Cette action est tracée.
        </p>
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Raison (optionnel)"
          className="mt-3 w-full rounded-lg border border-black/15 p-3 text-sm"
          rows={3}
        />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-black/15 py-3 font-medium">
            Retour
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Annulation…" : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  );
}
