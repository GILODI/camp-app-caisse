"use client";

import { useEffect } from "react";
import { getTicketQueue } from "@/lib/offlineQueue";

export function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installabilité dégradée mais l'app reste fonctionnelle sans SW.
      });
    }
    getTicketQueue().resume();
  }, []);

  return null;
}
