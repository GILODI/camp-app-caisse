"use client";

import { useActiveEvent, useTodaySales } from "@/lib/hooks";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";
import { formatDateFR } from "@/lib/date";

export default function DashboardPage() {
  const { event, loading: eventLoading } = useActiveEvent();
  const { tickets, loading, venteDate } = useTodaySales(event?.id);

  if (eventLoading || loading) return <p className="p-6 text-center text-black/50">Chargement…</p>;

  if (!event) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Aucun événement actif.</p>
      </div>
    );
  }

  const valides = tickets.filter((t) => t.statut === "VALIDE");
  const totalCA = valides.reduce((sum, t) => sum + Number(t.total_ttc), 0);
  const panierMoyen = valides.length > 0 ? totalCA / valides.length : 0;

  const byMode = new Map<PaymentMethod, number>();
  for (const { value } of PAYMENT_METHODS) byMode.set(value, 0);
  for (const t of valides) byMode.set(t.mode_paiement, (byMode.get(t.mode_paiement) ?? 0) + Number(t.total_ttc));
  const maxMode = Math.max(1, ...Array.from(byMode.values()));

  const parProduit = new Map<string, { designation: string; quantite: number }>();
  for (const t of valides) {
    for (const item of t.ticket_items) {
      const cur = parProduit.get(item.reference) ?? { designation: item.designation, quantite: 0 };
      cur.quantite += item.quantite;
      parProduit.set(item.reference, cur);
    }
  }
  const topProduits = Array.from(parProduit.values())
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, 8);
  const maxProduit = Math.max(1, ...topProduits.map((p) => p.quantite));

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <div>
        <h1 className="text-lg font-bold">Tableau de bord — {formatDateFR(venteDate)}</h1>
        <p className="text-sm text-black/50">{event.nom} · mis à jour en direct</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Chiffre d'affaires" value={`${totalCA.toFixed(2)} €`} />
        <StatTile label="Tickets" value={String(valides.length)} />
        <StatTile label="Panier moyen" value={`${panierMoyen.toFixed(2)} €`} />
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4">
        <p className="mb-3 text-sm font-semibold">Répartition par mode de paiement</p>
        {valides.length === 0 ? (
          <p className="text-sm text-black/40">Aucune vente pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2.5">
            {PAYMENT_METHODS.map(({ value, label }) => {
              const montant = byMode.get(value) ?? 0;
              const pct = Math.round((montant / maxMode) * 100);
              return (
                <li key={value}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-black/60">{montant.toFixed(2)} €</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4">
        <p className="mb-3 text-sm font-semibold">Produits les plus vendus</p>
        {topProduits.length === 0 ? (
          <p className="text-sm text-black/40">Aucune vente pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2.5">
            {topProduits.map((p) => {
              const pct = Math.round((p.quantite / maxProduit) * 100);
              return (
                <li key={p.designation}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{p.designation}</span>
                    <span className="shrink-0 text-black/60">{p.quantite}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3 text-center">
      <p className="text-[13px] font-medium text-black/50">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
