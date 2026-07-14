"use client";

import { useState } from "react";

export function CashChangeCalculator({ total }: { total: number }) {
  const [recu, setRecu] = useState("");

  const montantRecu = recu.trim() === "" ? null : Number(recu.replace(",", "."));
  const valide = montantRecu !== null && Number.isFinite(montantRecu);
  const monnaie = valide ? montantRecu! - total : null;

  return (
    <div className="rounded-lg border border-black/15 bg-white p-3">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-black/50">Montant reçu (espèces)</span>
        <input
          type="text"
          inputMode="decimal"
          value={recu}
          onChange={(e) => setRecu(e.target.value)}
          placeholder={`${total.toFixed(2)} €`}
          className="w-full rounded-lg border border-black/15 px-3 py-2 text-lg"
        />
      </label>

      {valide && monnaie !== null && (
        monnaie >= 0 ? (
          <p className="mt-2 text-center text-lg font-bold text-brand">
            Monnaie à rendre : {monnaie.toFixed(2)} €
          </p>
        ) : (
          <p className="mt-2 text-center text-sm font-medium text-red-600">
            Montant insuffisant ({Math.abs(monnaie).toFixed(2)} € manquant)
          </p>
        )
      )}
    </div>
  );
}
