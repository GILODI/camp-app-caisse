import { describe, expect, it } from "vitest";
import { STOCK_LOW_THRESHOLD, computeStockLines } from "./stock";

// restant = stock initial − quantités vendues − sorties hors vente (vol, dotation, casse).
// Alimente l'alerte de stock bas à la vente et l'export de l'état du stock.

const catalogue = [
  { reference: "R1", designation: "Casque", stock_initial: 10 },
  { reference: "R2", designation: "Longe", stock_initial: 5 },
  { reference: "R3", designation: "Produit non suivi", stock_initial: null },
];

describe("état du stock", () => {
  it("restant = stock initial − ventes − mouvements (vol, dotation, casse)", () => {
    const lignes = computeStockLines(
      catalogue,
      [
        { reference: "R1", quantite: 2 },
        { reference: "R1", quantite: 1 },
      ],
      [{ reference: "R1", quantite: 4 }]
    );

    const r1 = lignes.find((l) => l.reference === "R1");
    expect(r1).toMatchObject({ stock_initial: 10, vendu: 3, mouvements: 4, restant: 3 });
  });

  it("un produit sans mouvement ni vente garde son stock initial", () => {
    const lignes = computeStockLines(catalogue, [], []);
    expect(lignes.find((l) => l.reference === "R2")?.restant).toBe(5);
  });

  it("un produit non suivi (sans stock initial) n'apparaît pas dans l'état du stock", () => {
    const lignes = computeStockLines(catalogue, [{ reference: "R3", quantite: 7 }], []);
    expect(lignes.map((l) => l.reference)).toEqual(["R1", "R2"]);
  });

  it("une vente d'un produit absent du catalogue est sans effet", () => {
    const lignes = computeStockLines(catalogue, [{ reference: "INCONNU", quantite: 99 }], []);
    expect(lignes.map((l) => l.restant)).toEqual([10, 5]);
  });

  it("le stock peut devenir négatif quand on vend plus que prévu (la vente n'est jamais bloquée)", () => {
    const lignes = computeStockLines(catalogue, [{ reference: "R2", quantite: 8 }], []);
    expect(lignes.find((l) => l.reference === "R2")?.restant).toBe(-3);
  });

  it("un stock initial à zéro est bien suivi (zéro n'est pas « non suivi »)", () => {
    const lignes = computeStockLines([{ reference: "Z", designation: "Épuisé", stock_initial: 0 }], [], []);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].restant).toBe(0);
  });

  it("le seuil de stock bas est fixé à 3", () => {
    expect(STOCK_LOW_THRESHOLD).toBe(3);
  });
});
