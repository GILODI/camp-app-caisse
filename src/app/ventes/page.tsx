"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useActiveEvent, useTodaySales } from "@/lib/hooks";
import { getStoredVendeur } from "@/lib/currentVendeur";
import { SalesList } from "@/components/SalesList";
import { formatDateFR } from "@/lib/date";

export default function VentesDuJourPage() {
  const { event, loading: eventLoading } = useActiveEvent();
  const { tickets, loading, venteDate } = useTodaySales(event?.id);
  const [vendeur, setVendeur] = useState<string | null>(null);

  useEffect(() => {
    setVendeur(getStoredVendeur());
  }, []);

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

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Ventes du {formatDateFR(venteDate)}</h1>
          <p className="text-sm text-black/50">
            {valides.length} ticket{valides.length > 1 ? "s" : ""} validé{valides.length > 1 ? "s" : ""} ·{" "}
            {totalCA.toFixed(2)} €
          </p>
        </div>
        <a
          href={`/api/export?event_id=${event.id}&date=${venteDate}`}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium"
        >
          Exporter
        </a>
      </div>

      <SalesList tickets={tickets} currentVendeur={vendeur ?? "Inconnu"} />

      <p className="pt-2 text-center text-xs text-black/30">
        <Link href="/nouveau" className="underline">
          Ajouter un ticket
        </Link>
      </p>
    </div>
  );
}
