"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCatalogue } from "@/lib/hooks";
import { formatDateFR } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/types";
import type {
  CatalogueItem,
  Cloture,
  DraftLine,
  EventRow,
  PaymentMethod,
  TicketWithItems,
} from "@/lib/types";
import { ProductAutocomplete } from "@/components/ProductAutocomplete";
import { TicketLinesEditor } from "@/components/TicketLinesEditor";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";

const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export default function AdminCorrigerPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState("");
  const [tickets, setTickets] = useState<TicketWithItems[]>([]);
  const [clotures, setClotures] = useState<Cloture[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TicketWithItems | null>(null);

  const { items: catalogue, loading: catalogueLoading } = useCatalogue(eventId || undefined);

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
      setTickets([]);
      setClotures([]);
      return;
    }
    setLoading(true);
    const [{ data: ticketData }, { data: clotureData }] = await Promise.all([
      supabaseBrowser
        .from("tickets")
        .select("*, ticket_items(*)")
        .eq("event_id", eventId)
        .order("vente_date", { ascending: false })
        .order("numero", { ascending: false }),
      supabaseBrowser.from("clotures").select("*").eq("event_id", eventId),
    ]);
    setTickets((ticketData ?? []) as TicketWithItems[]);
    setClotures((clotureData ?? []) as Cloture[]);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const dates = useMemo(() => {
    const set = new Set(tickets.map((t) => t.vente_date));
    return Array.from(set).sort().reverse();
  }, [tickets]);

  useEffect(() => {
    if (dates.length > 0 && !dates.includes(date)) setDate(dates[0]);
  }, [dates, date]);

  const closedDates = useMemo(
    () => new Set(clotures.filter((c) => c.type === "jour" && c.periode).map((c) => c.periode as string)),
    [clotures]
  );
  const eventClosed = clotures.some((c) => c.type === "evenement");
  const dayClosed = eventClosed || closedDates.has(date);

  const jour = tickets.filter((t) => t.vente_date === date);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold">Corriger un ticket passé</h1>
        <p className="text-sm text-black/50">
          Pour rattraper une erreur constatée après coup. Le ticket corrigé garde sa date de vente d&apos;origine :
          la vente ne change pas de journée. Une journée clôturée n&apos;est plus modifiable.
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
          <span className="mb-1 block text-xs font-medium text-black/50">Journée de vente</span>
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-black/15 px-3 py-2"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatDateFR(d)}
                {closedDates.has(d) ? " — clôturée" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {dayClosed && date && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {eventClosed ? "Événement clôturé" : "Journée clôturée"} : les tickets sont définitivement figés. C&apos;est
          voulu — c&apos;est ce qui garantit la conformité fiscale. Une erreur découverte après clôture se traite en
          comptabilité, pas dans la caisse.
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-black/40">Chargement…</p>
      ) : jour.length === 0 ? (
        <p className="py-10 text-center text-black/40">Aucun ticket pour cette journée.</p>
      ) : (
        <ul className="space-y-2">
          {jour.map((ticket) => (
            <li
              key={ticket.id}
              className={`rounded-lg border border-black/10 bg-white p-3 ${
                ticket.statut === "ANNULE" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    N° {ticket.numero}{" "}
                    {ticket.statut === "ANNULE" && (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                        ANNULÉ
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-black/50">
                    {ticket.vendeur} · {labelByMethod.get(ticket.mode_paiement)}
                  </p>
                </div>
                <p className="text-lg font-bold">{Number(ticket.total_ttc).toFixed(2)} €</p>
              </div>

              <ul className="mt-1.5 text-xs text-black/60">
                {ticket.ticket_items.map((item) => (
                  <li key={item.id}>
                    {item.quantite} × {item.designation} — {Number(item.prix_unitaire).toFixed(2)} €
                  </li>
                ))}
              </ul>

              {ticket.statut === "ANNULE" && ticket.motif_annulation && (
                <p className="mt-1 text-xs italic text-black/40">Motif : {ticket.motif_annulation}</p>
              )}

              {ticket.statut === "VALIDE" && !dayClosed && (
                <button
                  onClick={() => setEditing(ticket)}
                  disabled={catalogueLoading}
                  className="mt-2 rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  {catalogueLoading ? "Chargement du catalogue…" : "Corriger ce ticket"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CorrectionDialog
          ticket={editing}
          catalogue={catalogue}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CorrectionDialog({
  ticket,
  catalogue,
  onClose,
  onDone,
}: {
  ticket: TicketWithItems;
  catalogue: CatalogueItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  // prix_catalogue = prix de vente courant du catalogue, jamais le PVC :
  // c'est lui qui sert à repérer un prix saisi à la main. Si le produit
  // n'est plus au catalogue, on retient le prix pratiqué sur le ticket
  // pour ne pas le signaler comme modifié à tort.
  const [lines, setLines] = useState<DraftLine[]>(() => {
    const prixParReference = new Map(catalogue.map((c) => [c.reference, Number(c.prix_ttc)]));
    return ticket.ticket_items.map((item) => ({
      key: item.id,
      reference: item.reference,
      designation: item.designation,
      prix_unitaire: Number(item.prix_unitaire),
      prix_catalogue: prixParReference.get(item.reference) ?? Number(item.prix_unitaire),
      pvp_ttc: item.pvp_ttc === null || item.pvp_ttc === undefined ? null : Number(item.pvp_ttc),
      quantite: item.quantite,
    }));
  });
  const [mode, setMode] = useState<PaymentMethod>(ticket.mode_paiement);
  const [submitting, setSubmitting] = useState(false);

  const total = lines.reduce((sum, l) => sum + l.prix_unitaire * l.quantite, 0);

  function addItem(item: CatalogueItem) {
    setLines((prev) => {
      const existing = prev.find((l) => l.reference === item.reference);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          reference: item.reference,
          designation: item.designation,
          prix_unitaire: Number(item.prix_ttc),
          prix_catalogue: Number(item.prix_ttc),
          pvp_ttc: item.pvp_ttc === null || item.pvp_ttc === undefined ? null : Number(item.pvp_ttc),
          quantite: 1,
        },
      ];
    });
  }

  async function submit() {
    if (lines.length === 0) {
      toast.error("Le ticket doit contenir au moins une ligne");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/admin-correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendeur: ticket.vendeur,
          mode_paiement: mode,
          items: lines.map((l) => ({
            reference: l.reference,
            designation: l.designation,
            prix_unitaire: l.prix_unitaire,
            pvp_ttc: l.pvp_ttc,
            prix_modifie: Math.abs(l.prix_unitaire - l.prix_catalogue) > 0.001,
            quantite: l.quantite,
          })),
          by: "Admin",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Échec de la correction");
      toast.success(`Ticket corrigé — nouveau n° ${body.numero}`);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center">
      <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div>
          <p className="text-lg font-bold">Corriger le ticket n° {ticket.numero}</p>
          <p className="text-sm text-black/60">
            Vente du {formatDateFR(ticket.vente_date)} — le ticket actuel sera annulé et remplacé par un nouveau
            ticket <strong>daté du même jour</strong>, avec un nouveau numéro.
          </p>
        </div>

        <ProductAutocomplete items={catalogue} onSelect={addItem} />

        <TicketLinesEditor
          lines={lines}
          onChangeQuantite={(key, quantite) =>
            setLines((prev) =>
              quantite <= 0
                ? prev.filter((l) => l.key !== key)
                : prev.map((l) => (l.key === key ? { ...l, quantite } : l))
            )
          }
          onChangePrice={(key, prix) =>
            setLines((prev) => prev.map((l) => (l.key === key ? { ...l, prix_unitaire: prix } : l)))
          }
          onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
        />

        <PaymentMethodPicker value={mode} onChange={setMode} />

        <p className="text-right text-xl font-bold">{total.toFixed(2)} €</p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-black/15 py-3 font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Correction…" : "Valider la correction"}
          </button>
        </div>
      </div>
    </div>
  );
}
