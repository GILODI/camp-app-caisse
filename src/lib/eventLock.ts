"use client";

import { EVENT_CODE_HEADER } from "./accessCode";

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

// En-tête à joindre aux appels d'API de vente (création, annulation,
// correction, reçu, demande de facture) : sans lui, le serveur refuse.
export function eventCodeHeaders(eventId: string): Record<string, string> {
  const code = getUnlockedCode(eventId);
  return code ? { [EVENT_CODE_HEADER]: code } : {};
}
