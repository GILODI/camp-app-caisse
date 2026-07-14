"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatDateFR, formatDateTimeFR } from "@/lib/date";
import type { EventRow, Facture } from "@/lib/types";

interface FactureRow extends Facture {
  tickets: { numero: number; vente_date: string } | { numero: number; vente_date: string }[] | null;
}

export default function AdminFacturesPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [factures, setFactures] = useState<FactureRow[]>([]);
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
      setFactures([]);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/factures?event_id=${eventId}`);
    const body = await res.json();
    setFactures(res.ok ? (body as FactureRow[]) : []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? factures.filter(
        (f) => f.client_nom.toLowerCase().includes(q) || f.numero_affiche.toLowerCase().includes(q)
      )
    : factures;

  const totalTTC = filtered.reduce((sum, f) => sum + Number(f.total_ttc), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold">Factures émises</h1>
        <p className="text-sm text-black/50">
          {filtered.length} facture{filtered.length > 1 ? "s" : ""} · {totalTTC.toFixed(2)} € TTC
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
          placeholder="Filtrer par client ou n° facture…"
          className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="py-10 text-center text-black/40">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-black/40">Aucune facture émise pour cet événement.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((f) => {
            const ticket = Array.isArray(f.tickets) ? f.tickets[0] : f.tickets;
            return (
              <li key={f.id} className="rounded-lg border border-black/10 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{f.numero_affiche}</p>
                    <p className="truncate text-xs text-black/50">
                      {f.client_nom} · {formatDateTimeFR(f.created_at)}
                      {ticket && (
                        <>
                          {" "}
                          · Ticket n° {ticket.numero} ({formatDateFR(ticket.vente_date)})
                        </>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold">{Number(f.total_ttc).toFixed(2)} €</p>
                </div>
                <a
                  href={`/api/factures/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
                >
                  Télécharger le PDF
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
