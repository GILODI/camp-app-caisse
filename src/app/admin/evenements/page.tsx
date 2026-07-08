"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useVendeurs } from "@/lib/hooks";
import { generateAccessCode } from "@/lib/accessCode";
import type { EventRow } from "@/lib/types";

export default function EvenementsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser.from("events").select("*").order("created_at", { ascending: false });
    setEvents(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeEvent = events.find((e) => e.is_active) ?? null;

  async function createEvent() {
    if (!nom.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setNom("");
      await load();
      toast.success("Événement créé");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function activate(id: string) {
    try {
      const res = await fetch(`/api/events/${id}/activate`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await load();
      toast.success("Événement activé");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function renameEvent(id: string) {
    if (!editValue.trim()) return;
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: editValue }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setEditingId(null);
      await load();
      toast.success("Événement renommé");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveCode(id: string) {
    if (!codeValue.trim()) return;
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_acces: codeValue }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setEditingCodeId(null);
      await load();
      toast.success("Code mis à jour — les appareils déjà déverrouillés devront le ressaisir");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-lg font-bold">Événements</h1>

      <div className="space-y-2 rounded-xl border border-black/10 bg-white p-4">
        <p className="text-sm font-medium">Nouvel événement</p>
        <div className="flex gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex : Coupe du monde Chamonix 2026"
            className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
          />
          <button
            onClick={createEvent}
            disabled={creating || !nom.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Créer
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-black/50">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-black/50">Aucun événement pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white p-3"
            >
              {editingId === ev.id ? (
                <div className="flex flex-1 gap-2">
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 rounded-lg border border-black/15 px-2 py-1.5 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => renameEvent(ev.id)}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Valider
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-2 text-xs text-black/50">
                    Annuler
                  </button>
                </div>
              ) : editingCodeId === ev.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input
                    value={codeValue}
                    onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                    placeholder="Ex : CHAM26"
                    className="flex-1 rounded-lg border border-black/15 px-2 py-1.5 font-mono text-sm uppercase tracking-widest"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setCodeValue(generateAccessCode())}
                    className="rounded-md border border-black/15 px-2 py-1.5 text-xs"
                    title="Générer un code aléatoire"
                  >
                    🎲
                  </button>
                  <button
                    onClick={() => saveCode(ev.id)}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Valider
                  </button>
                  <button onClick={() => setEditingCodeId(null)} className="px-2 text-xs text-black/50">
                    Annuler
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ev.nom}</p>
                    <div className="flex items-center gap-2">
                      {ev.is_active && <span className="text-xs font-semibold text-brand">Actif</span>}
                      {ev.code_acces && (
                        <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs tracking-widest">
                          {ev.code_acces}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingId(ev.id);
                        setEditValue(ev.nom);
                      }}
                      className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
                    >
                      Renommer
                    </button>
                    <button
                      onClick={() => {
                        setEditingCodeId(ev.id);
                        setCodeValue(ev.code_acces ?? generateAccessCode());
                      }}
                      className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
                    >
                      Modifier le code
                    </button>
                    {!ev.is_active && (
                      <button
                        onClick={() => activate(ev.id)}
                        className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium"
                      >
                        Activer
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-black/40">
        Le code d&apos;accès de l&apos;événement actif est à donner aux vendeurs pour qu&apos;ils puissent utiliser
        l&apos;app. Tu peux le personnaliser (facile à retenir) ou en tirer un aléatoire avec 🎲. Modifie-le pour
        couper l&apos;accès à un ancien code (ex. à la fin d&apos;un événement).
      </p>

      {activeEvent && <VendeursManager eventId={activeEvent.id} />}
    </div>
  );
}

function VendeursManager({ eventId }: { eventId: string }) {
  const { vendeurs, reload } = useVendeurs(eventId);
  const [nom, setNom] = useState("");

  async function addVendeur() {
    if (!nom.trim()) return;
    try {
      const res = await fetch("/api/vendeurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, nom }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setNom("");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function toggleActif(id: string, actif: boolean) {
    await fetch(`/api/vendeurs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !actif }),
    });
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/vendeurs/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
      <p className="text-sm font-medium">Vendeurs de l&apos;événement actif</p>
      <div className="flex gap-2">
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Prénom du vendeur"
          className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
        />
        <button onClick={addVendeur} className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">
          Ajouter
        </button>
      </div>
      <ul className="space-y-1.5">
        {vendeurs.map((v) => (
          <li key={v.id} className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm">
            <span className={v.actif ? "" : "text-black/40 line-through"}>{v.nom}</span>
            <div className="flex gap-2">
              <button onClick={() => toggleActif(v.id, v.actif)} className="text-xs underline">
                {v.actif ? "Désactiver" : "Réactiver"}
              </button>
              <button onClick={() => remove(v.id)} className="text-xs text-red-600 underline">
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
