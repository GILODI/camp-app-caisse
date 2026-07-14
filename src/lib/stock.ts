// Seuil en-dessous duquel un produit suivi est signalé comme "stock bas"
// (badge orange, alerte à la vente). Rupture (rouge) = restant <= 0.
export const STOCK_LOW_THRESHOLD = 3;

export interface StockLine {
  reference: string;
  designation: string;
  stock_initial: number;
  vendu: number;
  mouvements: number;
  restant: number;
}

interface CatalogueStockRow {
  reference: string;
  designation: string;
  stock_initial: number | null;
}

interface QteRow {
  reference: string;
  quantite: number;
}

// Calcul du stock restant par produit suivi (stock_initial renseigné) :
// restant = stock_initial - quantités vendues - mouvements (vol/dotation/casse).
// Fonction pure, partagée entre le hook client (affichage direct) et la route
// d'export (fichier Excel), pour garantir des chiffres identiques.
export function computeStockLines(
  catalogue: CatalogueStockRow[],
  ventes: QteRow[],
  mouvements: QteRow[]
): StockLine[] {
  const venduByRef = new Map<string, number>();
  for (const v of ventes) venduByRef.set(v.reference, (venduByRef.get(v.reference) ?? 0) + v.quantite);

  const mvtByRef = new Map<string, number>();
  for (const m of mouvements) mvtByRef.set(m.reference, (mvtByRef.get(m.reference) ?? 0) + m.quantite);

  const lines: StockLine[] = [];
  for (const c of catalogue) {
    if (c.stock_initial === null || c.stock_initial === undefined) continue; // produit non suivi
    const vendu = venduByRef.get(c.reference) ?? 0;
    const mvt = mvtByRef.get(c.reference) ?? 0;
    lines.push({
      reference: c.reference,
      designation: c.designation,
      stock_initial: c.stock_initial,
      vendu,
      mouvements: mvt,
      restant: c.stock_initial - vendu - mvt,
    });
  }
  return lines;
}
