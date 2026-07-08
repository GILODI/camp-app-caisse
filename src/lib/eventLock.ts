"use client";

function key(eventId: string) {
  return `camp-caisse:unlocked:${eventId}`;
}

// On conserve le code (pas juste un booléen) pour pouvoir le rejoindre aux
// requêtes sensibles (export) sans redemander la saisie à chaque fois.
export function isEventUnlocked(eventId: string): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(key(eventId));
}

export function getUnlockedCode(eventId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key(eventId));
}

export function markEventUnlocked(eventId: string, code: string) {
  window.localStorage.setItem(key(eventId), code);
}
