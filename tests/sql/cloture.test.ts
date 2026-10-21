import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIGNES, compter, createDb, decale, newEvent, reperes, ticketEnBase, vendre } from "../helpers/db";

const HEURE = 3600_000;

// Les clôtures sont ce qui rend la caisse inaltérable (art. 286 I 3° bis CGI) :
// une journée clôturée est figée, plus rien ne peut y être ajouté, corrigé ni
// annulé. Ces tests utilisent les VRAIES fonctions close_day / close_event.
describe("clôtures : journées figées", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
  });
  afterAll(async () => {
    await db.close();
  });

  const cloturerJour = (ev: string, date: string) =>
    db.query<{ nb_tickets: number; total_ttc: string; hash: string }>(
      "select * from public.close_day($1::uuid, $2::date, 'Alex')",
      [ev, date]
    );

  it("close_day fige la journée : nombre de tickets, total des ventes validées et empreinte SHA-256", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    await vendre(db, ev); // 200 €
    const aAnnuler = await vendre(db, ev); // 200 €, annulée ensuite
    await db.query("select public.cancel_ticket($1::uuid, 'Erreur de saisie', 'Alex')", [aAnnuler.id]);

    const c = (await cloturerJour(ev, aujourdhui)).rows[0];

    expect(c.nb_tickets).toBe(2); // les tickets annulés comptent dans l'empreinte (historique complet)
    expect(Number(c.total_ttc)).toBe(200); // mais pas dans le total des ventes
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("l'empreinte est reproductible : mêmes tickets, même empreinte", async () => {
    const evA = await newEvent(db);
    const evB = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    await vendre(db, evA);
    await vendre(db, evB);

    const a = (await cloturerJour(evA, aujourdhui)).rows[0];
    const b = (await cloturerJour(evB, aujourdhui)).rows[0];

    expect(a.hash).toBe(b.hash);
  });

  it("refuse de clôturer une journée sans ticket", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    await expect(cloturerJour(ev, aujourdhui)).rejects.toThrow(/rien à clôturer/);
  });

  it("une journée clôturée refuse une nouvelle vente", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    await vendre(db, ev);
    await cloturerJour(ev, aujourdhui);

    await expect(vendre(db, ev)).rejects.toThrow(/déjà clôturée/);
  });

  it("une journée clôturée refuse l'annulation d'un de ses tickets", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    const v = await vendre(db, ev);
    await cloturerJour(ev, aujourdhui);

    await expect(
      db.query("select public.cancel_ticket($1::uuid, 'Trop tard', 'Alex')", [v.id])
    ).rejects.toThrow(/déjà clôturée/);
    expect((await ticketEnBase(db, v.id)).statut).toBe("VALIDE");
  });

  it("une journée clôturée refuse la correction d'un de ses tickets", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    const v = await vendre(db, ev);
    await cloturerJour(ev, aujourdhui);

    await expect(
      db.query("select * from public.correct_ticket($1::uuid, $2::uuid, 'Alex', 'CB', $3::jsonb, 'Alex')", [
        v.id,
        ev,
        JSON.stringify(LIGNES),
      ])
    ).rejects.toThrow(/clôturée/);
  });

  it("close_event exige que tous les jours de vente soient déjà clôturés", async () => {
    const ev = await newEvent(db);
    await vendre(db, ev);
    await expect(db.query("select * from public.close_event($1::uuid, 'Alex')", [ev])).rejects.toThrow(
      /pas encore clôturé/
    );
  });

  describe("correction d'un ticket : on annule et on recrée, jamais de modification", () => {
    it("l'ancien ticket est annulé, le nouveau le remplace sous un nouveau numéro", async () => {
      const ev = await newEvent(db);
      const original = await vendre(db, ev);

      const r = await db.query<{ id: string; numero: number }>(
        "select id, numero from public.correct_ticket($1::uuid, $2::uuid, 'Alex', 'ESPECES', $3::jsonb, 'Alex')",
        [original.id, ev, JSON.stringify(LIGNES)]
      );
      const nouveau = r.rows[0];

      expect((await ticketEnBase(db, original.id)).statut).toBe("ANNULE");
      const t = await ticketEnBase(db, nouveau.id);
      expect(t.statut).toBe("VALIDE");
      expect(t.remplace_ticket_id).toBe(original.id);
      expect(nouveau.numero).toBe(original.numero + 1);
      // Rien n'est supprimé : l'historique complet reste en base.
      expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(2);
    });

    it("un ticket déjà annulé ne peut pas être annulé une seconde fois", async () => {
      const ev = await newEvent(db);
      const v = await vendre(db, ev);
      await db.query("select public.cancel_ticket($1::uuid, 'Erreur', 'Alex')", [v.id]);

      await expect(
        db.query("select public.cancel_ticket($1::uuid, 'Encore', 'Alex')", [v.id])
      ).rejects.toThrow(/déjà annulé/);
    });
  });

  describe("clôture d'événement", () => {
    it("close_event fige l'événement : nombre de tickets et empreinte", async () => {
      const ev = await newEvent(db);
      const { aujourdhui } = await reperes(db);
      await vendre(db, ev);
      await cloturerJour(ev, aujourdhui);

      const c = await db.query<{ type: string; nb_tickets: number }>(
        "select * from public.close_event($1::uuid, 'Alex')",
        [ev]
      );
      expect(c.rows[0].type).toBe("evenement");
      expect(c.rows[0].nb_tickets).toBe(1);
    });

    // DÉFAUT CONNU, constaté le 19/10/2026 — voir AGENTS.md. create_ticket ne
    // contrôle que les clôtures de JOUR : une fois l'événement clôturé, une vente
    // datée d'un jour sans clôture est encore acceptée, et le nombre de tickets
    // figé par la clôture ne correspond plus à la base.
    //
    // Ce test décrit le comportement ATTENDU. `it.fails` le fait passer tant que
    // le défaut existe ; le jour où il sera corrigé, il passera au rouge et
    // demandera de retirer `.fails` — il ne peut donc pas rester oublié.
    it.fails("après la clôture de l'événement, plus aucune vente n'est acceptée", async () => {
      const ev = await newEvent(db);
      const { aujourdhui, hier2350 } = await reperes(db);
      await vendre(db, ev);
      await cloturerJour(ev, aujourdhui);
      await db.query("select * from public.close_event($1::uuid, 'Alex')", [ev]);

      // Hier n'a jamais été clôturé : c'est la brèche.
      await expect(vendre(db, ev, { venduLe: hier2350 })).rejects.toThrow();
      expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(1);
    });
  });

  it("(contrôle) une heure de vente trop ancienne n'ouvre pas de brèche sur une journée clôturée", async () => {
    const ev = await newEvent(db);
    const { aujourdhui } = await reperes(db);
    await vendre(db, ev);
    await cloturerJour(ev, aujourdhui);

    // Heure invraisemblable → ignorée → date du jour → clôturée → refus.
    await expect(vendre(db, ev, { venduLe: decale(-100 * HEURE) })).rejects.toThrow(/déjà clôturée/);
  });
});
