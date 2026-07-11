export type PaymentMethod = "CB" | "CB_SANS_CONTACT" | "ESPECES" | "CHEQUE";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CB", label: "CB" },
  { value: "CB_SANS_CONTACT", label: "CB sans contact" },
  { value: "ESPECES", label: "Espèces" },
  { value: "CHEQUE", label: "Chèque" },
];

export type TicketStatus = "VALIDE" | "ANNULE";

export type MouvementType = "VOL" | "DOTATION" | "CASSE";

export const MOUVEMENT_TYPES: { value: MouvementType; label: string }[] = [
  { value: "DOTATION", label: "Dotation (don athlète…)" },
  { value: "VOL", label: "Vol" },
  { value: "CASSE", label: "Casse / perte" },
];

export interface MouvementStock {
  id: string;
  event_id: string;
  reference: string;
  designation: string;
  type: MouvementType;
  quantite: number;
  motif: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  nom: string;
  is_active: boolean;
  created_at: string;
  // Présent uniquement quand récupéré via une requête admin (jamais exposé
  // aux écrans vendeur publics) — voir src/lib/hooks.ts useActiveEvent.
  code_acces?: string;
}

export interface Vendeur {
  id: string;
  event_id: string;
  nom: string;
  actif: boolean;
  ordre: number;
}

export interface CatalogueItem {
  id: string;
  event_id: string;
  reference: string;
  designation: string;
  prix_ttc: number;
  pvp_ttc: number | null;
  stock_initial: number | null;
}

export interface TicketItem {
  id: string;
  ticket_id: string;
  reference: string;
  designation: string;
  prix_unitaire: number;
  pvp_ttc: number | null;
  prix_modifie: boolean;
  quantite: number;
  total_ligne: number;
}

export interface Ticket {
  id: string;
  event_id: string;
  numero: number;
  vente_date: string;
  vendeur: string;
  mode_paiement: PaymentMethod;
  statut: TicketStatus;
  total_ttc: number;
  motif_annulation: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  remplace_ticket_id: string | null;
  created_at: string;
}

export interface TicketWithItems extends Ticket {
  ticket_items: TicketItem[];
}

// Ligne saisie côté client avant validation du ticket (pas encore d'id serveur).
export interface DraftLine {
  key: string;
  reference: string;
  designation: string;
  prix_unitaire: number;
  // Prix catalogue d'origine, pour détecter une modification manuelle et
  // proposer un « retour au prix normal ».
  prix_catalogue: number;
  pvp_ttc: number | null;
  quantite: number;
}

export interface NewTicketPayload {
  event_id: string;
  vendeur: string;
  mode_paiement: PaymentMethod;
  items: {
    reference: string;
    designation: string;
    prix_unitaire: number;
    pvp_ttc: number | null;
    prix_modifie: boolean;
    quantite: number;
  }[];
}

// Suivi de caisse espèces (comptage physique billets/pièces).
export const DENOMINATIONS = [
  { key: "nb_billets_50", label: "Billet 50 €", valeur: 50 },
  { key: "nb_billets_20", label: "Billet 20 €", valeur: 20 },
  { key: "nb_billets_10", label: "Billet 10 €", valeur: 10 },
  { key: "nb_billets_5", label: "Billet 5 €", valeur: 5 },
  { key: "nb_pieces_2", label: "Pièce 2 €", valeur: 2 },
  { key: "nb_pieces_1", label: "Pièce 1 €", valeur: 1 },
  { key: "nb_pieces_050", label: "Pièce 0,50 €", valeur: 0.5 },
  { key: "nb_pieces_020", label: "Pièce 0,20 €", valeur: 0.2 },
  { key: "nb_pieces_010", label: "Pièce 0,10 €", valeur: 0.1 },
  { key: "nb_pieces_005", label: "Pièce 0,05 €", valeur: 0.05 },
] as const;

export type DenominationKey = (typeof DENOMINATIONS)[number]["key"];

export type DenominationCounts = Record<DenominationKey, number>;

export type ComptageType = "initial" | "jour";

export interface CaisseComptage extends DenominationCounts {
  id: string;
  event_id: string;
  type: ComptageType;
  comptage_date: string | null;
  total_compte: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveComptagePayload {
  event_id: string;
  type: ComptageType;
  comptage_date: string | null;
  counts: DenominationCounts;
  by: string;
}
