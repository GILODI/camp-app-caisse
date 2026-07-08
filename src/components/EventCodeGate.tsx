"use client";

import { useEffect, useState } from "react";
import { isEventUnlocked, markEventUnlocked } from "@/lib/eventLock";

export function EventCodeGate({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUnlocked(isEventUnlocked(eventId));
    setChecked(true);
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/events/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, code }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError("Code incorrect");
        return;
      }
      markEventUnlocked(eventId, code);
      setUnlocked(true);
    } catch {
      setError("Erreur réseau, réessaie");
    } finally {
      setSubmitting(false);
    }
  }

  if (!checked) return null;

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-6 text-center">
        <h1 className="text-lg font-bold">Code d&apos;accès requis</h1>
        <p className="text-sm text-black/60">
          Demande le code de cet événement au responsable pour accéder aux ventes.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code à 6 caractères"
            autoFocus
            className="w-full rounded-lg border border-black/15 px-4 py-3 text-center text-lg uppercase tracking-widest"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !code}
            className="w-full rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Vérification…" : "Valider"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
