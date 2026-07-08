export type PaymentMethod = "CB" | "CB_SANS_CONTACT" | "ESPECES" | "CHEQUE";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CB", label: "CB" },
  { value: "CB_SANS_CONTACT", label: "CB sans contact" },
  { value: "ESPECES", label: "Espèces" },
  { value: "CHEQUE", label: "Chèque" },
];

export type TicketStatus = "VALIDE" | "ANNULE";

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
}

export interface TicketItem {
  id: string;
  ticket_id: string;
  reference: string;
  designation: string;
  prix_unitaire: number;
  pvp_ttc: number | null;
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
    quantite: number;
  }[];
}
