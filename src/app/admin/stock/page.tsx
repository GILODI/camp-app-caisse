"use client";

import { useMemo, useState } from "react";
import { useActiveEvent, useStock } from "@/lib/hooks";

type SortKey = "restant" | "designation";

export default function StockPage() {
  const { event, loading: eventLoading } = useActiveEvent();
  const { stock, loading } = useStock(event?.id);
  const [sortKey, setSortKey] = useState<SortKey>("restant");
  const [query, setQuery] = useState("");

  const lines = useMemo(() => {
    const all = Array.from(stock.values());
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (l) => l.reference.toLowerCase().includes(q) || l.designation.toLowerCase().includes(q)
        )
      : all;
    return filtered.sort((a, b) =>
      sortKey === "restant" ? a.restant - b.restant : a.designation.localeCompare(b.designation)
    );
  }, [stock, sortKey, query]);

  if (eventLoading || loading) return <p className="p-6 text-center text-black/50">Chargement…</p>;

  if (!event) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Aucun événement actif.</p>
      </div>
    );
  }

  if (stock.size === 0) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-center">
        <h1 className="text-lg font-bold">État du stock</h1>
        <p className="text-sm text-black/60">
          Aucun produit suivi en stock. Importe un catalogue avec une colonne « Stock initial »
          (Admin → Catalogue) pour activer le suivi.
        </p>
      </div>
    );
  }

  const ruptures = lines.filter((l) => l.restant <= 0).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold">État du stock — {event.nom}</h1>
        <p className="text-sm text-black/50">
          {stock.size} produit(s) suivi(s){ruptures > 0 && <span className="text-red-600"> · {ruptures} en rupture</span>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer un produit…"
          className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm"
        >
          <option value="restant">Trier par stock restant</option>
          <option value="designation">Trier par nom</option>
        </select>
        <a
          href={`/api/stock/export?event_id=${event.id}`}
          className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium"
        >
          Export Excel
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-black/5 text-left">
              <th className="px-3 py-2 font-medium">Produit</th>
              <th className="px-3 py-2 text-right font-medium">Initial</th>
              <th className="px-3 py-2 text-right font-medium">Vendu</th>
              <th className="px-3 py-2 text-right font-medium">Vol/dot./casse</th>
              <th className="px-3 py-2 text-right font-medium">Restant</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.reference} className="border-b border-black/5 last:border-0">
                <td className="px-3 py-2">
                  <span className="block font-medium">{l.designation}</span>
                  <span className="block text-xs text-black/50">{l.reference}</span>
                </td>
                <td className="px-3 py-2 text-right">{l.stock_initial}</td>
                <td className="px-3 py-2 text-right">{l.vendu}</td>
                <td className="px-3 py-2 text-right">{l.mouvements || "—"}</td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    l.restant <= 0 ? "text-red-600" : l.restant <= 3 ? "text-amber-600" : ""
                  }`}
                >
                  {l.restant}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
