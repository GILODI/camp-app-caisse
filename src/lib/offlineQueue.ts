"use client";

import type { NewTicketPayload } from "./types";

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

  async submit(payload: NewTicketPayload): Promise<SubmitOutcome> {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new NetworkError("Réseau indisponible");
    }

    if (res.status >= 500) {
      throw new NetworkError(`Erreur serveur (${res.status})`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new BusinessError(body.error ?? `Erreur (${res.status})`);
    }
    return res.json();
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

    for (const item of queue) {
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
