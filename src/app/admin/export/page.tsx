"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { todayParisISO } from "@/lib/date";
import type { EventRow } from "@/lib/types";

export default function ExportPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [date, setDate] = useState(todayParisISO());

  useEffect(() => {
    supabaseBrowser
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEvents(data ?? []);
        const active = data?.find((e) => e.is_active);
        if (active) setEventId(active.id);
        else if (data && data.length > 0) setEventId(data[0].id);
      });
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold">Export fin de journée</h1>
      <p className="text-sm text-black/60">
        Génère le fichier Excel (synthèse par mode de paiement, statistiques, détail par ticket) pour une journée
        donnée.
      </p>

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
          <span className="mb-1 block text-xs font-medium text-black/50">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>

        <a
          href={eventId ? `/api/export?event_id=${eventId}&date=${date}` : undefined}
          className={`block w-full rounded-lg py-3 text-center font-semibold text-white ${
            eventId ? "bg-brand" : "pointer-events-none bg-black/20"
          }`}
        >
          Télécharger le fichier Excel
        </a>
      </div>

      <div className="space-y-2 rounded-xl border border-black/10 bg-white p-4">
        <p className="text-sm font-medium">Archive complète de l&apos;événement</p>
        <p className="text-xs text-black/50">
          Un seul fichier : synthèse globale (toutes dates), détail de toutes les ventes, état du stock, mouvements
          et caisse espèces. À télécharger une fois l&apos;événement terminé.
        </p>
        <a
          href={eventId ? `/api/export/archive?event_id=${eventId}` : undefined}
          className={`block w-full rounded-lg border py-3 text-center font-semibold ${
            eventId ? "border-brand text-brand" : "pointer-events-none border-black/10 text-black/30"
          }`}
        >
          Télécharger l&apos;archive complète
        </a>
      </div>
    </div>
  );
}
