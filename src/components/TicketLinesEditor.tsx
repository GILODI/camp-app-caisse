"use client";

import type { DraftLine } from "@/lib/types";

export function TicketLinesEditor({
  lines,
  onChangeQuantite,
  onRemove,
}: {
  lines: DraftLine[];
  onChangeQuantite: (key: string, quantite: number) => void;
  onRemove: (key: string) => void;
}) {
  if (lines.length === 0) {
    return <p className="py-6 text-center text-sm text-black/40">Aucune ligne pour l&apos;instant.</p>;
  }

  return (
    <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
      {lines.map((line) => (
        <li key={line.key} className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{line.designation}</p>
            <p className="text-xs text-black/50">
              {line.reference} · {line.prix_unitaire.toFixed(2)} € / unité
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Diminuer la quantité"
              onClick={() => onChangeQuantite(line.key, line.quantite - 1)}
              className="h-8 w-8 rounded-full border border-black/15 text-lg leading-none"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold">{line.quantite}</span>
            <button
              type="button"
              aria-label="Augmenter la quantité"
              onClick={() => onChangeQuantite(line.key, line.quantite + 1)}
              className="h-8 w-8 rounded-full border border-black/15 text-lg leading-none"
            >
              +
            </button>
          </div>
          <p className="w-16 shrink-0 text-right font-semibold">
            {(line.prix_unitaire * line.quantite).toFixed(2)} €
          </p>
          <button
            type="button"
            aria-label="Supprimer la ligne"
            onClick={() => onRemove(line.key)}
            className="shrink-0 text-black/30"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
