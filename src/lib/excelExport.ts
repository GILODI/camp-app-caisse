import ExcelJS from "exceljs";
import type { CaisseComptage, DemandeFacture, MouvementStock, PaymentMethod, TicketWithItems } from "./types";
import { DENOMINATIONS, MOUVEMENT_TYPES, PAYMENT_METHODS } from "./types";
import type { CaisseRow } from "./caisseCalc";
import { STOCK_LOW_THRESHOLD, type StockLine } from "./stock";
import { formatDateFR, formatDateTimeFR } from "./date";

const CURRENCY_FMT = '#,##0.00 "€"';

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1A1A1A" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE65100" },
};
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCCCCCC" } },
  bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
  left: { style: "thin", color: { argb: "FFCCCCCC" } },
  right: { style: "thin", color: { argb: "FFCCCCCC" } },
};
const BAND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0EEEA" },
};

export function sanitizeFilenamePart(input: string): string {
  return input
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildExportFilename(eventNom: string, venteDate: string): string {
  return `Caisse_${sanitizeFilenamePart(eventNom)}_${venteDate}.xlsx`;
}

export function buildCaisseExportFilename(eventNom: string): string {
  return `Decompte_Caisse_Especes_${sanitizeFilenamePart(eventNom)}.xlsx`;
}

export function buildStockExportFilename(eventNom: string): string {
  return `Etat_Stock_${sanitizeFilenamePart(eventNom)}.xlsx`;
}

export function buildMouvementsExportFilename(eventNom: string): string {
  return `Mouvements_Stock_${sanitizeFilenamePart(eventNom)}.xlsx`;
}

export function buildEventArchiveFilename(eventNom: string): string {
  return `Archive_${sanitizeFilenamePart(eventNom)}.xlsx`;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
    cell.border = THIN_BORDER;
  });
}

export async function generateDailyExport(
  eventNom: string,
  venteDate: string,
  tickets: TicketWithItems[],
  demandes: DemandeFacture[] = []
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

  const valides = tickets.filter((t) => t.statut === "VALIDE");
  const demandeTicketIds = new Set(demandes.map((d) => d.ticket_id));

  buildSyntheseSheet(workbook, eventNom, venteDate, valides, demandeTicketIds);
  buildDetailSheet(workbook, tickets, demandeTicketIds);
  if (demandes.length > 0) {
    const ticketsById = new Map(tickets.map((t) => [t.id, t]));
    buildDemandesFactureSheet(workbook, demandes, ticketsById);
  }

  return workbook.xlsx.writeBuffer();
}

// Totaux par mode de paiement, en excluant les tickets avec demande de
// facture (traités individuellement dans le système comptable, jamais dans
// le bloc du soir — sinon double comptage). Retourne aussi les totaux par
// mode pour les seules demandes de facture, pour la deuxième table.
function computeByMethod(tickets: TicketWithItems[], excludeIds: Set<string>) {
  const byMethod = new Map<PaymentMethod, { nbTickets: number; nbArticles: number; total: number }>();
  for (const { value } of PAYMENT_METHODS) byMethod.set(value, { nbTickets: 0, nbArticles: 0, total: 0 });
  let totalTickets = 0;
  let totalArticles = 0;
  let totalCA = 0;

  for (const ticket of tickets) {
    if (excludeIds.has(ticket.id)) continue;
    const stats = byMethod.get(ticket.mode_paiement)!;
    stats.nbTickets += 1;
    stats.total += Number(ticket.total_ttc);
    const nbArticles = ticket.ticket_items.reduce((sum, item) => sum + item.quantite, 0);
    stats.nbArticles += nbArticles;

    totalTickets += 1;
    totalArticles += nbArticles;
    totalCA += Number(ticket.total_ttc);
  }

  return { byMethod, totalTickets, totalArticles, totalCA };
}

function writeByMethodTable(sheet: ExcelJS.Worksheet, byMethod: Map<PaymentMethod, { nbTickets: number; nbArticles: number; total: number }>) {
  for (const { value, label } of PAYMENT_METHODS) {
    const stats = byMethod.get(value)!;
    const row = sheet.addRow([label, stats.nbTickets, stats.nbArticles, stats.total]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }
}

function buildSyntheseSheet(
  workbook: ExcelJS.Workbook,
  eventNom: string,
  venteDate: string,
  valides: TicketWithItems[],
  demandeTicketIds: Set<string>
) {
  const sheet = workbook.addWorksheet("Synthèse jour");
  sheet.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }];

  sheet.mergeCells("A1:D1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `${eventNom} — ${formatDateFR(venteDate)}`;
  titleCell.font = { bold: true, size: 14 };
  sheet.getRow(1).height = 24;

  // ---- Tableau 1 : totaux par mode de paiement, à traiter en bloc ----
  // (exclut les ventes avec demande de facture, saisies individuellement
  // dans le système comptable — sinon elles seraient comptées deux fois).
  sheet.getCell("A3").value = "Totaux par mode de paiement — à traiter en bloc";
  sheet.getCell("A3").font = { bold: true, size: 12 };

  const t1Header = sheet.addRow(["Mode de paiement", "Nb tickets", "Nb articles", "Total TTC"]);
  styleHeaderRow(t1Header);

  const bloc = computeByMethod(valides, demandeTicketIds);
  writeByMethodTable(sheet, bloc.byMethod);

  const totalRow = sheet.addRow(["TOTAL (hors demandes de facture)", bloc.totalTickets, bloc.totalArticles, bloc.totalCA]);
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  styleTotalRow(totalRow);

  // ---- Tableau 2 : dont demandes de facture, à saisir individuellement ----
  const facture = computeByMethod(
    valides.filter((t) => demandeTicketIds.has(t.id)),
    new Set()
  );
  let totalCA = bloc.totalCA;
  let totalTickets = bloc.totalTickets;
  let totalArticles = bloc.totalArticles;

  if (demandeTicketIds.size > 0) {
    const t2bTitleRowIdx = sheet.lastRow!.number + 2;
    sheet.getCell(`A${t2bTitleRowIdx}`).value = "Dont : ventes avec demande de facture — à saisir individuellement";
    sheet.getCell(`A${t2bTitleRowIdx}`).font = { bold: true, size: 12 };

    const t2Header = sheet.addRow(["Mode de paiement", "Nb tickets", "Nb articles", "Total TTC"]);
    styleHeaderRow(t2Header);
    writeByMethodTable(sheet, facture.byMethod);

    const factureTotalRow = sheet.addRow(["TOTAL demandes de facture", facture.totalTickets, facture.totalArticles, facture.totalCA]);
    factureTotalRow.getCell(4).numFmt = CURRENCY_FMT;
    styleTotalRow(factureTotalRow);

    const reconcileRow = sheet.addRow([
      "= Total réellement encaissé (bloc + demandes de facture)",
      totalTickets + facture.totalTickets,
      totalArticles + facture.totalArticles,
      totalCA + facture.totalCA,
    ]);
    reconcileRow.getCell(1).font = { italic: true };
    reconcileRow.getCell(4).numFmt = CURRENCY_FMT;
    reconcileRow.eachCell((cell) => (cell.border = THIN_BORDER));

    totalCA += facture.totalCA;
    totalTickets += facture.totalTickets;
    totalArticles += facture.totalArticles;
  }

  // ---- Tableau 3 : statistiques rapides (toutes ventes confondues) ----
  const t3TitleRowIdx = sheet.lastRow!.number + 2;
  sheet.getCell(`A${t3TitleRowIdx}`).value = "Statistiques rapides";
  sheet.getCell(`A${t3TitleRowIdx}`).font = { bold: true, size: 12 };

  const panierMoyen = totalTickets > 0 ? totalCA / totalTickets : 0;

  const statRows: [string, number, string?][] = [
    ["Nombre de tickets", totalTickets],
    ["Nombre total d'articles", totalArticles],
    ["Chiffre d'affaires total", totalCA, CURRENCY_FMT],
    ["Panier moyen", panierMoyen, CURRENCY_FMT],
  ];

  // Remise totale : uniquement si le catalogue fournissait un PVP TTC pour
  // au moins un article vendu (sinon la donnée n'existe simplement pas).
  let hasPvpData = false;
  let totalRemise = 0;
  for (const ticket of valides) {
    for (const item of ticket.ticket_items) {
      if (item.pvp_ttc !== null && item.pvp_ttc !== undefined) {
        hasPvpData = true;
        totalRemise += (Number(item.pvp_ttc) - Number(item.prix_unitaire)) * item.quantite;
      }
    }
  }
  if (hasPvpData) {
    statRows.push(["Remise totale accordée", totalRemise, CURRENCY_FMT]);
  }

  for (const [label, value, fmt] of statRows) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }
}

function buildDetailSheet(workbook: ExcelJS.Workbook, tickets: TicketWithItems[], demandeTicketIds: Set<string>) {
  const sheet = workbook.addWorksheet("Saisie ventes");
  const centered = { alignment: { horizontal: "center" as const } };
  sheet.columns = [
    { header: "N° ticket", key: "numero", width: 12 },
    { header: "Vendeur", key: "vendeur", width: 16, style: centered },
    { header: "Référence", key: "reference", width: 16 },
    { header: "Désignation", key: "designation", width: 32 },
    { header: "Qté", key: "quantite", width: 8, style: centered },
    { header: "PVP TTC", key: "pvpTtc", width: 12 },
    { header: "PU (remisé)", key: "pu", width: 12 },
    { header: "Total ligne", key: "totalLigne", width: 14 },
    { header: "Remise %", key: "remise", width: 12, style: centered },
    { header: "Mode de paiement", key: "modePaiement", width: 18 },
    { header: "Statut", key: "statut", width: 12, style: centered },
    { header: "Facture demandée", key: "factureDemandee", width: 16, style: centered },
    { header: "Motif annulation", key: "motif", width: 24 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

  const sorted = [...tickets].sort((a, b) => a.numero - b.numero);

  // Bande grisée en alternance à chaque changement de ticket, pour repérer
  // au premier coup d'œil où commence/finit chaque ticket sur plusieurs lignes.
  let shadeTicket = false;

  for (const ticket of sorted) {
    shadeTicket = !shadeTicket;
    const factureDemandee = demandeTicketIds.has(ticket.id);
    for (const item of ticket.ticket_items) {
      const pvpTtc = item.pvp_ttc === null || item.pvp_ttc === undefined ? null : Number(item.pvp_ttc);
      // Taux de remise (pas un montant) : indépendant de la quantité, donc
      // identique quel que soit le nombre d'unités vendues sur la ligne.
      const remise = pvpTtc === null || pvpTtc === 0 ? null : (pvpTtc - Number(item.prix_unitaire)) / pvpTtc;
      const row = sheet.addRow({
        numero: ticket.numero,
        vendeur: ticket.vendeur,
        reference: item.reference,
        designation: item.designation,
        quantite: item.quantite,
        pu: Number(item.prix_unitaire),
        pvpTtc,
        totalLigne: Number(item.total_ligne),
        remise,
        modePaiement: labelByMethod.get(ticket.mode_paiement) ?? ticket.mode_paiement,
        statut: ticket.statut === "VALIDE" ? "Validé" : "Annulé",
        factureDemandee: factureDemandee ? "Oui" : "Non",
        motif: ticket.motif_annulation ?? "",
      });
      row.getCell("pu").numFmt = CURRENCY_FMT;
      row.getCell("totalLigne").numFmt = CURRENCY_FMT;
      if (pvpTtc !== null) {
        row.getCell("pvpTtc").numFmt = CURRENCY_FMT;
        row.getCell("remise").numFmt = "0.0%";
      }
      row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        if (shadeTicket) cell.fill = BAND_FILL;
      });
      // Prix modifié à la main (remise ponctuelle) : PU en orange gras + fond
      // clair, pour le repérer d'un coup d'œil au contrôle du soir.
      if (item.prix_modifie) {
        const puCell = row.getCell("pu");
        puCell.font = { color: { argb: "FFE65100" }, bold: true };
        puCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };
      }
      if (factureDemandee) {
        row.getCell("factureDemandee").font = { color: { argb: "FF9A6700" }, bold: true };
      }
      if (ticket.statut === "ANNULE") {
        row.eachCell((cell) => {
          cell.font = { color: { argb: "FF999999" }, italic: true };
        });
      }
    }
  }

  sheet.autoFilter = { from: "A1", to: "M1" };
}

// Coordonnées client + détail produit des tickets avec demande de facture —
// une ligne par (demande, produit), pour ressaisir facilement chaque
// facture individuellement dans le système comptable. Jamais mélangé au
// bloc "Saisie ventes" (voir la colonne "Facture demandée" là-bas pour le
// repérer, et les tableaux de la synthèse pour éviter le double comptage).
function buildDemandesFactureSheet(
  workbook: ExcelJS.Workbook,
  demandes: DemandeFacture[],
  ticketsById: Map<string, TicketWithItems>
) {
  const sheet = workbook.addWorksheet("Demandes de facture");
  const centered = { alignment: { horizontal: "center" as const } };
  const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

  sheet.columns = [
    { header: "Date", key: "date", width: 12, style: centered },
    { header: "N° ticket", key: "numero", width: 12, style: centered },
    { header: "Statut ticket", key: "statut", width: 24, style: centered },
    { header: "Nom", key: "nom", width: 16 },
    { header: "Prénom", key: "prenom", width: 16 },
    { header: "Adresse", key: "adresse", width: 30 },
    { header: "Téléphone", key: "telephone", width: 16 },
    { header: "Email", key: "email", width: 24 },
    { header: "SIRET", key: "siret", width: 16 },
    { header: "Mode de paiement", key: "modePaiement", width: 18 },
    { header: "Référence", key: "reference", width: 16 },
    { header: "Désignation", key: "designation", width: 32 },
    { header: "Qté", key: "quantite", width: 8, style: centered },
    { header: "PU (remisé)", key: "pu", width: 12 },
    { header: "Total ligne", key: "totalLigne", width: 14 },
  ];
  styleHeaderRow(sheet.getRow(1));

  // Ordre de traitement naturel pour celui qui ressaisit les factures :
  // chronologique, puis par numéro de ticket.
  const sorted = [...demandes].sort((a, b) => {
    const ta = ticketsById.get(a.ticket_id);
    const tb = ticketsById.get(b.ticket_id);
    if (!ta || !tb) return ta ? -1 : tb ? 1 : 0;
    if (ta.vente_date !== tb.vente_date) return ta.vente_date < tb.vente_date ? -1 : 1;
    return ta.numero - tb.numero;
  });

  let shade = false;
  for (const demande of sorted) {
    const ticket = ticketsById.get(demande.ticket_id);
    // Un ticket corrigé est annulé puis recréé sous un nouveau numéro : la
    // demande d'origine reste rattachée au ticket annulé, et une copie suit
    // le nouveau ticket. On garde la ligne (jamais de suppression) mais on
    // la signale clairement pour ne surtout pas facturer une vente annulée.
    const annule = ticket?.statut === "ANNULE";
    shade = !shade;
    const baseData = {
      date: ticket ? formatDateFR(ticket.vente_date) : "",
      numero: ticket?.numero ?? "",
      statut: annule ? "ANNULÉ — NE PAS FACTURER" : "Validé",
      // Coordonnées effacées après émission de la facture (RGPD) : la ligne
      // reste, avec le détail des produits, mais le client a disparu.
      nom: demande.anonymise_at ? "(coordonnées effacées)" : demande.client_nom,
      prenom: demande.anonymise_at ? "" : demande.client_prenom,
      adresse: demande.anonymise_at ? "" : demande.client_adresse,
      telephone: demande.anonymise_at ? "" : demande.client_telephone,
      email: demande.anonymise_at ? "" : demande.client_email,
      siret: demande.anonymise_at ? "" : demande.client_siret ?? "",
      modePaiement: ticket ? labelByMethod.get(ticket.mode_paiement) ?? ticket.mode_paiement : "",
    };

    const styleRow = (row: ExcelJS.Row) => {
      row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        if (shade) cell.fill = BAND_FILL;
        if (annule) cell.font = { color: { argb: "FF999999" }, italic: true, strike: true };
      });
      if (annule) {
        const statutCell = row.getCell("statut");
        statutCell.font = { color: { argb: "FFCC0000" }, bold: true };
        statutCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD6D6" } };
      }
    };

    if (!ticket || ticket.ticket_items.length === 0) {
      styleRow(sheet.addRow(baseData));
      continue;
    }

    for (const item of ticket.ticket_items) {
      const row = sheet.addRow({
        ...baseData,
        reference: item.reference,
        designation: item.designation,
        quantite: item.quantite,
        pu: Number(item.prix_unitaire),
        totalLigne: Number(item.total_ligne),
      });
      row.getCell("pu").numFmt = CURRENCY_FMT;
      row.getCell("totalLigne").numFmt = CURRENCY_FMT;
      styleRow(row);
    }
  }

  sheet.autoFilter = { from: "A1", to: "O1" };
}

export async function generateCaisseExport(
  eventNom: string,
  rows: CaisseRow[],
  comptages: CaisseComptage[]
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

  buildCaisseSyntheseSheet(workbook, eventNom, rows);
  buildCaisseDetailSheet(workbook, comptages);

  return workbook.xlsx.writeBuffer();
}

function buildCaisseSyntheseSheet(workbook: ExcelJS.Workbook, eventNom: string, rows: CaisseRow[]) {
  const sheet = workbook.addWorksheet("Synthèse caisse");
  sheet.columns = [{ width: 20 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 14 }];

  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Suivi caisse espèces — ${eventNom}`;
  titleCell.font = { bold: true, size: 14 };
  sheet.getRow(1).height = 24;

  const header = sheet.addRow([
    "Comptage",
    "Total compté (€)",
    "Recette du jour (€)",
    "Espèces déclarées (€)",
    "Écart (€)",
  ]);
  styleHeaderRow(header);

  let totalRecette = 0;
  let totalEspeces = 0;
  let totalEcart = 0;

  for (const r of rows) {
    const row = sheet.addRow([r.label, r.total, r.recette, r.especes, r.ecart]);
    row.getCell(2).numFmt = CURRENCY_FMT;
    if (r.recette !== null) row.getCell(3).numFmt = CURRENCY_FMT;
    if (r.especes !== null) row.getCell(4).numFmt = CURRENCY_FMT;
    if (r.ecart !== null) row.getCell(5).numFmt = CURRENCY_FMT;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
    if (r.ecart !== null && Math.abs(r.ecart) > 0.01) {
      row.getCell(5).font = { color: { argb: "FFCC0000" }, bold: true };
    }
    totalRecette += r.recette ?? 0;
    totalEspeces += r.especes ?? 0;
    totalEcart += r.ecart ?? 0;
  }

  const totalRow = sheet.addRow(["TOTAL ÉVÉNEMENT", null, totalRecette, totalEspeces, totalEcart]);
  totalRow.getCell(3).numFmt = CURRENCY_FMT;
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  totalRow.getCell(5).numFmt = CURRENCY_FMT;
  styleTotalRow(totalRow);
}

function buildCaisseDetailSheet(workbook: ExcelJS.Workbook, comptages: CaisseComptage[]) {
  const sheet = workbook.addWorksheet("Détail comptages");
  const centered = { alignment: { horizontal: "center" as const } };

  sheet.columns = [
    { header: "Comptage", key: "label", width: 18 },
    ...DENOMINATIONS.map((d) => ({ header: d.label, key: d.key, width: 12, style: centered })),
    { header: "Total compté (€)", key: "total", width: 16 },
    { header: "Saisi par", key: "by", width: 16 },
    { header: "Dernière mise à jour", key: "updated", width: 20 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const initial = comptages.find((c) => c.type === "initial") ?? null;
  const jours = comptages
    .filter((c) => c.type === "jour" && c.comptage_date)
    .sort((a, b) => (a.comptage_date! < b.comptage_date! ? -1 : 1));
  const ordered = initial ? [initial, ...jours] : jours;

  for (const c of ordered) {
    const rowData: Record<string, unknown> = {
      label: c.type === "initial" ? "Fond initial" : formatDateFR(c.comptage_date!),
      total: Number(c.total_compte),
      by: c.created_by ?? "",
      updated: formatDateTimeFR(c.updated_at),
    };
    for (const d of DENOMINATIONS) rowData[d.key] = c[d.key];

    const row = sheet.addRow(rowData);
    row.getCell("total").numFmt = CURRENCY_FMT;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }
}

export async function generateStockExport(eventNom: string, lines: StockLine[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

  buildStockSheet(workbook, lines);

  return workbook.xlsx.writeBuffer();
}

function buildStockSheet(workbook: ExcelJS.Workbook, lines: StockLine[]) {
  const sheet = workbook.addWorksheet("État du stock");
  const centered = { alignment: { horizontal: "center" as const } };
  sheet.columns = [
    { header: "Référence", key: "reference", width: 14 },
    { header: "Désignation", key: "designation", width: 40 },
    { header: "Stock initial", key: "stock_initial", width: 14, style: centered },
    { header: "Vendu", key: "vendu", width: 10, style: centered },
    { header: "Vol/dot./casse", key: "mouvements", width: 16, style: centered },
    { header: "Restant", key: "restant", width: 12, style: centered },
  ];
  styleHeaderRow(sheet.getRow(1));

  const sorted = [...lines].sort((a, b) => a.designation.localeCompare(b.designation));
  for (const l of sorted) {
    const row = sheet.addRow({
      reference: l.reference,
      designation: l.designation,
      stock_initial: l.stock_initial,
      vendu: l.vendu,
      mouvements: l.mouvements,
      restant: l.restant,
    });
    row.eachCell((cell) => (cell.border = THIN_BORDER));
    // Restant en rouge si rupture, orange si stock faible.
    if (l.restant <= 0) {
      row.getCell("restant").font = { color: { argb: "FFCC0000" }, bold: true };
    } else if (l.restant <= STOCK_LOW_THRESHOLD) {
      row.getCell("restant").font = { color: { argb: "FFB25000" }, bold: true };
    }
  }

  const totalRow = sheet.addRow({
    reference: "",
    designation: "TOTAL",
    stock_initial: sorted.reduce((s, l) => s + l.stock_initial, 0),
    vendu: sorted.reduce((s, l) => s + l.vendu, 0),
    mouvements: sorted.reduce((s, l) => s + l.mouvements, 0),
    restant: sorted.reduce((s, l) => s + l.restant, 0),
  });
  styleTotalRow(totalRow);

  sheet.autoFilter = { from: "A1", to: "F1" };
}

export async function generateMouvementsExport(
  eventNom: string,
  mouvements: MouvementStock[]
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

  buildMouvementsSheet(workbook, mouvements);

  return workbook.xlsx.writeBuffer();
}

function buildMouvementsSheet(workbook: ExcelJS.Workbook, mouvements: MouvementStock[]) {
  const labelByType = new Map(MOUVEMENT_TYPES.map((t) => [t.value, t.label]));

  const sheet = workbook.addWorksheet("Mouvements de stock");
  const centered = { alignment: { horizontal: "center" as const } };
  sheet.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Référence", key: "reference", width: 14 },
    { header: "Désignation", key: "designation", width: 40 },
    { header: "Type", key: "type", width: 20 },
    { header: "Quantité", key: "quantite", width: 10, style: centered },
    { header: "Motif / bénéficiaire", key: "motif", width: 28 },
    { header: "Saisi par", key: "by", width: 14 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const sorted = [...mouvements].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const m of sorted) {
    const row = sheet.addRow({
      date: formatDateTimeFR(m.created_at),
      reference: m.reference,
      designation: m.designation,
      type: labelByType.get(m.type) ?? m.type,
      quantite: m.quantite,
      motif: m.motif ?? "",
      by: m.created_by ?? "",
    });
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }

  sheet.autoFilter = { from: "A1", to: "G1" };
}

// Archive complète de fin d'événement : un seul fichier avec la synthèse
// globale (toutes dates confondues), le détail de toutes les ventes, l'état
// du stock, les mouvements et la caisse espèces — pour ne plus dépendre de
// N exports séparés une fois l'événement terminé.
export async function generateEventArchive(
  eventNom: string,
  allTickets: TicketWithItems[],
  caisseRows: CaisseRow[],
  comptages: CaisseComptage[],
  stockLines: StockLine[],
  mouvements: MouvementStock[],
  demandes: DemandeFacture[] = []
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

  const valides = allTickets.filter((t) => t.statut === "VALIDE");
  const demandeTicketIds = new Set(demandes.map((d) => d.ticket_id));

  buildArchiveSyntheseSheet(workbook, eventNom, valides, demandeTicketIds);
  buildArchiveDetailSheet(workbook, allTickets, demandeTicketIds);
  if (caisseRows.length > 0) {
    buildCaisseSyntheseSheet(workbook, eventNom, caisseRows);
    buildCaisseDetailSheet(workbook, comptages);
  }
  if (stockLines.length > 0) buildStockSheet(workbook, stockLines);
  if (mouvements.length > 0) buildMouvementsSheet(workbook, mouvements);
  if (demandes.length > 0) {
    const ticketsById = new Map(allTickets.map((t) => [t.id, t]));
    buildDemandesFactureSheet(workbook, demandes, ticketsById);
  }

  return workbook.xlsx.writeBuffer();
}

function buildArchiveSyntheseSheet(
  workbook: ExcelJS.Workbook,
  eventNom: string,
  valides: TicketWithItems[],
  demandeTicketIds: Set<string>
) {
  const sheet = workbook.addWorksheet("Synthèse globale");
  sheet.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }];

  sheet.mergeCells("A1:D1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `${eventNom} — synthèse de l'événement`;
  titleCell.font = { bold: true, size: 14 };
  sheet.getRow(1).height = 24;

  // ---- Tableau 1 : totaux par mode de paiement, à traiter en bloc ----
  // (exclut les ventes avec demande de facture, saisies individuellement
  // dans le système comptable — sinon elles seraient comptées deux fois).
  sheet.getCell("A3").value = "Totaux par mode de paiement — à traiter en bloc";
  sheet.getCell("A3").font = { bold: true, size: 12 };

  const t1Header = sheet.addRow(["Mode de paiement", "Nb tickets", "Nb articles", "Total TTC"]);
  styleHeaderRow(t1Header);

  const bloc = computeByMethod(valides, demandeTicketIds);
  writeByMethodTable(sheet, bloc.byMethod);

  const totalRow = sheet.addRow(["TOTAL (hors demandes de facture)", bloc.totalTickets, bloc.totalArticles, bloc.totalCA]);
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  styleTotalRow(totalRow);

  // ---- Tableau 2 : dont demandes de facture, à saisir individuellement ----
  const facture = computeByMethod(
    valides.filter((t) => demandeTicketIds.has(t.id)),
    new Set()
  );
  let totalCA = bloc.totalCA;
  let totalTickets = bloc.totalTickets;
  let totalArticles = bloc.totalArticles;

  if (demandeTicketIds.size > 0) {
    const t2bTitleRowIdx = sheet.lastRow!.number + 2;
    sheet.getCell(`A${t2bTitleRowIdx}`).value = "Dont : ventes avec demande de facture — à saisir individuellement";
    sheet.getCell(`A${t2bTitleRowIdx}`).font = { bold: true, size: 12 };

    const t2Header = sheet.addRow(["Mode de paiement", "Nb tickets", "Nb articles", "Total TTC"]);
    styleHeaderRow(t2Header);
    writeByMethodTable(sheet, facture.byMethod);

    const factureTotalRow = sheet.addRow(["TOTAL demandes de facture", facture.totalTickets, facture.totalArticles, facture.totalCA]);
    factureTotalRow.getCell(4).numFmt = CURRENCY_FMT;
    styleTotalRow(factureTotalRow);

    const reconcileRow = sheet.addRow([
      "= Total réellement encaissé (bloc + demandes de facture)",
      totalTickets + facture.totalTickets,
      totalArticles + facture.totalArticles,
      totalCA + facture.totalCA,
    ]);
    reconcileRow.getCell(1).font = { italic: true };
    reconcileRow.getCell(4).numFmt = CURRENCY_FMT;
    reconcileRow.eachCell((cell) => (cell.border = THIN_BORDER));

    totalCA += facture.totalCA;
    totalTickets += facture.totalTickets;
    totalArticles += facture.totalArticles;
  }

  // ---- Tableau 3 : répartition par jour (toutes ventes confondues) ----
  const byDate = new Map<string, { nbTickets: number; total: number }>();
  for (const ticket of valides) {
    const dateStats = byDate.get(ticket.vente_date) ?? { nbTickets: 0, total: 0 };
    dateStats.nbTickets += 1;
    dateStats.total += Number(ticket.total_ttc);
    byDate.set(ticket.vente_date, dateStats);
  }

  const t3TitleRowIdx = sheet.lastRow!.number + 2;
  sheet.getCell(`A${t3TitleRowIdx}`).value = "Répartition par jour de vente";
  sheet.getCell(`A${t3TitleRowIdx}`).font = { bold: true, size: 12 };

  const t3Header = sheet.addRow(["Date", "Nb tickets", "", "Total TTC"]);
  styleHeaderRow(t3Header);

  const sortedDates = Array.from(byDate.keys()).sort();
  for (const date of sortedDates) {
    const stats = byDate.get(date)!;
    const row = sheet.addRow([formatDateFR(date), stats.nbTickets, "", stats.total]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }

  // ---- Tableau 4 : statistiques rapides ----
  const t4TitleRowIdx = sheet.lastRow!.number + 2;
  sheet.getCell(`A${t4TitleRowIdx}`).value = "Statistiques rapides";
  sheet.getCell(`A${t4TitleRowIdx}`).font = { bold: true, size: 12 };

  const panierMoyen = totalTickets > 0 ? totalCA / totalTickets : 0;

  const statRows: [string, number, string?][] = [
    ["Nombre de tickets", totalTickets],
    ["Nombre total d'articles", totalArticles],
    ["Chiffre d'affaires total", totalCA, CURRENCY_FMT],
    ["Panier moyen", panierMoyen, CURRENCY_FMT],
  ];

  let hasPvpData = false;
  let totalRemise = 0;
  for (const ticket of valides) {
    for (const item of ticket.ticket_items) {
      if (item.pvp_ttc !== null && item.pvp_ttc !== undefined) {
        hasPvpData = true;
        totalRemise += (Number(item.pvp_ttc) - Number(item.prix_unitaire)) * item.quantite;
      }
    }
  }
  if (hasPvpData) {
    statRows.push(["Remise totale accordée", totalRemise, CURRENCY_FMT]);
  }

  for (const [label, value, fmt] of statRows) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }
}

function buildArchiveDetailSheet(
  workbook: ExcelJS.Workbook,
  tickets: TicketWithItems[],
  demandeTicketIds: Set<string>
) {
  const sheet = workbook.addWorksheet("Saisie ventes");
  const centered = { alignment: { horizontal: "center" as const } };
  sheet.columns = [
    { header: "Date", key: "date", width: 12, style: centered },
    { header: "N° ticket", key: "numero", width: 12 },
    { header: "Vendeur", key: "vendeur", width: 16, style: centered },
    { header: "Référence", key: "reference", width: 16 },
    { header: "Désignation", key: "designation", width: 32 },
    { header: "Qté", key: "quantite", width: 8, style: centered },
    { header: "PVP TTC", key: "pvpTtc", width: 12 },
    { header: "PU (remisé)", key: "pu", width: 12 },
    { header: "Total ligne", key: "totalLigne", width: 14 },
    { header: "Remise %", key: "remise", width: 12, style: centered },
    { header: "Mode de paiement", key: "modePaiement", width: 18 },
    { header: "Statut", key: "statut", width: 12, style: centered },
    { header: "Facture demandée", key: "factureDemandee", width: 16, style: centered },
    { header: "Motif annulation", key: "motif", width: 24 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

  const sorted = [...tickets].sort((a, b) =>
    a.vente_date === b.vente_date ? a.numero - b.numero : a.vente_date < b.vente_date ? -1 : 1
  );

  let shadeTicket = false;
  let lastTicketId: string | null = null;

  for (const ticket of sorted) {
    if (ticket.id !== lastTicketId) {
      shadeTicket = !shadeTicket;
      lastTicketId = ticket.id;
    }
    const factureDemandee = demandeTicketIds.has(ticket.id);
    for (const item of ticket.ticket_items) {
      const pvpTtc = item.pvp_ttc === null || item.pvp_ttc === undefined ? null : Number(item.pvp_ttc);
      const remise = pvpTtc === null || pvpTtc === 0 ? null : (pvpTtc - Number(item.prix_unitaire)) / pvpTtc;
      const row = sheet.addRow({
        date: formatDateFR(ticket.vente_date),
        numero: ticket.numero,
        vendeur: ticket.vendeur,
        reference: item.reference,
        designation: item.designation,
        quantite: item.quantite,
        pu: Number(item.prix_unitaire),
        pvpTtc,
        totalLigne: Number(item.total_ligne),
        remise,
        modePaiement: labelByMethod.get(ticket.mode_paiement) ?? ticket.mode_paiement,
        statut: ticket.statut === "VALIDE" ? "Validé" : "Annulé",
        factureDemandee: factureDemandee ? "Oui" : "Non",
        motif: ticket.motif_annulation ?? "",
      });
      row.getCell("pu").numFmt = CURRENCY_FMT;
      row.getCell("totalLigne").numFmt = CURRENCY_FMT;
      if (pvpTtc !== null) {
        row.getCell("pvpTtc").numFmt = CURRENCY_FMT;
        row.getCell("remise").numFmt = "0.0%";
      }
      row.eachCell((cell) => {
        cell.border = THIN_BORDER;
        if (shadeTicket) cell.fill = BAND_FILL;
      });
      if (item.prix_modifie) {
        const puCell = row.getCell("pu");
        puCell.font = { color: { argb: "FFE65100" }, bold: true };
        puCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0B2" } };
      }
      if (factureDemandee) {
        row.getCell("factureDemandee").font = { color: { argb: "FF9A6700" }, bold: true };
      }
      if (ticket.statut === "ANNULE") {
        row.eachCell((cell) => {
          cell.font = { color: { argb: "FF999999" }, italic: true };
        });
      }
    }
  }

  sheet.autoFilter = { from: "A1", to: "N1" };
}
