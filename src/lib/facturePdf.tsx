import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { VENDEUR_LEGAL, type Facture, type TicketItem } from "./types";
import { formatDateFR } from "./date";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  vendeurBlock: { maxWidth: 260 },
  vendeurNom: { fontSize: 12, fontWeight: 700, marginBottom: 3 },
  small: { fontSize: 8, color: "#333", lineHeight: 1.4 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  clientBlock: { marginBottom: 20, alignSelf: "flex-end", maxWidth: 260, textAlign: "left" },
  clientLabel: { fontSize: 8, color: "#666", marginBottom: 2, textTransform: "uppercase" },
  table: { marginTop: 10 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f2f2f2",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  colDesignation: { flex: 3 },
  colQte: { flex: 1, textAlign: "right" },
  colPu: { flex: 1.2, textAlign: "right" },
  colTotal: { flex: 1.2, textAlign: "right" },
  totalsBlock: { marginTop: 16, alignSelf: "flex-end", width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#111",
    fontWeight: 700,
    fontSize: 11,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#666",
    lineHeight: 1.4,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    paddingTop: 6,
  },
  paidBadge: {
    marginTop: 18,
    fontSize: 9,
    fontWeight: 700,
    color: "#166534",
  },
});

const MODE_LABELS: Record<string, string> = {
  CB: "Carte bancaire",
  CB_SANS_CONTACT: "Carte bancaire (sans contact)",
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
};

export interface FacturePdfData {
  facture: Facture;
  ticketNumero: number;
  venteDate: string;
  modePaiement: string;
  items: TicketItem[];
  eventNom: string;
}

function money(n: number): string {
  return `${n.toFixed(2)} €`;
}

function FactureDocument({ facture, ticketNumero, venteDate, modePaiement, items, eventNom }: FacturePdfData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.vendeurBlock}>
            <Text style={styles.vendeurNom}>{VENDEUR_LEGAL.raisonSociale}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.formeCapital}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.adresse}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.codePostalVille}</Text>
            <Text style={styles.small}>SIRET : {VENDEUR_LEGAL.siret}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.rcs}</Text>
            <Text style={styles.small}>N° TVA intracom. : {VENDEUR_LEGAL.tvaIntraco}</Text>
            <Text style={styles.small}>Tél. {VENDEUR_LEGAL.tel} — {VENDEUR_LEGAL.email}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>FACTURE</Text>
            <Text style={styles.small}>N° {facture.numero_affiche}</Text>
            <Text style={styles.small}>Date d&apos;émission : {formatDateFR(facture.created_at.slice(0, 10))}</Text>
            <Text style={styles.small}>Vente du {formatDateFR(venteDate)} — ticket n° {ticketNumero}</Text>
            <Text style={styles.small}>{eventNom}</Text>
          </View>
        </View>

        <View style={styles.clientBlock}>
          <Text style={styles.clientLabel}>Facturé à</Text>
          <Text style={styles.small}>{facture.client_nom}</Text>
          <Text style={styles.small}>{facture.client_adresse}</Text>
          {facture.client_siret && <Text style={styles.small}>SIRET : {facture.client_siret}</Text>}
          {facture.client_tva_intraco && (
            <Text style={styles.small}>N° TVA intracom. : {facture.client_tva_intraco}</Text>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colDesignation}>Désignation</Text>
            <Text style={styles.colQte}>Qté</Text>
            <Text style={styles.colPu}>PU TTC</Text>
            <Text style={styles.colTotal}>Total TTC</Text>
          </View>
          {items.map((item) => (
            <View style={styles.tableRow} key={item.id}>
              <Text style={styles.colDesignation}>{item.designation}</Text>
              <Text style={styles.colQte}>{item.quantite}</Text>
              <Text style={styles.colPu}>{money(Number(item.prix_unitaire))}</Text>
              <Text style={styles.colTotal}>{money(Number(item.total_ligne))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Total HT</Text>
            <Text>{money(Number(facture.total_ht))}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>TVA ({Number(facture.taux_tva).toFixed(2)} %)</Text>
            <Text>{money(Number(facture.montant_tva))}</Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text>Total TTC</Text>
            <Text>{money(Number(facture.total_ttc))}</Text>
          </View>
        </View>

        <Text style={styles.paidBadge}>
          Facture acquittée le {formatDateFR(venteDate)} — réglée par {MODE_LABELS[modePaiement] ?? modePaiement}.
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            {VENDEUR_LEGAL.raisonSociale} — {VENDEUR_LEGAL.formeCapital} — {VENDEUR_LEGAL.adresse},{" "}
            {VENDEUR_LEGAL.codePostalVille} — SIRET {VENDEUR_LEGAL.siret} — {VENDEUR_LEGAL.rcs} — TVA intracom.{" "}
            {VENDEUR_LEGAL.tvaIntraco}
          </Text>
          <Text>
            Vente au comptant, aucun escompte pour paiement anticipé. En cas de retard de paiement (créance
            professionnelle) : pénalités au taux directeur BCE majoré de 10 points, indemnité forfaitaire de
            recouvrement de 40 €.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderFacturePdf(data: FacturePdfData): Promise<Buffer> {
  return renderToBuffer(<FactureDocument {...data} />);
}
