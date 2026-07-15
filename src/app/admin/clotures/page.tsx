"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatDateFR, formatDateTimeFR } from "@/lib/date";
import type { Cloture, EventRow } from "@/lib/types";

interface DayRow {
  date: string;
  nbTickets: number;
  total: number;
  cloture: Cloture | null;
}

export default function AdminCloturesPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [days, setDays] = useState<DayRow[]>([]);
  const [clotures, setClotures] = useState<Cloture[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingDay, setClosingDay] = useState<string | null>(null);
  const [closingEvent, setClosingEvent] = useState(false);
  const [by, setBy] = useState("");

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
      setDays([]);
      setClotures([]);
      return;
    }
    setLoading(true);
    const [{ data: tickets }, { data: clotureData }] = await Promise.all([
      supabaseBrowser.from("tickets").select("vente_date, total_ttc, statut").eq("event_id", eventId),
      supabaseBrowser
        .from("clotures")
        .select("*")
        .eq("event_id", eventId)
        .order("closed_at", { ascending: false }),
    ]);

    const byDate = new Map<string, { nbTickets: number; total: number }>();
    for (const t of tickets ?? []) {
      const cur = byDate.get(t.vente_date) ?? { nbTickets: 0, total: 0 };
      cur.nbTickets += 1;
      if (t.statut === "VALIDE") cur.total += Number(t.total_ttc);
      byDate.set(t.vente_date, cur);
    }

    const clos = (clotureData ?? []) as Cloture[];
    const clotureByDate = new Map(clos.filter((c) => c.type === "jour").map((c) => [c.periode as string, c]));

    const rows: DayRow[] = Array.from(byDate.entries())
      .map(([date, stats]) => ({ date, ...stats, cloture: clotureByDate.get(date) ?? null }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    setDays(rows);
    setClotures(clos);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function closeDay(date: string) {
    if (!by.trim()) {
      toast.error("Indique ton nom avant de clôturer");
      return;
    }
    setClosingDay(date);
    try {
      const res = await fetch(`/api/events/${eventId}/close-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vente_date: date, by: by.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      toast.success(`Journée du ${formatDateFR(date)} clôturée`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setClosingDay(null);
    }
  }

  async function closeEvent() {
    if (!by.trim()) {
      toast.error("Indique ton nom avant de clôturer");
      return;
    }
    setClosingEvent(true);
    try {
      const res = await fetch(`/api/events/${eventId}/close-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: by.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      toast.success("Événement clôturé");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setClosingEvent(false);
    }
  }

  const eventCloture = clotures.find((c) => c.type === "evenement") ?? null;
  const allDaysClosed = days.length > 0 && days.every((d) => d.cloture !== null);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold">Clôtures</h1>
        <p className="text-sm text-black/60">
          Fige définitivement les ventes d&apos;une journée (ou de tout l&apos;événement) : plus aucune création,
          correction ou annulation de ticket n&apos;est ensuite possible sur la période clôturée. Chaque clôture
          porte une empreinte de contrôle (SHA-256) — toute modification ultérieure des données sous-jacentes la
          rendrait invérifiable.
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
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-black/50">Clôturé par (ton nom)</span>
          <input
            value={by}
            onChange={(e) => setBy(e.target.value)}
            placeholder="Ton nom"
            className="w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>
      </div>

      {loading ? (
        <p className="py-10 text-center text-black/40">Chargement…</p>
      ) : days.length === 0 ? (
        <p className="py-10 text-center text-black/40">Aucune vente pour cet événement.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/5 text-left">
                <th className="px-3 py-2 font-medium">Jour</th>
                <th className="px-3 py-2 text-right font-medium">Tickets</th>
                <th className="px-3 py-2 text-right font-medium">Total TTC</th>
                <th className="px-3 py-2 text-right font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2">{formatDateFR(d.date)}</td>
                  <td className="px-3 py-2 text-right">{d.nbTickets}</td>
                  <td className="px-3 py-2 text-right">{d.total.toFixed(2)} €</td>
                  <td className="px-3 py-2 text-right">
                    {d.cloture ? (
                      <span className="text-xs font-semibold text-green-700">🔒 Clôturé</span>
                    ) : (
                      <button
                        onClick={() => closeDay(d.date)}
                        disabled={closingDay === d.date}
                        className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                      >
                        {closingDay === d.date ? "Clôture…" : "Clôturer"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-black/10 bg-white p-4">
        <p className="text-sm font-medium">Clôture de l&apos;événement</p>
        {eventCloture ? (
          <p className="mt-1 text-sm text-green-700">
            🔒 Clôturé le {formatDateTimeFR(eventCloture.closed_at)} par {eventCloture.closed_by} —{" "}
            {eventCloture.nb_tickets} ticket(s), {Number(eventCloture.total_ttc).toFixed(2)} € TTC
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-black/50">
              {allDaysClosed
                ? "Tous les jours de vente sont clôturés — tu peux clôturer l'événement."
                : "Clôture d'abord chaque jour de vente ci-dessus."}
            </p>
            <button
              onClick={closeEvent}
              disabled={!allDaysClosed || closingEvent}
              className="mt-2 rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {closingEvent ? "Clôture…" : "Clôturer l'événement"}
            </button>
          </>
        )}
      </div>

      {clotures.length > 0 && (
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <p className="mb-2 text-sm font-medium">Registre des clôtures (preuve consultable)</p>
          <ul className="space-y-2 text-xs text-black/60">
            {clotures.map((c) => (
              <li key={c.id} className="rounded-lg border border-black/10 p-2">
                <p className="font-medium text-black">
                  {c.type === "jour" ? `Jour ${formatDateFR(c.periode!)}` : "Événement entier"} — {c.nb_tickets}{" "}
                  ticket(s), {Number(c.total_ttc).toFixed(2)} € TTC
                </p>
                <p>
                  Clôturé le {formatDateTimeFR(c.closed_at)} par {c.closed_by ?? "—"}
                </p>
                <p className="break-all font-mono">Empreinte : {c.hash}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
