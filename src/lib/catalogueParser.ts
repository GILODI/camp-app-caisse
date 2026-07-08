import ExcelJS from "exceljs";

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ColumnMapping {
  referenceCol: string;
  designationCol: string;
  categorieCol: string | null;
  prixCol: string;
}

export interface CatalogueRowResult {
  reference: string;
  designation: string;
  categorie: string | null;
  prix_ttc: number;
}

export interface BuildResult {
  items: CatalogueRowResult[];
  errors: { row: number; message: string }[];
}

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Détecte le fichier xlsx (Référentiel Stand) ou un CSV de secours, et
// renvoie une structure homogène { headers, rows } quel que soit le format.
export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSheet> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsv(buffer.toString("utf-8"));
  }
  return parseXlsx(buffer);
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  let sheet = workbook.worksheets.find((ws) => normalize(ws.name).includes("catalogue"));
  if (!sheet) sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Le fichier ne contient aucune feuille exploitable");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? "").trim());
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const cell = row.getCell(idx + 1);
      let value: unknown = cell.value;
      if (value && typeof value === "object" && "result" in value) {
        // formule Excel : on prend le résultat calculé
        value = (value as { result: unknown }).result;
      }
      const str = value === null || value === undefined ? "" : String(value).trim();
      if (str) hasValue = true;
      record[header] = str;
    });
    if (hasValue) rows.push(record);
  });

  return { sheetName: sheet.name, headers, rows };
}

function parseCsv(text: string): ParsedSheet {
  const cleanText = text.replace(/^﻿/, "");
  const lines = cleanText.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("Fichier CSV vide");

  const delimiter = lines[0].includes(";") ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const value = (fields[idx] ?? "").trim();
      if (value) hasValue = true;
      record[header] = value;
    });
    if (hasValue) rows.push(record);
  }

  return { sheetName: "CSV", headers, rows };
}

// Devine le mapping des colonnes à partir des intitulés — jamais de position
// figée, car ces fichiers évoluent d'un événement à l'autre.
export function guessMapping(headers: string[]): {
  referenceCol: string | null;
  designationCol: string | null;
  categorieCol: string | null;
  prixCol: string | null;
} {
  const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) }));

  const find = (predicate: (norm: string) => boolean) =>
    normalized.find((h) => predicate(h.norm))?.raw ?? null;

  const referenceCol = find(
    (n) => n.includes("reference") || n === "ref" || n.includes("code article") || n.includes("code produit")
  );
  const designationCol = find(
    (n) => n.includes("designation") || n.includes("libelle") || n.includes("nom produit") || n === "produit" || n === "nom"
  );
  const categorieCol = find((n) => n.includes("categorie") || n.includes("famille") || n.includes("rayon"));

  // Priorité : une colonne dont l'intitulé indique explicitement le prix
  // remisé/final (celui réellement facturé), avant tout "Prix" générique.
  const prixCol =
    find((n) => n.includes("remise") || n.includes("remis")) ??
    find((n) => n.includes("final")) ??
    find((n) => n.includes("prix ttc")) ??
    find((n) => n.includes("prix"));

  return { referenceCol, designationCol, categorieCol, prixCol };
}

export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[€\s ]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // sépare milliers "1.234,56"
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function buildCatalogueItems(rows: Record<string, string>[], mapping: ColumnMapping): BuildResult {
  const items: CatalogueRowResult[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // +1 pour l'en-tête, +1 pour l'index 0-based
    const reference = row[mapping.referenceCol]?.trim();
    const designation = row[mapping.designationCol]?.trim();
    const categorie = mapping.categorieCol ? row[mapping.categorieCol]?.trim() || null : null;
    const prixRaw = row[mapping.prixCol]?.trim();

    if (!reference) {
      errors.push({ row: rowNumber, message: "Référence manquante — ligne ignorée" });
      return;
    }
    if (!designation) {
      errors.push({ row: rowNumber, message: `Désignation manquante pour "${reference}" — ligne ignorée` });
      return;
    }
    const prix_ttc = parsePrice(prixRaw ?? "");
    if (prix_ttc === null) {
      errors.push({ row: rowNumber, message: `Prix invalide pour "${reference}" ("${prixRaw}") — ligne ignorée` });
      return;
    }

    items.push({ reference, designation, categorie, prix_ttc });
  });

  return { items, errors };
}
