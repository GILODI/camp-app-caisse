"use client";

const KEY = "camp-caisse:vendeur";

export function getStoredVendeur(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setStoredVendeur(nom: string) {
  window.localStorage.setItem(KEY, nom);
}

export function clearStoredVendeur() {
  window.localStorage.removeItem(KEY);
}
