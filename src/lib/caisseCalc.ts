import { formatDateFR } from "./date";
import type { CaisseComptage } from "./types";

export interface CaisseRow {
  key: string;
  label: string;
  date: string | null;
  total: number;
  recette: number | null;
  especes: number | null;
  ecart: number | null;
}

// Chaîne chaque comptage au précédent (fond initial puis chaque jour dans
// l'ordre chronologique) pour calculer la recette du jour et l'écart avec
// les ventes espèces déjà enregistrées dans l'app. Partagé entre l'écran
// Admin (calcul en direct) et l'export Excel (mêmes chiffres garantis).
export function computeCaisseRows(
  comptages: CaisseComptage[],
  especesParJour: Record<string, number>
): CaisseRow[] {
  const initial = comptages.find((c) => c.type === "initial") ?? null;
  const jours = comptages
    .filter((c) => c.type === "jour" && c.comptage_date)
    .sort((a, b) => (a.comptage_date! < b.comptage_date! ? -1 : 1));

  const rows: CaisseRow[] = [];
  let previousTotal = initial ? Number(initial.total_compte) : null;

  if (initial) {
    rows.push({
      key: "initial",
      label: "Fond initial",
      date: null,
      total: Number(initial.total_compte),
      recette: null,
      especes: null,
      ecart: null,
    });
  }

  for (const j of jours) {
    const total = Number(j.total_compte);
    const recette = previousTotal !== null ? total - previousTotal : null;
    const especes = especesParJour[j.comptage_date!] ?? null;
    const ecart = recette !== null && especes !== null ? recette - especes : null;
    rows.push({ key: j.comptage_date!, label: formatDateFR(j.comptage_date!), date: j.comptage_date, total, recette, especes, ecart });
    previousTotal = total;
  }

  return rows;
}
