import ExcelJS from "exceljs";

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ColumnMapping {
  referenceCol: string;
  designationCol: string;
  prixCol: string;
  pvpTtcCol: string | null;
  stockCol: string | null;
  barcodeCol: string | null;
}

export interface CatalogueRowResult {
  reference: string;
  designation: string;
  prix_ttc: number;
  pvp_ttc: number | null;
  stock_initial: number | null;
  code_barre: string | null;
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

// Décode un buffer CSV en tenant compte de l'encodage. Excel/Notepad sur
// Windows enregistrent souvent en "ANSI" (Windows-1252) plutôt qu'en UTF-8 :
// sans cette détection, les caractères accentués (é, è, ç...) deviennent
// illisibles. On détecte le BOM UTF-8 s'il existe, sinon on retombe sur
// Windows-1252 si le décodage UTF-8 produit des caractères invalides.
function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf-8");
  }
  const asUtf8 = buffer.toString("utf-8");
  if (asUtf8.includes("�")) {
    // Windows-1252 et Latin-1 (ISO-8859-1) coïncident sur les lettres
    // accentuées françaises : latin1 suffit à corriger le cas courant.
    return buffer.toString("latin1");
  }
  return asUtf8;
}

// Détecte le fichier xlsx (Référentiel Stand) ou un CSV de secours, et
// renvoie une structure homogène { headers, rows } quel que soit le format.
export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSheet> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsv(decodeCsvBuffer(buffer));
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
  prixCol: string | null;
  pvpTtcCol: string | null;
  stockCol: string | null;
  barcodeCol: string | null;
} {
  const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) }));

  const find = (predicate: (norm: string) => boolean, exclude?: string | null) =>
    normalized.find((h) => h.raw !== exclude && predicate(h.norm))?.raw ?? null;

  const referenceCol = find(
    (n) => n.includes("reference") || n === "ref" || n.includes("code article") || n.includes("code produit")
  );
  const designationCol = find(
    (n) => n.includes("designation") || n.includes("libelle") || n.includes("nom produit") || n === "produit" || n === "nom"
  );

  // Priorité : une colonne dont l'intitulé indique explicitement le prix
  // remisé/final (celui réellement facturé), avant tout "Prix" générique.
  const prixCol =
    find((n) => n.includes("remise") || n.includes("remis")) ??
    find((n) => n.includes("final")) ??
    find((n) => n.includes("prix ttc")) ??
    find((n) => n.includes("prix"));

  // PVP TTC (prix public avant remise) : colonne distincte de celle déjà
  // choisie comme prix de vente, utile pour le récap fin de journée. "PVC"
  // (Prix de Vente Conseillé) est un intitulé equivalent vu sur le
  // Référentiel Stand réel.
  const pvpTtcCol =
    find((n) => n.includes("pvp") || n === "pvc", prixCol) ??
    find((n) => n.includes("prix ttc") || n.includes("prix"), prixCol);

  // Stock initial (quantité en stock au départ), optionnel.
  const stockCol = find(
    (n) => n.includes("stock") || n.includes("quantite") || n.includes("qte") || n === "qty"
  );

  // Code-barres EAN/UPC/gencod, optionnel. On matche "barr" (pas "code
  // barre" en entier) pour tolérer les coquilles vues sur les fichiers
  // réels (ex. "Code-BARRRE" avec un r en trop).
  const barcodeCol = find(
    (n) => n.includes("ean") || n.includes("barr") || n.includes("gencod") || n.includes("upc") || n === "cab"
  );

  return { referenceCol, designationCol, prixCol, pvpTtcCol, stockCol, barcodeCol };
}

const STRIP_CHARS_RE = new RegExp("[€\\s\\u00A0]", "g");

export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(STRIP_CHARS_RE, "");
  // Le "." n'est un séparateur de milliers (notation française "1.234,56")
  // que si une virgule est aussi présente. Sans virgule, un nombre comme
  // "80.004" vient d'une cellule Excel numérique (notation anglo-saxonne,
  // ici avec un résidu de calcul en amont) : le point est la décimale, il
  // ne faut pas le supprimer sous peine de lire 80,004 comme 80004.
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  }
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
    const prixRaw = row[mapping.prixCol]?.trim();
    const pvpTtcRaw = mapping.pvpTtcCol ? row[mapping.pvpTtcCol]?.trim() : undefined;
    const stockRaw = mapping.stockCol ? row[mapping.stockCol]?.trim() : undefined;
    const barcodeRaw = mapping.barcodeCol ? row[mapping.barcodeCol]?.trim() : undefined;

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
    // PVP TTC est informatif (récap fin de journée) : une valeur absente ou
    // invalide ne bloque pas l'import de la ligne.
    const pvp_ttc = pvpTtcRaw ? parsePrice(pvpTtcRaw) : null;

    // Stock initial optionnel : entier positif, sinon null (produit non suivi).
    let stock_initial: number | null = null;
    if (stockRaw) {
      const n = Math.floor(Number(stockRaw.replace(",", ".")));
      if (Number.isFinite(n) && n >= 0) stock_initial = n;
    }

    // Code-barres optionnel : on ne garde que les chiffres (EAN/UPC), sinon null.
    let code_barre: string | null = null;
    if (barcodeRaw) {
      const digits = barcodeRaw.replace(/\D/g, "");
      if (digits.length >= 8) code_barre = digits;
    }

    items.push({ reference, designation, prix_ttc, pvp_ttc, stock_initial, code_barre });
  });

  return { items, errors };
}
