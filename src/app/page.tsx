"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useActiveEvent } from "@/lib/hooks";
import { VendeurPicker } from "@/components/VendeurPicker";
import { getStoredVendeur } from "@/lib/currentVendeur";

export default function HomePage() {
  const { event, loading } = useActiveEvent();
  const router = useRouter();
  const [vendeur, setVendeur] = useState<string | null>(null);

  useEffect(() => {
    setVendeur(getStoredVendeur());
  }, []);

  if (loading) {
    return <p className="p-6 text-center text-black/50">Chargement…</p>;
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-center">
        <h1 className="text-xl font-bold">Aucun événement actif</h1>
        <p className="text-sm text-black/60">
          Configure un événement (nom, vendeurs, catalogue) dans l&apos;espace Admin avant de commencer la vente.
        </p>
        <Link
          href="/admin/evenements"
          className="inline-block rounded-lg bg-brand px-5 py-3 font-semibold text-white"
        >
          Aller dans Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">{event.nom}</h1>
        <p className="text-sm text-black/60">Choisis ton nom pour commencer la vente.</p>
      </div>

      <VendeurPicker eventId={event.id} onPick={() => router.push("/nouveau")} />

      {vendeur && (
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <p className="text-sm text-black/60">
            Actuellement connecté en tant que <span className="font-semibold text-foreground">{vendeur}</span>
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/nouveau" className="flex-1 rounded-lg bg-brand py-2.5 text-center font-semibold text-white">
              Nouveau ticket
            </Link>
            <Link
              href="/ventes"
              className="flex-1 rounded-lg border border-black/10 py-2.5 text-center font-semibold"
            >
              Ventes du jour
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
