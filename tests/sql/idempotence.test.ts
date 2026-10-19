import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIGNES, compter, createDb, fermerJour, newEvent, reperes, vendre } from "../helpers/db";

// Problème d'origine : quand le réseau lâche, le téléphone renvoie la vente. Si
// le serveur l'avait déjà enregistrée et que seule la confirmation s'est perdue
// en route, le renvoi créait un second ticket — chiffre d'affaires et stock
// comptés deux fois, sans que personne le voie.
describe("création idempotente d'un ticket", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it("un renvoi retrouve le ticket déjà créé au lieu d'en créer un second", async () => {
    const ev = await newEvent(db);
    const ref = randomUUID();

    const premier = await vendre(db, ev, { ref });
    const renvoi = await vendre(db, ev, { ref });
    const troisieme = await vendre(db, ev, { ref });

    expect(renvoi.id).toBe(premier.id);
    expect(renvoi.numero).toBe(premier.numero);
    expect(troisieme.id).toBe(premier.id);
    expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(1);
    expect(await compter(db, "select 1 from public.ticket_items i join public.tickets t on t.id = i.ticket_id where t.event_id = $1", [ev])).toBe(1);
  });

  it("le compteur de numérotation n'avance qu'une fois malgré les renvois", async () => {
    const ev = await newEvent(db);
    const ref = randomUUID();
    await vendre(db, ev, { ref });
    await vendre(db, ev, { ref });

    const suivant = await vendre(db, ev);
    expect(suivant.numero).toBe(2);
  });

  it("deux ventes différentes donnent deux tickets numérotés à la suite", async () => {
    const ev = await newEvent(db);
    const a = await vendre(db, ev);
    const b = await vendre(db, ev);

    expect([a.numero, b.numero]).toEqual([1, 2]);
    expect(a.id).not.toBe(b.id);
  });

  it("deux événements peuvent chacun avoir leur propre vente avec des références différentes", async () => {
    const ev1 = await newEvent(db);
    const ev2 = await newEvent(db);
    const a = await vendre(db, ev1);
    const b = await vendre(db, ev2);

    expect(a.numero).toBe(1);
    expect(b.numero).toBe(1);
  });

  it("un renvoi tardif, après la clôture de la journée, renvoie le ticket existant sans erreur", async () => {
    const ev = await newEvent(db);
    const ref = randomUUID();
    const premier = await vendre(db, ev, { ref });
    const { aujourdhui } = await reperes(db);
    await fermerJour(db, ev, aujourdhui);

    // Une NOUVELLE vente est bien refusée…
    await expect(vendre(db, ev)).rejects.toThrow(/clôturée/);
    // …mais le renvoi d'une vente déjà acceptée doit rester inoffensif.
    const renvoi = await vendre(db, ev, { ref });
    expect(renvoi.id).toBe(premier.id);
  });

  it("refuse une référence de vente absente", async () => {
    const ev = await newEvent(db);
    await expect(
      db.query(
        "select * from public.create_ticket_idempotent(null, $1::uuid, 'A', 'CB', $2::jsonb)",
        [ev, JSON.stringify(LIGNES)]
      )
    ).rejects.toThrow(/Référence de vente requise/);
    expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(0);
  });

  it("un échec en cours de route ne laisse aucune trace, et la vente peut ensuite être rejouée", async () => {
    const ev = await newEvent(db);
    const ref = randomUUID();
    const ligneInvalide = [{ reference: "X", designation: "Y", prix_unitaire: 10, quantite: 0 }];

    await expect(vendre(db, ev, { ref, lignes: ligneInvalide })).rejects.toThrow();
    expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(0);

    const rejouee = await vendre(db, ev, { ref });
    expect(rejouee.numero).toBe(1);
  });

  it("le total est la somme des lignes (prix unitaire × quantité)", async () => {
    const ev = await newEvent(db);
    const v = await vendre(db, ev, {
      lignes: [
        { reference: "A", designation: "A", prix_unitaire: 64, quantite: 1 },
        { reference: "B", designation: "B", prix_unitaire: 15, quantite: 2 },
      ],
    });
    expect(v.total_ttc).toBe(94);
  });

  // Le code actuellement déployé appelle les fonctions avec ces paramètres
  // nommés, sans heure de vente : cela doit continuer à fonctionner.
  it("reste compatible avec les anciens appels (sans heure de vente)", async () => {
    const ev = await newEvent(db);
    const ancienIdempotent = await db.query<{ numero: number }>(
      `select numero from public.create_ticket_idempotent(
         p_client_ref => $1::uuid, p_event_id => $2::uuid, p_vendeur => 'A',
         p_mode_paiement => 'CB', p_items => $3::jsonb)`,
      [randomUUID(), ev, JSON.stringify(LIGNES)]
    );
    const ancienClassique = await db.query<{ numero: number }>(
      `select numero from public.create_ticket(
         p_event_id => $1::uuid, p_vendeur => 'A', p_mode_paiement => 'CB', p_items => $2::jsonb)`,
      [ev, JSON.stringify(LIGNES)]
    );
    expect(ancienIdempotent.rows[0].numero).toBe(1);
    expect(ancienClassique.rows[0].numero).toBe(2);
  });

  it("l'index unique empêche à lui seul d'enregistrer deux fois la même vente (filet de sécurité)", async () => {
    const ev = await newEvent(db);
    const ref = randomUUID();
    await vendre(db, ev, { ref });

    await expect(
      db.query(
        `insert into public.tickets (event_id, numero, vente_date, vendeur, mode_paiement, total_ttc, client_ref)
         values ($1, 99, current_date, 'A', 'CB', 1, $2)`,
        [ev, ref]
      )
    ).rejects.toThrow(/tickets_client_ref_idx/);
  });
});
