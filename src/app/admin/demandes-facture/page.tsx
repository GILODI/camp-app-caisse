"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatDateFR, formatDateTimeFR } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/types";
import type { DemandeFacture, EventRow, PaymentMethod } from "@/lib/types";

const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

interface DemandeRow extends DemandeFacture {
  tickets:
    | { numero: number; vente_date: string; mode_paiement: PaymentMethod; total_ttc: number }
    | { numero: number; vente_date: string; mode_paiement: PaymentMethod; total_ttc: number }[]
    | null;
}

export default function AdminDemandesFacturePage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [demandes, setDemandes] = useState<DemandeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabaseBrowser
      .from("events")
      .select("id,nom,is_active,created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEvents(data ?? []);
        const active = data?.find((e) => e.is_active);
        if (active) setEventId(active.id);
        else if (data && data.length > 0) setEventId(data[0].id);
      });
  }, []);

  const load = useCallback(async () => {
    if (!eventId) {
      setDemandes([]);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/demandes-facture?event_id=${eventId}`);
    const body = await res.json();
    setDemandes(res.ok ? (body as DemandeRow[]) : []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? demandes.filter(
        (d) => d.client_nom.toLowerCase().includes(q) || d.client_prenom.toLowerCase().includes(q)
      )
    : demandes;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold">Demandes de facture</h1>
        <p className="text-sm text-black/50">
          {filtered.length} demande{filtered.length > 1 ? "s" : ""} — à ressaisir individuellement dans le système
          comptable. Voir aussi la feuille dédiée dans l&apos;export Excel (jour ou archive complète).
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-black/50">Événement</span>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3 py-2"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nom}
              </option>
            ))}
          </select>
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom ou prénom…"
          className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="py-10 text-center text-black/40">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-black/40">Aucune demande de facture pour cet événement.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((d) => {
            const ticket = Array.isArray(d.tickets) ? d.tickets[0] : d.tickets;
            return (
              <li key={d.id} className="rounded-lg border border-black/10 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {d.client_prenom} {d.client_nom}
                    </p>
                    <p className="text-xs text-black/50">
                      {d.client_adresse} · {d.client_telephone} · {d.client_email}
                      {d.client_siret && <> · SIRET {d.client_siret}</>}
                    </p>
                    <p className="mt-1 text-xs text-black/50">
                      Demande le {formatDateTimeFR(d.created_at)}
                      {ticket && (
                        <>
                          {" "}
                          · Ticket n° {ticket.numero} ({formatDateFR(ticket.vente_date)}) —{" "}
                          {labelByMethod.get(ticket.mode_paiement) ?? ticket.mode_paiement}
                        </>
                      )}
                    </p>
                  </div>
                  {ticket && <p className="shrink-0 text-lg font-bold">{Number(ticket.total_ttc).toFixed(2)} €</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
