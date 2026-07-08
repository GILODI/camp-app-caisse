"use client";

import { useMemo, useState } from "react";
import type { CatalogueItem } from "@/lib/types";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
}

export function ProductAutocomplete({
  items,
  onSelect,
}: {
  items: CatalogueItem[];
  onSelect: (item: CatalogueItem) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return items
      .filter((item) => normalize(item.reference).includes(q) || normalize(item.designation).includes(q))
      .slice(0, 8);
  }, [items, query]);

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un produit (référence ou désignation)…"
        className="w-full rounded-lg border border-black/15 px-4 py-3 text-base"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 active:bg-black/5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.designation}</span>
                  <span className="block text-xs text-black/50">{item.reference}</span>
                </span>
                <span className="shrink-0 font-semibold text-brand">{item.prix_ttc.toFixed(2)} €</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-black/10 bg-white p-3 text-sm text-black/50 shadow-lg">
          Aucun produit trouvé pour « {query} »
        </p>
      )}
    </div>
  );
}
