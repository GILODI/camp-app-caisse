"use client";

import type { NewTicketPayload } from "./types";
import { eventCodeHeaders } from "./eventLock";

export interface TicketResult {
  id: string;
  numero: number;
  vente_date: string;
  total_ttc: number;
}

export interface QueuedTicket {
  localId: string;
  payload: NewTicketPayload;
  attempts: number;
  createdAt: number;
  lastError?: string;
}

export type SubmitOutcome =
  | { status: "ok"; result: TicketResult }
  | { status: "queued"; localId: string }
  | { status: "error"; message: string };

class NetworkError extends Error {}
class BusinessError extends Error {}

const STORAGE_KEY = "camp-caisse:ticket-queue";
const RETRY_INTERVAL_MS = 4000;

type ChangeListener = (queue: QueuedTicket[]) => void;
type ResolvedListener = (localId: string, result: TicketResult) => void;

// File d'attente locale pour les tickets qui n'ont pas pu être envoyés tout
// de suite à cause d'une coupure réseau. Rien n'est perdu : la saisie reste
// dans le navigateur (localStorage) et est retentée automatiquement jusqu'à
// ce qu'elle atteigne le serveur.
class TicketQueue {
  private changeListeners = new Set<ChangeListener>();
  private resolvedListeners = new Set<ResolvedListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private read(): QueuedTicket[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as QueuedTicket[]) : [];
    } catch {
      return [];
    }
  }

  private write(queue: QueuedTicket[]) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    this.changeListeners.forEach((l) => l(queue));
  }

  getQueue(): QueuedTicket[] {
    return this.read();
  }

  onChange(listener: ChangeListener) {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  onResolved(listener: ResolvedListener) {
    this.resolvedListeners.add(listener);
    return () => {
      this.resolvedListeners.delete(listener);
    };
  }

  // Reprend le traitement d'une file existante (ex: après un rechargement de
  // page pendant que des tickets étaient encore en attente).
  resume() {
    if (this.read().length > 0) this.ensureRetryLoop();
  }

  async submit(rawPayload: NewTicketPayload): Promise<SubmitOutcome> {
    // L'identifiant de la vente est fixé ICI, avant le tout premier envoi, puis
    // conservé tel quel à chaque renvoi. Si le serveur a enregistré la vente
    // mais que la confirmation s'est perdue en route, le renvoi retrouve ce
    // ticket au lieu d'en créer un second (chiffre d'affaires doublé).
    // De même pour l'heure : c'est celle de la validation, jamais celle d'un
    // renvoi, sinon une vente encaissée à 23h50 hors ligne serait datée du
    // lendemain matin.
    const payload: NewTicketPayload = {
      ...rawPayload,
      client_ref: rawPayload.client_ref ?? crypto.randomUUID(),
      vendu_le: rawPayload.vendu_le ?? new Date().toISOString(),
    };
    try {
      const result = await this.send(payload);
      return { status: "ok", result };
    } catch (err) {
      if (err instanceof BusinessError) {
        return { status: "error", message: err.message };
      }
      const localId = crypto.randomUUID();
      const queue = this.read();
      queue.push({ localId, payload, attempts: 0, createdAt: Date.now() });
      this.write(queue);
      this.ensureRetryLoop();
      return { status: "queued", localId };
    }
  }

  private async send(payload: NewTicketPayload): Promise<TicketResult> {
    let res: Response;
    try {
      res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...eventCodeHeaders(payload.event_id) },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new NetworkError("Réseau indisponible");
    }

    if (res.status >= 500) {
      throw new NetworkError(`Erreur serveur (${res.status})`);
    }
    // 401 = code d'accès absent ou changé entre-temps. Surtout pas une
    // erreur définitive : le ticket resterait sinon perdu alors que la vente
    // a bien eu lieu. On le garde en file, il repartira dès que l'événement
    // sera de nouveau déverrouillé sur ce téléphone.
    if (res.status === 401) {
      throw new NetworkError("Accès à l'événement à revalider");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new BusinessError(body.error ?? `Erreur (${res.status})`);
    }
    return res.json();
  }

  // Tickets mis en file avant l'introduction de client_ref / vendu_le : on les
  // complète maintenant, et on l'enregistre AVANT l'envoi pour qu'une tentative
  // ultérieure réutilise les mêmes valeurs au lieu d'en générer de nouvelles.
  // L'heure de la vente est celle où le ticket est entré dans la file : c'est
  // la meilleure information disponible, et elle date bien de la vente.
  private ensureStamps(item: QueuedTicket): QueuedTicket {
    if (item.payload.client_ref && item.payload.vendu_le) return item;
    const upgraded: QueuedTicket = {
      ...item,
      payload: {
        ...item.payload,
        client_ref: item.payload.client_ref ?? crypto.randomUUID(),
        vendu_le: item.payload.vendu_le ?? new Date(item.createdAt).toISOString(),
      },
    };
    this.write(this.read().map((q) => (q.localId === item.localId ? upgraded : q)));
    return upgraded;
  }

  private ensureRetryLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), RETRY_INTERVAL_MS);
    window.addEventListener("online", () => void this.flush());
  }

  private async flush() {
    const queue = this.read();
    if (queue.length === 0) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }

    for (const queued of queue) {
      const item = this.ensureStamps(queued);
      try {
        const result = await this.send(item.payload);
        const remaining = this.read().filter((q) => q.localId !== item.localId);
        this.write(remaining);
        this.resolvedListeners.forEach((l) => l(item.localId, result));
      } catch (err) {
        if (err instanceof BusinessError) {
          // Erreur métier qui ne se résoudra pas toute seule (ex: référence
          // catalogue supprimée). On retire de la file pour ne pas boucler
          // indéfiniment, mais on log pour ne pas la faire disparaître
          // silencieusement.
          const remaining = this.read().filter((q) => q.localId !== item.localId);
          this.write(remaining);
          console.error(`Ticket en attente rejeté définitivement : ${err.message}`, item.payload);
        } else {
          const updated = this.read().map((q) =>
            q.localId === item.localId
              ? { ...q, attempts: q.attempts + 1, lastError: (err as Error).message }
              : q
          );
          this.write(updated);
        }
      }
    }
  }
}

let instance: TicketQueue | null = null;

export function getTicketQueue(): TicketQueue {
  if (typeof window === "undefined") {
    throw new Error("getTicketQueue ne peut être appelé que côté navigateur");
  }
  if (!instance) instance = new TicketQueue();
  return instance;
}
