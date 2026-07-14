import { PAYMENT_METHODS, type DraftLine, type PaymentMethod } from "./types";
import { formatDateFR } from "./date";

// Reçu texte simple, pensé pour être partagé tel quel via le partage natif
// du téléphone (SMS, WhatsApp, e-mail...) — pas de mise en page à gérer côté
// canaux de destination.
export function buildReceiptText(params: {
  eventNom: string;
  numero: number;
  venteDate: string;
  vendeur: string;
  lines: DraftLine[];
  mode: PaymentMethod;
  total: number;
}): string {
  const { eventNom, numero, venteDate, vendeur, lines, mode, total } = params;
  const modeLabel = PAYMENT_METHODS.find((m) => m.value === mode)?.label ?? mode;

  const lignes = lines
    .map((l) => `${l.quantite} × ${l.designation} — ${(l.prix_unitaire * l.quantite).toFixed(2)} €`)
    .join("\n");

  return [
    eventNom,
    `Ticket n° ${numero} — ${formatDateFR(venteDate)}`,
    `Vendeur : ${vendeur}`,
    "",
    lignes,
    "",
    `Total TTC : ${total.toFixed(2)} €`,
    `Mode de paiement : ${modeLabel}`,
    "",
    "Merci de votre achat !",
  ].join("\n");
}
