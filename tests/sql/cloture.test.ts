import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
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

    // Ancien défaut (constaté le 19/10/2026, corrigé par migration_cloture_evenement) :
    // create_ticket ne contrôlait que les clôtures de JOUR. Une vente datée d'un
    // jour sans clôture était donc acceptée après la clôture de l'événement, et le
    // nombre de tickets figé par la clôture ne correspondait plus à la base.
    describe("après la clôture de l'événement, plus rien ne s'écrit, sur aucun jour", () => {
      // Événement clôturé, avec UNE vente aujourd'hui. Hier n'a jamais eu de
      // clôture de jour : c'est le cas qui échappait au contrôle.
      async function evenementCloture() {
        const ev = await newEvent(db);
        const { aujourdhui } = await reperes(db);
        const vente = await vendre(db, ev);
        await cloturerJour(ev, aujourdhui);
        await db.query("select * from public.close_event($1::uuid, 'Alex')", [ev]);
        return { ev, vente };
      }
      const ticketsEnBase = (ev: string) =>
        compter(db, "select 1 from public.tickets where event_id = $1", [ev]);

      it("une vente datée d'un jour sans clôture est refusée, et rien n'est écrit", async () => {
        const { ev } = await evenementCloture();
        const { hier2350 } = await reperes(db);

        await expect(vendre(db, ev, { venduLe: hier2350 })).rejects.toThrow(/Événement déjà clôturé/);
        expect(await ticketsEnBase(ev)).toBe(1);
      });

      it("une vente sans heure (envoyée par un ancien téléphone) est refusée aussi", async () => {
        const { ev } = await evenementCloture();
        await expect(vendre(db, ev)).rejects.toThrow(/déjà clôtur/);
        expect(await ticketsEnBase(ev)).toBe(1);
      });

      it("le compteur de numérotation n'avance pas sur une vente refusée", async () => {
        const { ev } = await evenementCloture();
        const { hier2350, hier } = await reperes(db);
        await expect(vendre(db, ev, { venduLe: hier2350 })).rejects.toThrow();

        expect(await compter(db, "select 1 from public.ticket_counters where event_id = $1 and vente_date = $2::date", [ev, hier])).toBe(0);
      });

      it("la création classique (ancien code, sans référence) est refusée aussi", async () => {
        const { ev } = await evenementCloture();
        await expect(
          db.query("select * from public.create_ticket($1::uuid, 'A', 'CB', $2::jsonb)", [ev, JSON.stringify(LIGNES)])
        ).rejects.toThrow(/Événement déjà clôturé/);
        expect(await ticketsEnBase(ev)).toBe(1);
      });

      it("l'annulation d'un ticket est refusée", async () => {
        const { vente } = await evenementCloture();
        await expect(
          db.query("select public.cancel_ticket($1::uuid, 'Trop tard', 'Alex')", [vente.id])
        ).rejects.toThrow(/déjà clôtur/);
        expect((await ticketEnBase(db, vente.id)).statut).toBe("VALIDE");
      });

      it("la correction par le vendeur est refusée, sans annuler l'ancien ticket", async () => {
        const { ev, vente } = await evenementCloture();
        await expect(
          db.query("select * from public.correct_ticket($1::uuid, $2::uuid, 'A', 'CB', $3::jsonb, 'A')", [
            vente.id,
            ev,
            JSON.stringify(LIGNES),
          ])
        ).rejects.toThrow(/déjà clôtur/);
        expect((await ticketEnBase(db, vente.id)).statut).toBe("VALIDE");
        expect(await ticketsEnBase(ev)).toBe(1);
      });

      it("la correction par l'administrateur est refusée aussi (elle insère directement, sans create_ticket)", async () => {
        const { ev, vente } = await evenementCloture();
        await expect(
          db.query("select * from public.admin_correct_ticket($1::uuid, 'A', 'CB', $2::jsonb, 'Alex')", [
            vente.id,
            JSON.stringify(LIGNES),
          ])
        ).rejects.toThrow(/déjà clôtur/);
        expect((await ticketEnBase(db, vente.id)).statut).toBe("VALIDE");
        expect(await ticketsEnBase(ev)).toBe(1);
      });

      // Cas des données créées PAR L'ANCIEN DÉFAUT : un ticket vendu après la clôture
      // de l'événement, sur un jour qui n'a jamais eu de clôture de jour. Il n'est
      // protégé que par la clôture d'événement, c'est ce qui rend cette garde
      // nécessaire en plus de celle des jours. On le fabrique par insertion directe,
      // puisque create_ticket refuse désormais de le créer.
      describe("ticket « orphelin » : sur un jour sans clôture, dans un événement clôturé", () => {
        async function evenementAvecOrphelin() {
          const { ev } = await evenementCloture();
          const { hier } = await reperes(db);
          const orphelin = await db.query<{ id: string }>(
            `insert into public.tickets (event_id, numero, vente_date, vendeur, mode_paiement, total_ttc)
             values ($1, 1, $2::date, 'A', 'CB', 10) returning id`,
            [ev, hier]
          );
          await db.query(
            `insert into public.ticket_items (ticket_id, reference, designation, prix_unitaire, quantite)
             values ($1, 'R', 'D', 10, 1)`,
            [orphelin.rows[0].id]
          );
          return { ev, id: orphelin.rows[0].id, hier };
        }

        it("la garde de jour ne le protège pas : il n'existe aucune clôture pour ce jour", async () => {
          const { ev, hier } = await evenementAvecOrphelin();
          expect(await compter(db, "select 1 from public.clotures where event_id = $1 and type = 'jour' and periode = $2::date", [ev, hier])).toBe(0);
        });

        it("son annulation est refusée par la clôture d'événement", async () => {
          const { id } = await evenementAvecOrphelin();
          await expect(
            db.query("select public.cancel_ticket($1::uuid, 'Tentative', 'Alex')", [id])
          ).rejects.toThrow(/Événement déjà clôturé/);
          expect((await ticketEnBase(db, id)).statut).toBe("VALIDE");
        });

        it("sa correction par l'administrateur est refusée aussi", async () => {
          const { ev, id } = await evenementAvecOrphelin();
          await expect(
            db.query("select * from public.admin_correct_ticket($1::uuid, 'A', 'CB', $2::jsonb, 'Alex')", [id, JSON.stringify(LIGNES)])
          ).rejects.toThrow(/Événement déjà clôturé/);
          expect((await ticketEnBase(db, id)).statut).toBe("VALIDE");
          expect(await ticketsEnBase(ev)).toBe(2); // la vente d'origine + l'orphelin, rien de plus
        });

        it("rien n'est supprimé : le ticket orphelin reste en base, intact", async () => {
          const { id } = await evenementAvecOrphelin();
          expect((await ticketEnBase(db, id)).statut).toBe("VALIDE");
        });
      });

      it("le renvoi d'une vente DÉJÀ acceptée reste inoffensif (il retrouve le ticket, sans erreur)", async () => {
        const ev = await newEvent(db);
        const { aujourdhui } = await reperes(db);
        const ref = randomUUID();
        const premier = await vendre(db, ev, { ref });
        await cloturerJour(ev, aujourdhui);
        await db.query("select * from public.close_event($1::uuid, 'Alex')", [ev]);

        const renvoi = await vendre(db, ev, { ref });
        expect(renvoi.id).toBe(premier.id);
        expect(await ticketsEnBase(ev)).toBe(1);
      });

      it("le nombre de tickets figé par la clôture correspond toujours à la base", async () => {
        const { ev } = await evenementCloture();
        const { hier2350 } = await reperes(db);
        await expect(vendre(db, ev, { venduLe: hier2350 })).rejects.toThrow();

        const figes = await db.query<{ nb_tickets: number }>(
          "select nb_tickets from public.clotures where event_id = $1 and type = 'evenement'",
          [ev]
        );
        expect(figes.rows[0].nb_tickets).toBe(await ticketsEnBase(ev));
      });

      it("ne concerne que l'événement clôturé : un autre événement continue de vendre normalement", async () => {
        const { hier2350 } = await reperes(db);
        await evenementCloture();
        const autre = await newEvent(db);

        const v = await vendre(db, autre, { venduLe: hier2350 });
        expect(v.numero).toBe(1);
      });
    });
  });

  it("un événement non clôturé se comporte exactement comme avant (rien n'est bloqué par erreur)", async () => {
    const ev = await newEvent(db);
    const { aujourdhui, hier2350 } = await reperes(db);
    await vendre(db, ev);
    await cloturerJour(ev, aujourdhui); // journée du jour clôturée, mais PAS l'événement

    const v = await vendre(db, ev, { venduLe: hier2350 });
    expect(v.numero).toBe(1);
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
