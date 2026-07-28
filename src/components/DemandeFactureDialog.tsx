"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DemandeFacture } from "@/lib/types";

// Le client souhaite une facture : on note ses coordonnées pour que la
// facture soit établie plus tard dans le système comptable — le ticket
// reste la pièce de caisse, l'appli ne génère jamais la facture elle-même.
export function DemandeFactureDialog({
  ticketId,
  vendeur,
  onClose,
  onCreated,
}: {
  ticketId: string;
  vendeur: string;
  onClose: () => void;
  onCreated: (demande: DemandeFacture) => void;
}) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [siret, setSiret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !prenom.trim() || !adresse.trim() || !telephone.trim()) {
      toast.error("Nom, prénom, adresse et téléphone requis");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/demande-facture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_nom: nom.trim(),
          client_prenom: prenom.trim(),
          client_adresse: adresse.trim(),
          client_telephone: telephone.trim(),
          client_siret: siret.trim() || undefined,
          by: vendeur,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Échec de l'enregistrement de la demande");
      onCreated(body as DemandeFacture);
      toast.success("Demande de facture enregistrée");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        <p className="text-lg font-bold">Demande de facture</p>
        <p className="text-sm text-black/60">
          Le ticket reste enregistré tel quel. La facture sera établie plus tard à partir de ces coordonnées —
          l&apos;appli ne la génère pas ici.
        </p>

        <label className="block text-sm font-medium">
          Nom *
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
            autoFocus
          />
        </label>

        <label className="block text-sm font-medium">
          Prénom *
          <input
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium">
          Adresse *
          <textarea
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            required
            rows={2}
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium">
          Téléphone *
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            required
            type="tel"
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium">
          SIRET (si client professionnel)
          <input
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-black/15 py-3 font-semibold"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
