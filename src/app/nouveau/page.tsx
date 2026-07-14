"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useActiveEvent, useCatalogue, useStock } from "@/lib/hooks";
import { getStoredVendeur } from "@/lib/currentVendeur";
import { getTicketQueue, type TicketResult } from "@/lib/offlineQueue";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ProductAutocomplete } from "@/components/ProductAutocomplete";
import { TicketLinesEditor } from "@/components/TicketLinesEditor";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { EventCodeGate } from "@/components/EventCodeGate";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import type { CatalogueItem, DraftLine, EventRow, PaymentMethod, TicketWithItems } from "@/lib/types";

function NouveauTicketContent() {
  const { event, loading: eventLoading } = useActiveEvent();
  const [vendeur, setVendeur] = useState<string | null>(null);

  useEffect(() => {
    setVendeur(getStoredVendeur());
  }, []);

  if (eventLoading) return <p className="p-6 text-center text-black/50">Chargement…</p>;

  if (!event) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-center">
        <p className="font-semibold">Aucun événement actif.</p>
        <Link href="/admin/evenements" className="underline">
          Configurer un événement
        </Link>
      </div>
    );
  }

  if (!vendeur) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-center">
        <p className="font-semibold">Choisis d&apos;abord ton nom.</p>
        <Link href="/" className="inline-block rounded-lg bg-brand px-5 py-3 font-semibold text-white">
          Choisir un vendeur
        </Link>
      </div>
    );
  }

  // Catalogue et tickets ne sont chargés qu'une fois le code d'accès validé
  // (voir EventCodeGate) — pas de données de vente/tarifs avant déverrouillage.
  return (
    <EventCodeGate eventId={event.id}>
      <NouveauTicketForm event={event} vendeur={vendeur} />
    </EventCodeGate>
  );
}

function NouveauTicketForm({ event, vendeur }: { event: EventRow; vendeur: string }) {
  const { items: catalogue } = useCatalogue(event.id);
  const { stock } = useStock(event.id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const correctId = searchParams.get("correct");

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [mode, setMode] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLocalId, setPendingLocalId] = useState<string | null>(null);
  const [result, setResult] = useState<TicketResult | null>(null);
  const [correctingSource, setCorrectingSource] = useState<TicketWithItems | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!correctId) return;
    supabaseBrowser
      .from("tickets")
      .select("*, ticket_items(*)")
      .eq("id", correctId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const ticket = data as TicketWithItems;
        setCorrectingSource(ticket);
        setMode(ticket.mode_paiement);
        setLines(
          ticket.ticket_items.map((item) => ({
            key: crypto.randomUUID(),
            reference: item.reference,
            designation: item.designation,
            prix_unitaire: Number(item.prix_unitaire),
            // On repart du prix facturé comme référence : la trace de la
            // modification d'origine reste dans le ticket annulé (audit).
            prix_catalogue: Number(item.prix_unitaire),
            pvp_ttc: item.pvp_ttc === null ? null : Number(item.pvp_ttc),
            quantite: item.quantite,
          }))
        );
      });
  }, [correctId]);

  useEffect(() => {
    if (!pendingLocalId) return;
    const queue = getTicketQueue();
    return queue.onResolved((localId, res) => {
      if (localId === pendingLocalId) {
        setResult(res);
        setPendingLocalId(null);
        toast.success("Ticket enregistré (envoi différé)");
      }
    });
  }, [pendingLocalId]);

  const total = lines.reduce((sum, l) => sum + l.prix_unitaire * l.quantite, 0);

  function addItem(item: CatalogueItem) {
    setLines((prev) => {
      const existing = prev.find((l) => l.reference === item.reference);
      if (existing) {
        return prev.map((l) => (l.reference === item.reference ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          reference: item.reference,
          designation: item.designation,
          prix_unitaire: Number(item.prix_ttc),
          prix_catalogue: Number(item.prix_ttc),
          pvp_ttc: item.pvp_ttc === null ? null : Number(item.pvp_ttc),
          quantite: 1,
        },
      ];
    });
  }

  function changeQuantite(key: string, quantite: number) {
    setLines((prev) => {
      if (quantite <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantite } : l));
    });
  }

  function changePrice(key: string, prix: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, prix_unitaire: prix } : l)));
  }

  function handleScan(code: string) {
    setScanning(false);
    const digits = code.replace(/\D/g, "");
    const item = catalogue.find((c) => c.code_barre && c.code_barre === digits);
    if (item) {
      addItem(item);
      toast.success(`${item.designation} ajouté`);
    } else {
      toast.error(`Code-barres non reconnu (${digits}). Cherche le produit manuellement.`);
    }
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function resetForm() {
    setLines([]);
    setMode(null);
    setResult(null);
    setPendingLocalId(null);
    setCorrectingSource(null);
    router.replace("/nouveau");
  }

  async function handleSubmit() {
    if (!mode || lines.length === 0) return;
    setSubmitting(true);

    const payload = {
      event_id: event.id,
      vendeur,
      mode_paiement: mode,
      items: lines.map((l) => ({
        reference: l.reference,
        designation: l.designation,
        prix_unitaire: l.prix_unitaire,
        pvp_ttc: l.pvp_ttc,
        prix_modifie: Math.abs(l.prix_unitaire - l.prix_catalogue) > 0.001,
        quantite: l.quantite,
      })),
    };

    if (correctingSource) {
      try {
        const res = await fetch(`/api/tickets/${correctingSource.id}/correct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, by: vendeur }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Échec de la correction");
        setResult(body);
        toast.success("Ticket corrigé");
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const outcome = await getTicketQueue().submit(payload);
    setSubmitting(false);

    if (outcome.status === "ok") {
      setResult(outcome.result);
    } else if (outcome.status === "queued") {
      setPendingLocalId(outcome.localId);
      toast.info("Réseau instable : ticket mis en attente, envoi automatique en cours…");
    } else {
      toast.error(outcome.message);
    }
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-black/50">Ticket validé</p>
        <p className="text-7xl font-black text-brand">N° {result.numero}</p>
        <p className="text-4xl font-bold">{Number(result.total_ttc).toFixed(2)} €</p>
        <p className="text-sm text-black/50">
          Note ce numéro au dos du reçu CB si besoin. Vendeur : {vendeur}
        </p>
        <button
          onClick={resetForm}
          className="w-full rounded-lg bg-brand-dark py-3.5 text-lg font-semibold text-white"
        >
          Nouveau ticket
        </button>
      </div>
    );
  }

  if (pendingLocalId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
        <p className="text-2xl font-bold">Envoi en cours…</p>
        <p className="text-sm text-black/60">
          Le réseau est instable. Le ticket est enregistré sur ce téléphone et sera transmis automatiquement dès
          que la connexion revient. Ne ferme pas cette page.
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      {correctingSource && (
        <div className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Correction du ticket n° {correctingSource.numero}. L&apos;original sera annulé et remplacé par ce
          nouveau ticket.
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <ProductAutocomplete items={catalogue} stock={stock} onSelect={addItem} />
        </div>
        <button
          type="button"
          onClick={() => setScanning(true)}
          aria-label="Scanner un code-barre"
          className="shrink-0 rounded-lg border border-black/15 bg-white px-4 text-2xl"
        >
          📷
        </button>
      </div>

      {scanning && <BarcodeScanner onDetected={handleScan} onClose={() => setScanning(false)} />}

      <TicketLinesEditor
        lines={lines}
        onChangeQuantite={changeQuantite}
        onChangePrice={changePrice}
        onRemove={removeLine}
      />

      <div className="flex items-center justify-between rounded-lg bg-brand-dark px-4 py-3 text-white">
        <span className="font-medium">Total</span>
        <span className="text-2xl font-bold">{total.toFixed(2)} €</span>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-black/60">Mode de paiement</p>
        <PaymentMethodPicker value={mode} onChange={setMode} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={lines.length === 0 || !mode || submitting}
        className="w-full rounded-lg bg-brand py-4 text-lg font-bold text-white disabled:opacity-40"
      >
        {submitting ? "Validation…" : correctingSource ? "Valider la correction" : "Valider le ticket"}
      </button>
    </div>
  );
}

export default function NouveauTicketPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-black/50">Chargement…</p>}>
      <NouveauTicketContent />
    </Suspense>
  );
}
