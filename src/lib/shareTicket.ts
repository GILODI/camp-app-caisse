// Partage du reçu PDF d'un ticket depuis le téléphone du vendeur : on passe
// par l'API de partage native quand elle accepte les fichiers (le client
// reçoit alors le PDF par SMS, WhatsApp, mail…), sinon on ouvre simplement
// le PDF, que le vendeur peut partager depuis le lecteur du téléphone.
export async function shareTicketPdf(ticketId: string, numero: number) {
  const url = `/api/tickets/${ticketId}/pdf`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Impossible de récupérer le ticket");
    const blob = await res.blob();
    const file = new File([blob], `Ticket-${numero}.pdf`, { type: "application/pdf" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Ticket n° ${numero}` });
      return;
    }
  } catch (err) {
    // Partage annulé par le vendeur : ne pas rouvrir le PDF derrière lui.
    if ((err as Error).name === "AbortError") return;
  }
  window.open(url, "_blank");
}
