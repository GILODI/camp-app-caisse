"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCatalogue } from "@/lib/hooks";
import { todayParisISO, formatDateFR } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/types";
import type { CatalogueItem, DraftLine, EventRow, PaymentMethod, TicketWithItems } from "@/lib/types";
import { ProductAutocomplete } from "@/components/ProductAutocomplete";
import { TicketLinesEditor } from "@/components/TicketLinesEditor";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";

const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export default function AdminTicketsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [date, setDate] = useState(todayParisISO());
  const [tickets, setTickets] = useState<TicketWithItems[]>([]);
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState<TicketWithItems | null>(null);

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

  const loadTickets = useCallback(async () => {
    if (!eventId || !date) {
      setTickets([]);
      return;
    }
    setLoading(true);
    const { data } = await supabaseBrowser
      .from("tickets")
      .select("*, ticket_items(*)")
      .eq("event_id", eventId)
      .eq("vente_date", date)
      .eq("statut", "VALIDE")
      .order("numero", { ascending: false });
    setTickets((data ?? []) as TicketWithItems[]);
    setLoading(false);
  }, [eventId, date]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  if (correcting) {
    return (
      <CorrectTicketForm
        ticket={correcting}
        eventId={eventId}
        onDone={() => {
          setCorrecting(null);
          loadTickets();
        }}
        onCancel={() => setCorrecting(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold">Corriger un ticket passé</h1>
      <p className="text-sm text-black/60">
        Pour corriger un ticket d&apos;un jour qui n&apos;est plus « aujourd&apos;hui » (mode de paiement, prix,
        quantités erronés). Le ticket original est annulé (trace conservée) et remplacé par un nouveau ticket, avec
        un nouveau numéro, sur la même date de vente.
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
          <span className="mb-1 block text-xs font-medium text-black/50">Date de vente</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3 py-2"
          />
        </label>
      </div>

      {loading ? (
        <p className="py-10 text-center text-black/40">Chargement…</p>
      ) : tickets.length === 0 ? (
        <p className="py-10 text-center text-black/40">Aucun ticket validé pour le {formatDateFR(date)}.</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="rounded-lg border border-black/10 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">N° {ticket.numero}</p>
                  <p className="text-xs text-black/50">
                    {ticket.vendeur} · {labelByMethod.get(ticket.mode_paiement)}
                  </p>
                </div>
                <p className="text-lg font-bold">{Number(ticket.total_ttc).toFixed(2)} €</p>
              </div>
              <ul className="mt-1.5 text-xs text-black/60">
                {ticket.ticket_items.map((item) => (
                  <li key={item.id}>
                    {item.quantite} × {item.designation}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setCorrecting(ticket)}
                className="mt-2 rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
              >
                Corriger
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ticketToDraftLines(ticket: TicketWithItems): DraftLine[] {
  return ticket.ticket_items.map((item) => ({
    key: crypto.randomUUID(),
    reference: item.reference,
    designation: item.designation,
    prix_unitaire: Number(item.prix_unitaire),
    // On repart du prix facturé comme référence : la trace de la modification
    // d'origine reste dans le ticket annulé (audit).
    prix_catalogue: Number(item.prix_unitaire),
    pvp_ttc: item.pvp_ttc === null ? null : Number(item.pvp_ttc),
    quantite: item.quantite,
  }));
}

function CorrectTicketForm({
  ticket,
  eventId,
  onDone,
  onCancel,
}: {
  ticket: TicketWithItems;
  eventId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { items: catalogue } = useCatalogue(eventId);
  const [lines, setLines] = useState<DraftLine[]>(() => ticketToDraftLines(ticket));
  const [mode, setMode] = useState<PaymentMethod>(ticket.mode_paiement);
  const [by, setBy] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleSubmit() {
    if (!mode || lines.length === 0 || !by.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode_paiement: mode,
          by: by.trim(),
          items: lines.map((l) => ({
            reference: l.reference,
            designation: l.designation,
            prix_unitaire: l.prix_unitaire,
            pvp_ttc: l.pvp_ttc,
            prix_modifie: Math.abs(l.prix_unitaire - l.prix_catalogue) > 0.001,
            quantite: l.quantite,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Échec de la correction");
      toast.success(`Ticket corrigé : nouveau N° ${body.numero} (${formatDateFR(body.vente_date)})`);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Corriger le ticket N° {ticket.numero}</h1>
        <button type="button" onClick={onCancel} className="text-sm text-black/50 underline">
          Annuler
        </button>
      </div>
      <p className="text-xs text-black/50">
        Vente du {formatDateFR(ticket.vente_date)} · {ticket.vendeur}. Le ticket N° {ticket.numero} sera annulé
        (trace conservée) et remplacé par un nouveau ticket, même date.
      </p>

      <ProductAutocomplete items={catalogue} onSelect={addItem} />
      <TicketLinesEditor lines={lines} onChangeQuantite={changeQuantite} onChangePrice={changePrice} onRemove={removeLine} />

      <PaymentMethodPicker value={mode} onChange={setMode} />

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-black/50">Corrigé par (ton nom)</span>
        <input
          type="text"
          value={by}
          onChange={(e) => setBy(e.target.value)}
          placeholder="Ton nom"
          className="w-full rounded-lg border border-black/15 px-3 py-2"
        />
      </label>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xl font-bold">{total.toFixed(2)} €</p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !mode || lines.length === 0 || !by.trim()}
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "Envoi…" : "Valider la correction"}
        </button>
      </div>
    </div>
  );
}
