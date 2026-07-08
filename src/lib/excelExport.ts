import ExcelJS from "exceljs";
import type { PaymentMethod, TicketWithItems } from "./types";
import { PAYMENT_METHODS } from "./types";
import { formatDateFR } from "./date";

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
  sheet.columns = [
    { header: "N° ticket", key: "numero", width: 12 },
    { header: "Vendeur", key: "vendeur", width: 16 },
    { header: "Référence", key: "reference", width: 16 },
    { header: "Désignation", key: "designation", width: 32 },
    { header: "Qté", key: "quantite", width: 8 },
    { header: "PU (remisé)", key: "pu", width: 12 },
    { header: "PVP TTC", key: "pvpTtc", width: 12 },
    { header: "Total ligne", key: "totalLigne", width: 14 },
    { header: "Remise", key: "remise", width: 12 },
    { header: "Mode de paiement", key: "modePaiement", width: 18 },
    { header: "Statut", key: "statut", width: 12 },
    { header: "Motif annulation", key: "motif", width: 24 },
  ];
  styleHeaderRow(sheet.getRow(1));

  const labelByMethod = new Map(PAYMENT_METHODS.map((m) => [m.value, m.label]));

  const sorted = [...tickets].sort((a, b) => a.numero - b.numero);

  for (const ticket of sorted) {
    for (const item of ticket.ticket_items) {
      const pvpTtc = item.pvp_ttc === null || item.pvp_ttc === undefined ? null : Number(item.pvp_ttc);
      const remise = pvpTtc === null ? null : (pvpTtc - Number(item.prix_unitaire)) * item.quantite;
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
        row.getCell("remise").numFmt = CURRENCY_FMT;
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
