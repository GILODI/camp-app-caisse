"use client";

import { useState } from "react";
import type { DraftLine } from "@/lib/types";

export function TicketLinesEditor({
  lines,
  onChangeQuantite,
  onChangePrice,
  onRemove,
}: {
  lines: DraftLine[];
  onChangeQuantite: (key: string, quantite: number) => void;
  onChangePrice: (key: string, prix: number) => void;
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
            <PriceCell line={line} onChangePrice={onChangePrice} />
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

function PriceCell({ line, onChangePrice }: { line: DraftLine; onChangePrice: (key: string, prix: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const modifie = Math.abs(line.prix_unitaire - line.prix_catalogue) > 0.001;

  function commit() {
    const normalized = draft.replace(",", ".");
    const value = Number(normalized);
    if (Number.isFinite(value) && value >= 0) {
      onChangePrice(line.key, Math.round(value * 100) / 100);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-0.5 flex items-center gap-1 text-xs">
        <span className="text-black/50">{line.reference} ·</span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          defaultValue={line.prix_unitaire.toFixed(2)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-16 rounded border border-brand px-1 py-0.5 text-right"
        />
        <span className="text-black/50">€ / unité</span>
      </div>
    );
  }

  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-black/50">
      <span>{line.reference} ·</span>
      <button
        type="button"
        onClick={() => {
          setDraft(line.prix_unitaire.toFixed(2));
          setEditing(true);
        }}
        className="inline-flex items-center gap-1 underline decoration-dotted"
      >
        {modifie ? (
          <>
            <span className="line-through">{line.prix_catalogue.toFixed(2)} €</span>
            <span className="font-semibold text-brand">{line.prix_unitaire.toFixed(2)} €</span>
          </>
        ) : (
          <span>{line.prix_unitaire.toFixed(2)} € / unité</span>
        )}
        <span aria-hidden>✏️</span>
      </button>
      {modifie && (
        <button
          type="button"
          onClick={() => onChangePrice(line.key, line.prix_catalogue)}
          className="text-black/40 underline"
        >
          prix normal
        </button>
      )}
    </p>
  );
}
