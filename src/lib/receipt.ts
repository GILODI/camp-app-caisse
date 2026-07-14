import { PAYMENT_METHODS, TAUX_TVA_DEFAUT, VENDEUR_LEGAL, type DraftLine, type PaymentMethod } from "./types";

function formatDateHeureFR(d: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} à ${get("hour")}:${get("minute")}`;
}

// Ligne produit : si un PVP TTC (prix avant remise) est renseigné et diffère
// du prix facturé, on affiche la remise pour que le client s'en rende
// compte ; sinon juste la ligne simple, comme avant.
function formatLigne(l: DraftLine): string {
  const totalLigne = l.prix_unitaire * l.quantite;
  const header = `${l.quantite} × ${l.designation}`;

  if (l.pvp_ttc !== null && Math.abs(l.pvp_ttc - l.prix_unitaire) > 0.001) {
    const pvcTotal = l.pvp_ttc * l.quantite;
    const remisePct = Math.round((1 - l.prix_unitaire / l.pvp_ttc) * 100);
    return `${header}\n   PVC ${pvcTotal.toFixed(2)} € — remise ${remisePct}% — prix payé ${totalLigne.toFixed(2)} €`;
  }
  return `${header} — ${totalLigne.toFixed(2)} €`;
}

// Reçu texte simple, pensé pour être partagé tel quel via le partage natif
// du téléphone (SMS, WhatsApp, e-mail...) — pas de mise en page à gérer côté
// canaux de destination. L'heure est celle du téléphone au moment de
// l'envoi (le serveur ne renvoie pas encore l'horodatage de création).
export function buildReceiptText(params: {
  eventNom: string;
  numero: number;
  lines: DraftLine[];
  mode: PaymentMethod;
  total: number;
}): string {
  const { eventNom, numero, lines, mode, total } = params;
  const modeLabel = PAYMENT_METHODS.find((m) => m.value === mode)?.label ?? mode;

  const adresseSansVirgule = VENDEUR_LEGAL.adresse.replace(/,\s*/g, " ").trim();
  const telNational = VENDEUR_LEGAL.tel.replace("+33 ", "0");

  const lignes = lines.map(formatLigne).join("\n");

  // HT/TVA affichés à titre indicatif (taux par défaut de l'entreprise) —
  // rien n'est stocké en base, c'est un calcul d'affichage uniquement,
  // même méthode que la facture (HT arrondi, TVA = TTC - HT).
  const totalHT = Math.round((total / (1 + TAUX_TVA_DEFAUT / 100)) * 100) / 100;
  const montantTVA = Math.round((total - totalHT) * 100) / 100;

  return [
    VENDEUR_LEGAL.raisonSociale,
    adresseSansVirgule,
    VENDEUR_LEGAL.codePostalVille,
    `Tél. ${telNational}`,
    VENDEUR_LEGAL.email,
    "",
    `Ticket n° ${numero} — ${formatDateHeureFR(new Date())}`,
    eventNom,
    "",
    lignes,
    "",
    `Total HT : ${totalHT.toFixed(2)} €`,
    `TVA (${TAUX_TVA_DEFAUT} %) : ${montantTVA.toFixed(2)} €`,
    `Total TTC : ${total.toFixed(2)} €`,
    "",
    `Mode de paiement : ${modeLabel}`,
    "",
    "Merci de votre achat !",
  ].join("\n");
}
