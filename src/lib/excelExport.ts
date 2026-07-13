import ExcelJS from "exceljs";
import type { CaisseComptage, MouvementStock, PaymentMethod, TicketWithItems } from "./types";
import { DENOMINATIONS, MOUVEMENT_TYPES, PAYMENT_METHODS } from "./types";
import type { CaisseRow } from "./caisseCalc";
import type { StockLine } from "./stock";
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
  tickets: TicketWithItems[]
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

  const valides = tickets.filter((t) => t.statut === "VALIDE");

  buildSyntheseSheet(workbook, eventNom, venteDate, valides);
  buildDetailSheet(workbook, tickets);

  return workbook.xlsx.writeBuffer();
}

function buildSyntheseSheet(
  workbook: ExcelJS.Workbook,
  eventNom: string,
  venteDate: string,
  valides: TicketWithItems[]
) {
  const sheet = workbook.addWorksheet("Synthèse jour");
  sheet.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }];

  sheet.mergeCells("A1:D1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `${eventNom} — ${formatDateFR(venteDate)}`;
  titleCell.font = { bold: true, size: 14 };
  sheet.getRow(1).height = 24;

  // ---- Tableau 1 : totaux par mode de paiement ----
  sheet.getCell("A3").value = "Totaux par mode de paiement";
  sheet.getCell("A3").font = { bold: true, size: 12 };

  const t1Header = sheet.addRow(["Mode de paiement", "Nb tickets", "Nb articles", "Total TTC"]);
  styleHeaderRow(t1Header);

  let totalTickets = 0;
  let totalArticles = 0;
  let totalCA = 0;

  const byMethod = new Map<PaymentMethod, { nbTickets: number; nbArticles: number; total: number }>();
  for (const { value } of PAYMENT_METHODS) byMethod.set(value, { nbTickets: 0, nbArticles: 0, total: 0 });

  for (const ticket of valides) {
    const stats = byMethod.get(ticket.mode_paiement)!;
    stats.nbTickets += 1;
    stats.total += Number(ticket.total_ttc);
    const nbArticles = ticket.ticket_items.reduce((sum, item) => sum + item.quantite, 0);
    stats.nbArticles += nbArticles;

    totalTickets += 1;
    totalArticles += nbArticles;
    totalCA += Number(ticket.total_ttc);
  }

  for (const { value, label } of PAYMENT_METHODS) {
    const stats = byMethod.get(value)!;
    const row = sheet.addRow([label, stats.nbTickets, stats.nbArticles, stats.total]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }

  const totalRow = sheet.addRow(["TOTAL GÉNÉRAL", totalTickets, totalArticles, totalCA]);
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  styleTotalRow(totalRow);

  // ---- Tableau 2 : statistiques rapides ----
  const t2TitleRowIdx = sheet.lastRow!.number + 2;
  sheet.getCell(`A${t2TitleRowIdx}`).value = "Statistiques rapides";
  sheet.getCell(`A${t2TitleRowIdx}`).font = { bold: true, size: 12 };

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

function buildDetailSheet(workbook: ExcelJS.Workbook, tickets: TicketWithItems[]) {
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
      if (ticket.statut === "ANNULE") {
        row.eachCell((cell) => {
          cell.font = { color: { argb: "FF999999" }, italic: true };
        });
      }
    }
  }

  sheet.autoFilter = { from: "A1", to: "L1" };
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
    } else if (l.restant <= 3) {
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
  return workbook.xlsx.writeBuffer();
}

export async function generateMouvementsExport(
  eventNom: string,
  mouvements: MouvementStock[]
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Caisse événementielle C.A.M.P. France";
  workbook.created = new Date();

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
  return workbook.xlsx.writeBuffer();
}
