"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser } from "./supabase/client";
import { todayParisISO } from "./date";
import type { CatalogueItem, EventRow, TicketWithItems, Vendeur } from "./types";

export function useActiveEvent() {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Colonnes explicites : ne jamais inclure code_acces ici, ce hook est
    // utilisé par les écrans vendeur publics (voir EventCodeGate).
    const { data } = await supabaseBrowser
      .from("events")
      .select("id,nom,is_active,created_at")
      .eq("is_active", true)
      .maybeSingle();
    setEvent(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabaseBrowser
      .channel(`events-active-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => load())
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [load]);

  return { event, loading, reload: load };
}

export function useCatalogue(eventId: string | undefined) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!eventId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabaseBrowser
      .from("catalogue_items")
      .select("*")
      .eq("event_id", eventId)
      .order("designation", { ascending: true });
    setItems(data ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export function useVendeurs(eventId: string | undefined) {
  const [vendeurs, setVendeurs] = useState<Vendeur[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!eventId) {
      setVendeurs([]);
      setLoading(false);
      return;
    }
    const { data } = await supabaseBrowser
      .from("vendeurs")
      .select("*")
      .eq("event_id", eventId)
      .order("ordre", { ascending: true });
    setVendeurs(data ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
    if (!eventId) return;
    const channel = supabaseBrowser
      .channel(`vendeurs-${eventId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendeurs", filter: `event_id=eq.${eventId}` }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [eventId, load]);

  return { vendeurs, loading, reload: load };
}

export function useTodaySales(eventId: string | undefined) {
  const [tickets, setTickets] = useState<TicketWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const venteDate = todayParisISO();

  const load = useCallback(async () => {
    if (!eventId) {
      setTickets([]);
      setLoading(false);
      return;
    }
    const { data } = await supabaseBrowser
      .from("tickets")
      .select("*, ticket_items(*)")
      .eq("event_id", eventId)
      .eq("vente_date", venteDate)
      .order("numero", { ascending: false });
    setTickets((data ?? []) as TicketWithItems[]);
    setLoading(false);
  }, [eventId, venteDate]);

  useEffect(() => {
    load();
    if (!eventId) return;
    const channel = supabaseBrowser
      .channel(`sales-${eventId}-${venteDate}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `event_id=eq.${eventId}` }, () =>
        load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_items" }, () => load())
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [eventId, venteDate, load]);

  return { tickets, loading, venteDate, reload: load };
}
