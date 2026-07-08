"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { todayParisISO, formatDateFR } from "@/lib/date";
import { getStoredVendeur } from "@/lib/currentVendeur";
import { computeCaisseRows } from "@/lib/caisseCalc";
import {
  DENOMINATIONS,
  type CaisseComptage,
  type DenominationCounts,
  type DenominationKey,
} from "@/lib/types";

function emptyCounts(): DenominationCounts {
  const counts = {} as DenominationCounts;
  for (const d of DENOMINATIONS) counts[d.key] = 0;
  return counts;
}

function countsFromComptage(c: CaisseComptage): DenominationCounts {
  const counts = {} as DenominationCounts;
  for (const d of DENOMINATIONS) counts[d.key] = c[d.key];
  return counts;
}

function computeTotal(counts: DenominationCounts): number {
  return DENOMINATIONS.reduce((sum, d) => sum + (counts[d.key] || 0) * d.valeur, 0);
}

const EPSILON = 0.01;

export default function CaissePage() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventNom, setEventNom] = useState("");
  const [loading, setLoading] = useState(true);
  const [comptages, setComptages] = useState<CaisseComptage[]>([]);
  const [especesParJour, setEspecesParJour] = useState<Record<string, number>>({});

  const [formOpenType, setFormOpenType] = useState<"initial" | "jour" | null>(null);
  const [formDate, setFormDate] = useState(todayParisISO());
  const [formCounts, setFormCounts] = useState<DenominationCounts>(emptyCounts());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: ev } = await supabaseBrowser
      .from("events")
      .select("id,nom")
      .eq("is_active", true)
      .maybeSingle();

    if (!ev) {
      setEventId(null);
      setLoading(false);
      return;
    }
    setEventId(ev.id);
    setEventNom(ev.nom);

    const [{ data: comptagesData }, { data: ticketsData }] = await Promise.all([
      supabaseBrowser.from("caisse_comptages").select("*").eq("event_id", ev.id),
      supabaseBrowser
        .from("tickets")
        .select("vente_date, total_ttc")
        .eq("event_id", ev.id)
        .eq("mode_paiement", "ESPECES")
        .eq("statut", "VALIDE"),
    ]);

    setComptages((comptagesData ?? []) as CaisseComptage[]);

    const totals: Record<string, number> = {};
    for (const t of ticketsData ?? []) {
      totals[t.vente_date] = (totals[t.vente_date] ?? 0) + Number(t.total_ttc);
    }
    setEspecesParJour(totals);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const initialComptage = comptages.find((c) => c.type === "initial") ?? null;

  const rows = useMemo(() => computeCaisseRows(comptages, especesParJour), [comptages, especesParJour]);

  const totalRecette = rows.reduce((s, r) => s + (r.recette ?? 0), 0);
  const totalEspeces = rows.reduce((s, r) => s + (r.especes ?? 0), 0);
  const totalEcart = rows.reduce((s, r) => s + (r.ecart ?? 0), 0);

  function openForm(type: "initial" | "jour", date?: string) {
    if (type === "initial") {
      setFormCounts(initialComptage ? countsFromComptage(initialComptage) : emptyCounts());
    } else {
      const existing = comptages.find((c) => c.type === "jour" && c.comptage_date === date);
      setFormDate(date ?? todayParisISO());
      setFormCounts(existing ? countsFromComptage(existing) : emptyCounts());
    }
    setFormOpenType(type);
  }

  async function saveForm() {
    if (!eventId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/caisse/comptage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          type: formOpenType,
          comptage_date: formOpenType === "jour" ? formDate : null,
          counts: formCounts,
          by: getStoredVendeur() ?? "Admin",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setFormOpenType(null);
      await load();
      toast.success("Comptage enregistré");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-center text-black/50">Chargement…</p>;

  if (!eventId) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Aucun événement actif.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-lg font-bold">Caisse espèces — {eventNom}</h1>
        <p className="text-sm text-black/60">
          Comptage physique de la caisse, comparé automatiquement aux ventes espèces enregistrées.
        </p>
      </div>

      {formOpenType ? (
        <ComptageForm
          title={formOpenType === "initial" ? "Fond de caisse initial" : `Comptage du ${formatDateFR(formDate)}`}
          date={formDate}
          onDateChange={setFormDate}
          showDatePicker={formOpenType === "jour"}
          counts={formCounts}
          onChange={setFormCounts}
          onCancel={() => setFormOpenType(null)}
          onSave={saveForm}
          saving={saving}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openForm("initial")}
            className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium"
          >
            {initialComptage ? "Modifier le fond initial" : "Compter le fond initial"}
          </button>
          <button
            onClick={() => openForm("jour", todayParisISO())}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Compter la caisse de ce soir
          </button>
          {rows.length > 0 && (
            <a
              href={`/api/caisse/export?event_id=${eventId}`}
              className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium"
            >
              Télécharger le récap Excel
            </a>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/5 text-left">
                <th className="px-3 py-2 font-medium">Comptage</th>
                <th className="px-3 py-2 text-right font-medium">Total compté</th>
                <th className="px-3 py-2 text-right font-medium">Recette du jour</th>
                <th className="px-3 py-2 text-right font-medium">Espèces déclarées</th>
                <th className="px-3 py-2 text-right font-medium">Écart</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right">{r.total.toFixed(2)} €</td>
                  <td className="px-3 py-2 text-right">{r.recette !== null ? `${r.recette.toFixed(2)} €` : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.especes !== null ? `${r.especes.toFixed(2)} €` : "—"}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      r.ecart !== null && Math.abs(r.ecart) > EPSILON ? "text-red-600" : ""
                    }`}
                  >
                    {r.ecart !== null ? `${r.ecart.toFixed(2)} €` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.key !== "initial" ? (
                      <button onClick={() => openForm("jour", r.key)} className="text-xs underline">
                        Modifier
                      </button>
                    ) : (
                      <button onClick={() => openForm("initial")} className="text-xs underline">
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-black/5 font-semibold">
                <td className="px-3 py-2">TOTAL ÉVÉNEMENT</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right">{totalRecette.toFixed(2)} €</td>
                <td className="px-3 py-2 text-right">{totalEspeces.toFixed(2)} €</td>
                <td className={`px-3 py-2 text-right ${Math.abs(totalEcart) > EPSILON ? "text-red-600" : ""}`}>
                  {totalEcart.toFixed(2)} €
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-black/40">
        Une case «&nbsp;Écart&nbsp;» proche de 0 confirme que le comptage physique correspond aux ventes espèces
        enregistrées dans l&apos;app. Un écart révèle une erreur de comptage ou de saisie à vérifier.
      </p>
    </div>
  );
}

function ComptageForm({
  title,
  date,
  onDateChange,
  showDatePicker,
  counts,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  title: string;
  date: string;
  onDateChange: (d: string) => void;
  showDatePicker: boolean;
  counts: DenominationCounts;
  onChange: (c: DenominationCounts) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  function setCount(key: DenominationKey, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    onChange({ ...counts, [key]: n });
  }

  const total = computeTotal(counts);
  const billets = DENOMINATIONS.filter((d) => d.key.startsWith("nb_billets"));
  const pieces = DENOMINATIONS.filter((d) => d.key.startsWith("nb_pieces"));

  return (
    <div className="space-y-4 rounded-xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {showDatePicker && (
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-black/40">Billets</p>
          {billets.map((d) => (
            <DenominationRow key={d.key} label={d.label} value={counts[d.key]} onChange={(v) => setCount(d.key, v)} />
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-black/40">Pièces</p>
          {pieces.map((d) => (
            <DenominationRow key={d.key} label={d.label} value={counts[d.key]} onChange={(v) => setCount(d.key, v)} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-brand-dark px-4 py-3 text-white">
        <span className="font-medium">Total compté</span>
        <span className="text-xl font-bold">{total.toFixed(2)} €</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-black/15 py-2.5 text-sm font-medium"
        >
          Annuler
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function DenominationRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-black/70">{label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className="w-16 rounded-lg border border-black/15 px-2 py-1 text-right"
      />
    </label>
  );
}
