import { describe, expect, it } from "vitest";
import { computeCaisseRows } from "./caisseCalc";
import type { CaisseComptage } from "./types";

// Le rapprochement de la caisse espèces : on compare l'argent réellement
// compté le soir à ce que les ventes espèces enregistrées auraient dû rapporter.
// Un écart non nul signale une erreur de rendu de monnaie ou un oubli de saisie.

function comptage(type: "initial" | "jour", date: string | null, total: number): CaisseComptage {
  return {
    id: `${type}-${date}`,
    event_id: "ev",
    type,
    comptage_date: date,
    total_compte: total,
    created_by: "Alex",
    created_at: "2026-07-28T20:00:00Z",
    updated_at: "2026-07-28T20:00:00Z",
    nb_billets_50: 0,
    nb_billets_20: 0,
    nb_billets_10: 0,
    nb_billets_5: 0,
    nb_pieces_2: 0,
    nb_pieces_1: 0,
    nb_pieces_050: 0,
    nb_pieces_020: 0,
    nb_pieces_010: 0,
    nb_pieces_005: 0,
  };
}

describe("rapprochement de la caisse espèces", () => {
  it("la recette du jour est l'argent compté moins le comptage précédent", () => {
    const rows = computeCaisseRows(
      [comptage("initial", null, 100), comptage("jour", "2026-07-27", 330), comptage("jour", "2026-07-28", 480)],
      { "2026-07-27": 230, "2026-07-28": 150 }
    );

    expect(rows.map((r) => r.recette)).toEqual([null, 230, 150]);
  });

  it("l'écart est la recette comptée moins les ventes espèces enregistrées", () => {
    const rows = computeCaisseRows(
      [comptage("initial", null, 100), comptage("jour", "2026-07-27", 330)],
      { "2026-07-27": 220 } // 230 € comptés pour 220 € de ventes : 10 € en trop
    );
    expect(rows[1].ecart).toBe(10);
  });

  it("un écart nul signifie que la caisse est juste", () => {
    const rows = computeCaisseRows(
      [comptage("initial", null, 100), comptage("jour", "2026-07-27", 330)],
      { "2026-07-27": 230 }
    );
    expect(rows[1].ecart).toBe(0);
  });

  it("un manque de caisse donne un écart négatif", () => {
    const rows = computeCaisseRows(
      [comptage("initial", null, 100), comptage("jour", "2026-07-27", 300)],
      { "2026-07-27": 230 }
    );
    expect(rows[1].ecart).toBe(-30);
  });

  it("classe les jours dans l'ordre chronologique, quel que soit l'ordre de saisie", () => {
    const rows = computeCaisseRows(
      [comptage("jour", "2026-07-28", 480), comptage("initial", null, 100), comptage("jour", "2026-07-27", 330)],
      { "2026-07-27": 230, "2026-07-28": 150 }
    );
    expect(rows.map((r) => r.key)).toEqual(["initial", "2026-07-27", "2026-07-28"]);
    expect(rows.map((r) => r.ecart)).toEqual([null, 0, 0]);
  });

  it("sans comptage initial, la première recette ne peut pas être calculée (pas d'écart inventé)", () => {
    const rows = computeCaisseRows([comptage("jour", "2026-07-27", 330)], { "2026-07-27": 230 });
    expect(rows[0].recette).toBeNull();
    expect(rows[0].ecart).toBeNull();
  });

  it("sans vente espèces enregistrée ce jour-là, l'écart n'est pas calculé", () => {
    const rows = computeCaisseRows([comptage("initial", null, 100), comptage("jour", "2026-07-27", 330)], {});
    expect(rows[1].recette).toBe(230);
    expect(rows[1].especes).toBeNull();
    expect(rows[1].ecart).toBeNull();
  });

  it("aucun comptage : aucune ligne", () => {
    expect(computeCaisseRows([], {})).toEqual([]);
  });

  it("le total compté est lu tel quel, même quand la base le renvoie en texte (numeric)", () => {
    const initial = { ...comptage("initial", null, 0), total_compte: "100.50" as unknown as number };
    const rows = computeCaisseRows([initial, comptage("jour", "2026-07-27", 330.5)], { "2026-07-27": 230 });
    expect(rows[0].total).toBe(100.5);
    expect(rows[1].recette).toBe(230);
  });
});
