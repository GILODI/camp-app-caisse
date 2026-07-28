"use client";

import { getUnlockedCode } from "./eventLock";
import { EVENT_CODE_HEADER } from "./accessCode";

// Partage du reçu PDF d'un ticket depuis le téléphone du vendeur : on passe
// par l'API de partage native quand elle accepte les fichiers (le client
// reçoit alors le PDF par SMS, WhatsApp, mail…), sinon on ouvre simplement
// le PDF, que le vendeur peut partager depuis le lecteur du téléphone.
export async function shareTicketPdf(ticketId: string, numero: number, eventId: string) {
  const url = `/api/tickets/${ticketId}/pdf`;
  const code = getUnlockedCode(eventId);

  try {
    const res = await fetch(url, {
      headers: code ? { [EVENT_CODE_HEADER]: code } : {},
    });
    if (!res.ok) throw new Error("Impossible de récupérer le ticket");
    const blob = await res.blob();
    const file = new File([blob], `Ticket-${numero}.pdf`, { type: "application/pdf" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Ticket n° ${numero}` });
      return;
    }
    // Partage de fichier indisponible : on ouvre le PDF déjà téléchargé,
    // sans repasser par le réseau (évite de remettre le code dans l'URL).
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return;
  } catch (err) {
    // Partage annulé par le vendeur : ne pas rouvrir le PDF derrière lui.
    if ((err as Error).name === "AbortError") return;
  }

  // Dernier recours (échec du téléchargement) : ouverture directe. Le code
  // passe alors en paramètre d'URL, seule façon d'authentifier window.open.
  window.open(code ? `${url}?code=${encodeURIComponent(code)}` : url, "_blank");
}
