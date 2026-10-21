import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compter, createDb, decale, fermerJour, newEvent, reperes, ticketEnBase, vendre } from "../helpers/db";

const HEURE = 3600_000;
const MINUTE = 60_000;

// Problème d'origine : un ticket était daté du jour où le serveur le REÇOIT. Une
// vente encaissée à 23h50 hors ligne puis transmise le lendemain matin portait
// donc la date du lendemain, et la caisse espèces du premier jour ne
// correspondait plus à ses ventes espèces.
describe("date de la vente = date de l'encaissement", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it("une vente encaissée hier à 23h50, transmise maintenant, est datée d'hier", async () => {
    const ev = await newEvent(db);
    const { hier, hier2350 } = await reperes(db);

    const v = await vendre(db, ev, { venduLe: hier2350 });
    const t = await ticketEnBase(db, v.id);

    expect(v.vente_date).toBe(hier);
    expect(t.vendu_le?.toISOString()).toBe(hier2350);
  });

  it("chaque journée a sa propre numérotation, même quand les ventes arrivent dans le désordre", async () => {
    const ev = await newEvent(db);
    const { hier2350 } = await reperes(db);

    const aujourdhui = await vendre(db, ev);
    const hier = await vendre(db, ev, { venduLe: hier2350 });

    expect(aujourdhui.numero).toBe(1);
    expect(hier.numero).toBe(1);
  });

  it("sans heure de vente, la date est celle du jour, comme avant", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);

    const v = await vendre(db, ev);
    const t = await ticketEnBase(db, v.id);

    expect(v.vente_date).toBe(aujourdhui);
    expect(t.vendu_le).toBeNull();
  });

  it("l'identité d'une vente reste sa référence, pas son heure : un renvoi avec une autre heure retrouve le même ticket", async () => {
    const ev = await newEvent(db);
    const { hier2350 } = await reperes(db);
    const ref = randomUUID();

    const premier = await vendre(db, ev, { ref, venduLe: hier2350 });
    const renvoi = await vendre(db, ev, { ref, venduLe: decale(0) });

    expect(renvoi.id).toBe(premier.id);
    expect(renvoi.vente_date).toBe(premier.vente_date);
    expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(1);
  });

  describe("l'heure d'un téléphone n'est pas fiable : une heure invraisemblable est ignorée", () => {
    it("une heure vieille de 3 jours est ignorée : date du jour, vendu_le vide", async () => {
      const ev = await newEvent(db);
      const { aujourdhui } = await reperes(db);

      const v = await vendre(db, ev, { venduLe: decale(-72 * HEURE) });
      const t = await ticketEnBase(db, v.id);

      expect(v.vente_date).toBe(aujourdhui);
      expect(t.vendu_le).toBeNull();
    });

    it("une heure dans une heure (horloge en avance) est ignorée", async () => {
      const ev = await newEvent(db);
      const { aujourdhui } = await reperes(db);

      const v = await vendre(db, ev, { venduLe: decale(HEURE) });
      const t = await ticketEnBase(db, v.id);

      expect(v.vente_date).toBe(aujourdhui);
      expect(t.vendu_le).toBeNull();
    });

    it("un petit décalage d'horloge (2 minutes d'avance) est toléré", async () => {
      const ev = await newEvent(db);
      const v = await vendre(db, ev, { venduLe: decale(2 * MINUTE) });
      expect((await ticketEnBase(db, v.id)).vendu_le).not.toBeNull();
    });

    it("la limite de 48 h : 47 h est retenu, 49 h est ignoré", async () => {
      const ev = await newEvent(db);
      const retenu = await vendre(db, ev, { venduLe: decale(-47 * HEURE) });
      const ignore = await vendre(db, ev, { venduLe: decale(-49 * HEURE) });

      expect((await ticketEnBase(db, retenu.id)).vendu_le).not.toBeNull();
      expect((await ticketEnBase(db, ignore.id)).vendu_le).toBeNull();
    });
  });

  describe("journées déjà clôturées : on ne les rouvre jamais", () => {
    it("si la journée de la vente est clôturée, la vente est enregistrée aujourd'hui et l'heure réelle est conservée", async () => {
      const ev = await newEvent(db);
      const { aujourdhui, hier, hier2350 } = await reperes(db);
      await fermerJour(db, ev, hier);

      const v = await vendre(db, ev, { venduLe: hier2350 });
      const t = await ticketEnBase(db, v.id);

      expect(v.vente_date).toBe(aujourdhui);
      // L'écart entre la date de la vente et la date d'enregistrement reste visible.
      expect(t.vendu_le?.toISOString()).toBe(hier2350);
    });

    it("la journée clôturée reste intacte : aucun ticket ajouté, compteur inchangé", async () => {
      const ev = await newEvent(db);
      const { hier, hier2350 } = await reperes(db);
      await fermerJour(db, ev, hier);

      await vendre(db, ev, { venduLe: hier2350 });

      expect(await compter(db, "select 1 from public.tickets where event_id = $1 and vente_date = $2::date", [ev, hier])).toBe(0);
      expect(await compter(db, "select 1 from public.ticket_counters where event_id = $1 and vente_date = $2::date", [ev, hier])).toBe(0);
    });

    it("aujourd'hui clôturé mais hier ouvert : une vente d'hier est acceptée sur hier", async () => {
      const ev = await newEvent(db);
      const { aujourdhui, hier, hier2350 } = await reperes(db);
      await fermerJour(db, ev, aujourdhui);

      const v = await vendre(db, ev, { venduLe: hier2350 });
      expect(v.vente_date).toBe(hier);
    });

    it("aujourd'hui clôturé : une vente du jour sans heure est refusée", async () => {
      const ev = await newEvent(db);
      const { aujourdhui } = await reperes(db);
      await fermerJour(db, ev, aujourdhui);

      await expect(vendre(db, ev)).rejects.toThrow(/déjà clôturée/);
    });

    it("hier ET aujourd'hui clôturés : refus net, rien n'est écrit sur une journée figée", async () => {
      const ev = await newEvent(db);
      const { aujourdhui, hier, hier2350 } = await reperes(db);
      await fermerJour(db, ev, hier);
      await fermerJour(db, ev, aujourdhui);

      await expect(vendre(db, ev, { venduLe: hier2350 })).rejects.toThrow(/déjà clôturée/);
      expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(0);
    });
  });
});
