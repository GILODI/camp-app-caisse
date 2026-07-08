"use client";

import { useVendeurs } from "@/lib/hooks";
import { setStoredVendeur } from "@/lib/currentVendeur";

export function VendeurPicker({ eventId, onPick }: { eventId: string; onPick: (nom: string) => void }) {
  const { vendeurs, loading } = useVendeurs(eventId);
  const actifs = vendeurs.filter((v) => v.actif);

  if (loading) return <p className="text-sm text-black/50">Chargement des vendeurs…</p>;

  if (actifs.length === 0) {
    return (
      <p className="text-sm text-black/60">
        Aucun vendeur configuré pour cet événement. Ajoute-en dans l&apos;espace{" "}
        <a href="/admin/evenements" className="underline">
          Admin
        </a>
        .
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {actifs.map((v) => (
        <button
          key={v.id}
          onClick={() => {
            setStoredVendeur(v.nom);
            onPick(v.nom);
          }}
          className="rounded-xl border border-black/10 bg-white px-4 py-6 text-lg font-semibold shadow-sm active:scale-95"
        >
          {v.nom}
        </button>
      ))}
    </div>
  );
}
