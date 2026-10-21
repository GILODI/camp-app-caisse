import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateDailyExport, generateEventArchive } from "./excelExport";
import type { DemandeFacture, PaymentMethod, TicketWithItems } from "./types";

// Ces totaux décident ce qui part « en bloc » dans l'ERP le soir et ce qui est
// saisi une par une (ventes avec demande de facture). Une vente qui basculerait
// du mauvais côté fausserait la comptabilité sans qu'aucun message n'apparaisse.

const DATE = "2026-07-28";

function ticket(
  id: string,
  numero: number,
  mode: PaymentMethod,
  lignes: { reference: string; designation: string; pu: number; qte: number; pvp?: number | null }[],
  extra: Partial<TicketWithItems> = {}
): TicketWithItems {
  const total = lignes.reduce((s, l) => s + l.pu * l.qte, 0);
  return {
    id,
    event_id: "ev",
    numero,
    vente_date: DATE,
    vendeur: "Alex",
    mode_paiement: mode,
    statut: "VALIDE",
    total_ttc: total,
    motif_annulation: null,
    cancelled_at: null,
    cancelled_by: null,
    remplace_ticket_id: null,
    vendu_le: null,
    created_at: `${DATE}T10:00:00Z`,
    ticket_items: lignes.map((l, i) => ({
      id: `${id}-i${i}`,
      ticket_id: id,
      reference: l.reference,
      designation: l.designation,
      prix_unitaire: l.pu,
      pvp_ttc: l.pvp ?? null,
      prix_modifie: false,
      quantite: l.qte,
      total_ligne: l.pu * l.qte,
    })),
    ...extra,
  };
}

function demande(ticketId: string, extra: Partial<DemandeFacture> = {}): DemandeFacture {
  return {
    id: `d-${ticketId}`,
    ticket_id: ticketId,
    event_id: "ev",
    client_nom: "Dupont",
    client_prenom: "Jean",
    client_adresse: "12 rue des Alpes, 74700 Sallanches",
    client_telephone: "0611223344",
    client_email: "jean.dupont@example.com",
    client_siret: "12345678900012",
    created_by: "Alex",
    created_at: `${DATE}T18:00:00Z`,
    anonymise_at: null,
    ...extra,
  };
}

// Jeu de ventes : 3 ventes courantes + 1 vente avec demande de facture.
const T1 = ticket("t1", 1, "CB", [{ reference: "R1", designation: "Trail Force 5 M-L", pu: 64, qte: 1, pvp: 80 }]);
const T2 = ticket("t2", 2, "ESPECES", [{ reference: "R2", designation: "T-shirt", pu: 15, qte: 2 }]);
const T3 = ticket("t3", 3, "CB", [{ reference: "R3", designation: "Casque", pu: 100, qte: 1 }]);
const T4 = ticket("t4", 4, "CB", [{ reference: "R4", designation: "Baudrier Pro", pu: 250, qte: 1 }]);
const TOUS = [T1, T2, T3, T4];

type Ligne = unknown[];

async function charger(buffer: ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function lignes(wb: ExcelJS.Workbook, feuille: string): Ligne[] {
  const sheet = wb.getWorksheet(feuille);
  if (!sheet) throw new Error(`feuille « ${feuille} » absente`);
  const out: Ligne[] = [];
  sheet.eachRow((row) => out.push((row.values as unknown[]).slice(1)));
  return out;
}

// Retrouve la n-ième ligne dont la première cellule vaut `libelle` (« CB » apparaît
// une fois par tableau de totaux).
function ligne(rows: Ligne[], libelle: string, occurrence = 0): Ligne {
  const trouvees = rows.filter((r) => r[0] === libelle);
  if (!trouvees[occurrence]) throw new Error(`ligne « ${libelle} » (n°${occurrence}) introuvable`);
  return trouvees[occurrence];
}

const nomsFeuilles = (wb: ExcelJS.Workbook) => wb.worksheets.map((s) => s.name);

describe("export Excel du jour", () => {
  describe("sans aucune demande de facture", () => {
    it("tout part dans le total à traiter en bloc, sans tableau de demandes de facture", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS.slice(0, 3)));
      const synthese = lignes(wb, "Synthèse jour");

      expect(ligne(synthese, "TOTAL (hors demandes de facture)").slice(1)).toEqual([3, 4, 194]);
      expect(synthese.some((r) => r[0] === "TOTAL demandes de facture")).toBe(false);
      expect(nomsFeuilles(wb)).not.toContain("Demandes de facture");
    });

    it("le détail des ventes est rempli, avec « Facture demandée » = Non partout", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS.slice(0, 3)));
      const detail = lignes(wb, "Saisie ventes");
      const entete = detail[0];
      const col = entete.indexOf("Facture demandée");

      expect(col).toBeGreaterThan(-1);
      expect(detail.slice(1).map((r) => r[col])).toEqual(["Non", "Non", "Non"]);
    });
  });

  describe("avec une vente à facturer", () => {
    it("la vente sort du total en bloc, et apparaît dans son propre tableau, avec son mode de paiement", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [demande("t4")]));
      const synthese = lignes(wb, "Synthèse jour");

      // Tableau 1 : à traiter en bloc → CB = 64 + 100, sans les 250 € de la vente à facturer.
      expect(ligne(synthese, "CB", 0).slice(1)).toEqual([2, 2, 164]);
      expect(ligne(synthese, "Espèces", 0).slice(1)).toEqual([1, 2, 30]);
      expect(ligne(synthese, "TOTAL (hors demandes de facture)").slice(1)).toEqual([3, 4, 194]);
      // Tableau 2 : la vente à facturer, ventilée par mode de paiement.
      expect(ligne(synthese, "CB", 1).slice(1)).toEqual([1, 1, 250]);
      expect(ligne(synthese, "TOTAL demandes de facture").slice(1)).toEqual([1, 1, 250]);
    });

    it("le total réellement encaissé = bloc + demandes de facture (rien ne se perd, rien n'est compté deux fois)", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [demande("t4")]));
      const synthese = lignes(wb, "Synthèse jour");

      const bloc = ligne(synthese, "TOTAL (hors demandes de facture)");
      const facture = ligne(synthese, "TOTAL demandes de facture");
      const reel = ligne(synthese, "= Total réellement encaissé (bloc + demandes de facture)");

      expect(reel.slice(1)).toEqual([4, 5, 444]);
      expect((bloc[3] as number) + (facture[3] as number)).toBe(reel[3]);
      // Et c'est bien la somme de tous les tickets.
      expect(reel[3]).toBe(TOUS.reduce((s, t) => s + t.total_ttc, 0));
    });

    it("les statistiques portent sur l'ensemble des ventes (bloc + facture)", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [demande("t4")]));
      const synthese = lignes(wb, "Synthèse jour");

      expect(ligne(synthese, "Nombre de tickets")[1]).toBe(4);
      expect(ligne(synthese, "Chiffre d'affaires total")[1]).toBe(444);
      expect(ligne(synthese, "Panier moyen")[1]).toBe(111);
      expect(ligne(synthese, "Remise totale accordée")[1]).toBe(16); // (80 − 64) × 1
    });

    it("le ticket reste visible dans « Saisie ventes », marqué « Oui », sans jamais disparaître", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [demande("t4")]));
      const detail = lignes(wb, "Saisie ventes");
      const colNumero = detail[0].indexOf("N° ticket");
      const colFacture = detail[0].indexOf("Facture demandée");

      const parTicket = Object.fromEntries(detail.slice(1).map((r) => [r[colNumero], r[colFacture]]));
      expect(parTicket).toEqual({ 1: "Non", 2: "Non", 3: "Non", 4: "Oui" });
    });

    it("la feuille « Demandes de facture » liste le client et les produits à facturer", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [demande("t4")]));
      const rows = lignes(wb, "Demandes de facture");
      const entete = rows[0];
      const [, donnees] = rows;
      const val = (col: string) => donnees[entete.indexOf(col)];

      expect(rows).toHaveLength(2); // en-tête + une ligne produit
      expect(val("Nom")).toBe("Dupont");
      expect(val("Prénom")).toBe("Jean");
      expect(val("Email")).toBe("jean.dupont@example.com");
      expect(val("SIRET")).toBe("12345678900012");
      expect(val("Mode de paiement")).toBe("CB");
      expect(val("Désignation")).toBe("Baudrier Pro");
      expect(val("Total ligne")).toBe(250);
      expect(val("Statut ticket")).toBe("Validé");
    });

    it("une ligne par produit vendu quand le ticket en comporte plusieurs", async () => {
      const multi = ticket("t5", 5, "CB", [
        { reference: "A", designation: "Casque", pu: 100, qte: 1 },
        { reference: "B", designation: "Longe", pu: 50, qte: 2 },
      ]);
      const wb = await charger(await generateDailyExport("Chamonix", DATE, [multi], [demande("t5")]));
      expect(lignes(wb, "Demandes de facture")).toHaveLength(3); // en-tête + 2 produits
    });
  });

  describe("tickets annulés", () => {
    const annule = ticket("t9", 9, "CB", [{ reference: "R9", designation: "Erreur de saisie", pu: 500, qte: 1 }], {
      statut: "ANNULE",
      motif_annulation: "Correction",
    });

    it("ne comptent dans aucun total, mais restent visibles dans le détail", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, [...TOUS, annule]));
      const synthese = lignes(wb, "Synthèse jour");
      expect(ligne(synthese, "TOTAL (hors demandes de facture)").slice(1)).toEqual([4, 5, 444]);

      const detail = lignes(wb, "Saisie ventes");
      const colStatut = detail[0].indexOf("Statut");
      expect(detail.slice(1).some((r) => r[colStatut] === "Annulé")).toBe(true);
    });

    it("une demande de facture restée sur un ticket annulé est signalée « NE PAS FACTURER »", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, [...TOUS, annule], [demande("t9")]));
      const rows = lignes(wb, "Demandes de facture");
      const colStatut = rows[0].indexOf("Statut ticket");

      expect(rows[1][colStatut]).toBe("ANNULÉ — NE PAS FACTURER");
    });

    it("et n'est pas comptée dans le total des demandes de facture", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, [...TOUS, annule], [demande("t9")]));
      const synthese = lignes(wb, "Synthèse jour");

      // Le ticket annulé n'est pas « valide » : ni dans le bloc, ni dans les demandes.
      expect(ligne(synthese, "TOTAL demandes de facture").slice(1)).toEqual([0, 0, 0]);
      expect(ligne(synthese, "TOTAL (hors demandes de facture)").slice(1)).toEqual([4, 5, 444]);
    });

    it("après une correction, la demande reportée sur le nouveau ticket est facturable et l'ancienne ne l'est pas", async () => {
      const ancien = ticket("a", 1, "CB", [{ reference: "R", designation: "Baudrier", pu: 250, qte: 1 }], { statut: "ANNULE" });
      const nouveau = ticket("b", 2, "CB", [{ reference: "R", designation: "Baudrier", pu: 500, qte: 1 }], { remplace_ticket_id: "a" });
      const wb = await charger(await generateDailyExport("Chamonix", DATE, [ancien, nouveau], [demande("a"), demande("b")]));
      const rows = lignes(wb, "Demandes de facture");
      const colStatut = rows[0].indexOf("Statut ticket");
      const colNumero = rows[0].indexOf("N° ticket");

      const parNumero = Object.fromEntries(rows.slice(1).map((r) => [r[colNumero], r[colStatut]]));
      expect(parNumero).toEqual({ 1: "ANNULÉ — NE PAS FACTURER", 2: "Validé" });
      expect(ligne(lignes(wb, "Synthèse jour"), "TOTAL demandes de facture").slice(1)).toEqual([1, 1, 500]);
    });
  });

  describe("coordonnées effacées (RGPD) après l'émission de la facture", () => {
    const effacee = demande("t4", {
      client_nom: "",
      client_prenom: "",
      client_adresse: "",
      client_telephone: "",
      client_email: "",
      client_siret: null,
      anonymise_at: "2026-08-15T10:00:00Z",
    });

    it("le client disparaît de la feuille, mais la vente reste détaillée", async () => {
      const wb = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [effacee]));
      const rows = lignes(wb, "Demandes de facture");
      const val = (col: string) => rows[1][rows[0].indexOf(col)];

      expect(val("Nom")).toBe("(coordonnées effacées)");
      for (const col of ["Prénom", "Adresse", "Téléphone", "Email", "SIRET"]) expect(val(col) ?? "").toBe("");
      expect(val("Désignation")).toBe("Baudrier Pro");
      expect(val("Total ligne")).toBe(250);
    });

    it("la vente reste exclue du total en bloc : l'archive ne change pas après l'effacement", async () => {
      const avant = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [demande("t4")]));
      const apres = await charger(await generateDailyExport("Chamonix", DATE, TOUS, [effacee]));

      const total = (wb: ExcelJS.Workbook, libelle: string) => ligne(lignes(wb, "Synthèse jour"), libelle).slice(1);
      for (const libelle of ["TOTAL (hors demandes de facture)", "TOTAL demandes de facture"]) {
        expect(total(apres, libelle)).toEqual(total(avant, libelle));
      }
    });
  });

  it("sans ligne produit, une demande reste listée (ticket introuvable ou vide)", async () => {
    const wb = await charger(await generateDailyExport("Chamonix", DATE, [T1], [demande("inconnu")]));
    const rows = lignes(wb, "Demandes de facture");
    expect(rows).toHaveLength(2);
  });
});

describe("archive complète de l'événement", () => {
  const VEILLE = ticket("v1", 1, "CB", [{ reference: "R", designation: "Casque", pu: 100, qte: 1 }], { vente_date: "2026-07-27" });

  it("rassemble toutes les journées : même règle bloc / demandes de facture, plus la répartition par jour", async () => {
    const wb = await charger(await generateEventArchive("Chamonix", [VEILLE, ...TOUS], [], [], [], [], [demande("t4")]));
    const synthese = lignes(wb, "Synthèse globale");

    expect(ligne(synthese, "TOTAL (hors demandes de facture)").slice(1)).toEqual([4, 5, 294]); // 194 + 100 de la veille
    expect(ligne(synthese, "TOTAL demandes de facture").slice(1)).toEqual([1, 1, 250]);
    expect(ligne(synthese, "= Total réellement encaissé (bloc + demandes de facture)").slice(1)).toEqual([5, 6, 544]);
    expect(ligne(synthese, "27/07/2026")[3]).toBe(100);
    expect(ligne(synthese, "28/07/2026")[3]).toBe(444);
  });

  it("contient la feuille « Demandes de facture » avec l'email du client", async () => {
    const wb = await charger(await generateEventArchive("Chamonix", TOUS, [], [], [], [], [demande("t4")]));
    const rows = lignes(wb, "Demandes de facture");

    expect(rows[0]).toContain("Email");
    expect(rows[1][rows[0].indexOf("Email")]).toBe("jean.dupont@example.com");
  });

  it("sans demande de facture : pas de feuille dédiée", async () => {
    const wb = await charger(await generateEventArchive("Chamonix", TOUS, [], [], [], []));
    expect(nomsFeuilles(wb)).not.toContain("Demandes de facture");
  });
});
