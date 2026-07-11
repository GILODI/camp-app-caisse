"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useActiveEvent, useCatalogue, useStock } from "@/lib/hooks";
import { getStoredVendeur } from "@/lib/currentVendeur";
import { formatDateTimeFR } from "@/lib/date";
import { MOUVEMENT_TYPES, type CatalogueItem, type MouvementStock, type MouvementType } from "@/lib/types";
import { ProductAutocomplete } from "@/components/ProductAutocomplete";

const labelByType = new Map(MOUVEMENT_TYPES.map((t) => [t.value, t.label]));

export default function MouvementsPage() {
  const { event, loading: eventLoading } = useActiveEvent();
  const eventId = event?.id;
  const { items: catalogue } = useCatalogue(eventId);
  const { stock } = useStock(eventId);

  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const [type, setType] = useState<MouvementType>("DOTATION");
  const [quantite, setQuantite] = useState("1");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);

  const loadMouvements = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabaseBrowser
      .from("mouvements_stock")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setMouvements((data ?? []) as MouvementStock[]);
  }, [eventId]);

  useEffect(() => {
    loadMouvements();
  }, [loadMouvements]);

  async function save() {
    if (!event || !selected) return;
    const qte = Math.floor(Number(quantite));
    if (!Number.isFinite(qte) || qte <= 0) {
      toast.error("Quantité invalide");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/mouvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          reference: selected.reference,
          designation: selected.designation,
          type,
          quantite: qte,
          motif,
          by: getStoredVendeur() ?? "Admin",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setSelected(null);
      setQuantite("1");
      setMotif("");
      await loadMouvements();
      toast.success("Mouvement enregistré");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/mouvements?id=${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Échec de la suppression");
      await loadMouvements();
      toast.success("Mouvement supprimé");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (eventLoading) return <p className="p-6 text-center text-black/50">Chargement…</p>;

  if (!event) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Aucun événement actif.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-lg font-bold">Mouvements de stock — {event.nom}</h1>
        <p className="text-sm text-black/60">
          Sorties hors vente (dotation, vol, casse). Elles diminuent le stock restant sans compter comme
          chiffre d&apos;affaires.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-black/10 bg-black/5 px-3 py-2">
            <span>
              <span className="font-medium">{selected.designation}</span>{" "}
              <span className="text-xs text-black/50">{selected.reference}</span>
            </span>
            <button onClick={() => setSelected(null)} className="text-xs underline">
              changer
            </button>
          </div>
        ) : (
          <ProductAutocomplete items={catalogue} stock={stock} onSelect={setSelected} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-black/50">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MouvementType)}
              className="w-full rounded-lg border border-black/15 px-3 py-2"
            >
              {MOUVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-black/50">Quantité</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              className="w-full rounded-lg border border-black/15 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-black/50">Motif / bénéficiaire (optionnel)</span>
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex : dotation Kilian, casse transport…"
            className="w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <button
          onClick={save}
          disabled={saving || !selected}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Enregistrement…" : "Enregistrer le mouvement"}
        </button>
      </div>

      {mouvements.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/5 text-left">
                <th className="px-3 py-2 font-medium">Produit</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Qté</th>
                <th className="px-3 py-2 font-medium">Motif</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{m.designation}</span>
                    <span className="block text-xs text-black/50">
                      {m.reference} · {formatDateTimeFR(m.created_at)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{labelByType.get(m.type) ?? m.type}</td>
                  <td className="px-3 py-2 text-right">{m.quantite}</td>
                  <td className="px-3 py-2 text-black/60">{m.motif ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(m.id)} className="text-xs text-red-600 underline">
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
