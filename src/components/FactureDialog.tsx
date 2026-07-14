"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Facture } from "@/lib/types";

// Formulaire client + émission de facture, ouvert depuis l'écran de
// confirmation d'un ticket déjà validé (facture = document complémentaire,
// le ticket reste la pièce de caisse).
export function FactureDialog({
  ticketId,
  vendeur,
  onClose,
  onCreated,
}: {
  ticketId: string;
  vendeur: string;
  onClose: () => void;
  onCreated: (facture: Facture) => void;
}) {
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [siret, setSiret] = useState("");
  const [tva, setTva] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !adresse.trim()) {
      toast.error("Nom et adresse du client requis");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/facture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_nom: nom.trim(),
          client_adresse: adresse.trim(),
          client_siret: siret.trim() || undefined,
          client_tva_intraco: tva.trim() || undefined,
          by: vendeur,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Échec de la création de la facture");
      onCreated(body as Facture);
      toast.success(`Facture ${body.numero_affiche} créée`);
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
        <p className="text-lg font-bold">Émettre une facture</p>
        <p className="text-sm text-black/60">
          Le ticket reste enregistré tel quel ; la facture est un document complémentaire pour le client.
        </p>

        <label className="block text-sm font-medium">
          Nom / raison sociale du client *
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
            autoFocus
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
          SIRET (si client professionnel)
          <input
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium">
          N° TVA intracommunautaire (optionnel)
          <input
            value={tva}
            onChange={(e) => setTva(e.target.value)}
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
            {submitting ? "Création…" : "Créer la facture"}
          </button>
        </div>
      </form>
    </div>
  );
}
