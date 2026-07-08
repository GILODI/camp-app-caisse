"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActiveEvent } from "@/lib/hooks";
import { getStoredVendeur } from "@/lib/currentVendeur";

export function Header() {
  const { event } = useActiveEvent();
  const [vendeur, setVendeur] = useState<string | null>(null);

  useEffect(() => {
    setVendeur(getStoredVendeur());
    const onStorage = () => setVendeur(getStoredVendeur());
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onStorage);
    };
  }, []);

  return (
    <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-black/10 bg-brand-dark px-4 py-3 text-white">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{event ? event.nom : "Aucun événement actif"}</p>
        <p className="truncate text-xs text-white/70">
          {vendeur ? (
            <>
              Vendeur : <span className="font-medium text-white">{vendeur}</span>{" "}
              <Link href="/" className="underline">
                changer
              </Link>
            </>
          ) : (
            <Link href="/" className="underline">
              Choisir un vendeur
            </Link>
          )}
        </p>
      </div>
      <Link href="/admin" className="shrink-0 rounded-md bg-white/10 px-2.5 py-1.5 text-xs">
        Admin
      </Link>
    </header>
  );
}
