"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Scanner caméra plein écran : lit un code-barres (EAN/UPC) et renvoie sa
// valeur. Utilise la caméra arrière si disponible. Une lecture par ouverture
// (on ferme après un scan réussi) — simple et fiable pour la V1.
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | null = null;
    let done = false;

    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
        if (result && !done) {
          done = true;
          onDetectedRef.current(result.getText());
          controls?.stop();
        }
      })
      .then((c) => {
        controls = c;
        if (done) c.stop();
      })
      .catch(() => {
        setError(
          "Impossible d'accéder à la caméra. Autorise l'accès à l'appareil photo dans ton navigateur, ou utilise la recherche manuelle."
        );
      });

    return () => {
      done = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-semibold">Scanner un code-barre</span>
        <button onClick={onClose} className="rounded-md bg-white/15 px-3 py-1.5 text-sm">
          Fermer
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!error && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="max-w-sm rounded-lg bg-white p-4 text-center text-sm text-black">{error}</p>
          </div>
        )}
      </div>

      <p className="px-4 py-3 text-center text-sm text-white/70">
        Vise le code-barres du produit. La recherche manuelle reste disponible si besoin.
      </p>
    </div>
  );
}
