import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { VENDEUR_LEGAL, TAUX_TVA_DEFAUT, type TicketItem } from "./types";
import { formatDateTimeFR } from "./date";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  vendeurBlock: { maxWidth: 260 },
  vendeurNom: { fontSize: 12, fontWeight: 700, marginBottom: 3 },
  small: { fontSize: 8, color: "#333", lineHeight: 1.4 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  table: { marginTop: 20 },
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
  colTotal: { flex: 1.2, textAlign: "right" },
  remiseLine: { fontSize: 7, color: "#666", marginTop: 1, paddingHorizontal: 4 },
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
  merci: { marginTop: 18, fontSize: 9, fontWeight: 700, color: "#166534" },
});

const MODE_LABELS: Record<string, string> = {
  CB: "Carte bancaire",
  CB_SANS_CONTACT: "Carte bancaire (sans contact)",
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
};

export interface TicketPdfData {
  numero: number;
  createdAt: string;
  modePaiement: string;
  items: TicketItem[];
  eventNom: string;
}

function money(n: number): string {
  return `${n.toFixed(2)} €`;
}

function TicketDocument({ numero, createdAt, modePaiement, items, eventNom }: TicketPdfData) {
  const totalTtc = items.reduce((sum, item) => sum + Number(item.total_ligne), 0);
  const totalHt = Math.round((totalTtc / (1 + TAUX_TVA_DEFAUT / 100)) * 100) / 100;
  const montantTva = Math.round((totalTtc - totalHt) * 100) / 100;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.vendeurBlock}>
            <Text style={styles.vendeurNom}>{VENDEUR_LEGAL.raisonSociale}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.adresse}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.codePostalVille}</Text>
            <Text style={styles.small}>Tél. {VENDEUR_LEGAL.tel}</Text>
            <Text style={styles.small}>{VENDEUR_LEGAL.email}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>TICKET DE CAISSE</Text>
            <Text style={styles.small}>N° {numero}</Text>
            <Text style={styles.small}>{formatDateTimeFR(createdAt)}</Text>
            <Text style={styles.small}>{eventNom}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colDesignation}>Désignation</Text>
            <Text style={styles.colQte}>Qté</Text>
            <Text style={styles.colTotal}>Total TTC</Text>
          </View>
          {items.map((item) => {
            const pvp = item.pvp_ttc === null || item.pvp_ttc === undefined ? null : Number(item.pvp_ttc);
            const remise = pvp !== null && Math.abs(pvp - Number(item.prix_unitaire)) > 0.001;
            const pvcTotal = pvp !== null ? pvp * item.quantite : 0;
            const remisePct = remise ? Math.round((1 - Number(item.prix_unitaire) / pvp!) * 100) : 0;
            return (
              <View key={item.id}>
                <View style={styles.tableRow}>
                  <Text style={styles.colDesignation}>{item.designation}</Text>
                  <Text style={styles.colQte}>{item.quantite}</Text>
                  <Text style={styles.colTotal}>{money(Number(item.total_ligne))}</Text>
                </View>
                {remise && (
                  <Text style={styles.remiseLine}>
                    PVC {money(pvcTotal)}, Remise {remisePct}%
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Total HT</Text>
            <Text>{money(totalHt)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>TVA ({TAUX_TVA_DEFAUT} %)</Text>
            <Text>{money(montantTva)}</Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text>Total TTC</Text>
            <Text>{money(totalTtc)}</Text>
          </View>
        </View>

        <Text style={styles.merci}>
          Réglé par {MODE_LABELS[modePaiement] ?? modePaiement} — Merci de votre achat !
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            {VENDEUR_LEGAL.raisonSociale} — {VENDEUR_LEGAL.adresse}, {VENDEUR_LEGAL.codePostalVille} — SIRET{" "}
            {VENDEUR_LEGAL.siret} — {VENDEUR_LEGAL.rcs} — TVA intracom. {VENDEUR_LEGAL.tvaIntraco}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderTicketPdf(data: TicketPdfData): Promise<Buffer> {
  return renderToBuffer(<TicketDocument {...data} />);
}
