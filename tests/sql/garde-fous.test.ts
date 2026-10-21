import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compter, createDb, newEvent, sqlFile, vendre } from "../helpers/db";

// Fonctions de l'application uniquement : on exclut celles que l'extension
// pgcrypto installe elle-même dans le schéma public (digest, armor…).
const FONCTIONS_APPLI = `
  select p.proname as nom,
         pg_get_function_identity_arguments(p.oid) as args,
         p.proconfig as config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
`;

describe("garde-fous sur la base de données", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
  });
  afterAll(async () => {
    await db.close();
  });

  // La panne qui a touché la production TROIS fois : « Could not choose the best
  // candidate function ». `create or replace function` ne remplace une fonction
  // que si sa liste de paramètres est identique ; sinon l'ancienne subsiste à
  // côté de la nouvelle et l'API ne sait plus laquelle appeler.
  it("aucune fonction de l'application n'existe en plusieurs versions (pas de surcharge ambiguë)", async () => {
    const r = await db.query<{ nom: string; nb: number }>(
      `select nom, count(*)::int as nb from (${FONCTIONS_APPLI}) f group by nom having count(*) > 1`
    );
    expect(r.rows).toEqual([]);
  });

  // Avertissement « Function Search Path Mutable » du Security Advisor Supabase.
  it("toutes les fonctions de l'application ont un search_path figé", async () => {
    const r = await db.query<{ nom: string; config: string[] | null }>(FONCTIONS_APPLI);
    const sans = r.rows.filter((f) => !(f.config ?? []).some((c) => c.startsWith("search_path=")));
    expect(sans.map((f) => f.nom)).toEqual([]);
  });

  it("les fonctions appelées par l'application existent toutes", async () => {
    const r = await db.query<{ nom: string }>(`select distinct nom from (${FONCTIONS_APPLI}) f`);
    const presentes = new Set(r.rows.map((f) => f.nom));
    for (const attendue of [
      "create_ticket",
      "create_ticket_idempotent",
      "cancel_ticket",
      "correct_ticket",
      "admin_correct_ticket",
      "close_day",
      "close_event",
      "save_comptage",
      "reset_event_test_data",
    ]) {
      expect(presentes, `fonction manquante : ${attendue}`).toContain(attendue);
    }
  });

  describe("« Vider les données » : réservé aux événements de test", () => {
    const vider = (ev: string) => db.query("select public.reset_event_test_data($1::uuid)", [ev]);

    it("refuse un événement réel, et ses ventes restent intactes", async () => {
      const reel = await newEvent(db, "Coupe du monde", false);
      await vendre(db, reel);

      await expect(vider(reel)).rejects.toThrow(/n'est pas marqué comme événement de test/);
      expect(await compter(db, "select 1 from public.tickets where event_id = $1", [reel])).toBe(1);
    });

    it("refuse un événement inexistant", async () => {
      await expect(vider("00000000-0000-0000-0000-000000000000")).rejects.toThrow(/introuvable/);
    });

    // Régression : demandes_facture référence tickets sans cascade. Faute de la
    // vider AVANT les tickets, le vidage échouait sur une clé étrangère dès
    // qu'une demande de facture existait sur l'événement de test.
    it("vide un événement de test, y compris ses demandes de facture", async () => {
      const test = await newEvent(db, "Event test", true);
      const v = await vendre(db, test);
      await db.query(
        `insert into public.demandes_facture (ticket_id, event_id, client_nom, client_prenom, client_adresse, client_telephone)
         values ($1, $2, 'Dupont', 'Jean', '12 rue des Alpes', '0611223344')`,
        [v.id, test]
      );
      await db.query(
        "insert into public.mouvements_stock (event_id, reference, designation, type, quantite) values ($1, 'R1', 'Casque', 'VOL', 1)",
        [test]
      );
      await db.query("insert into public.caisse_comptages (event_id, type) values ($1, 'initial')", [test]);

      await vider(test);

      expect(await compter(db, "select 1 from public.tickets where event_id = $1", [test])).toBe(0);
      expect(await compter(db, "select 1 from public.demandes_facture where event_id = $1", [test])).toBe(0);
      expect(await compter(db, "select 1 from public.mouvements_stock where event_id = $1", [test])).toBe(0);
      expect(await compter(db, "select 1 from public.caisse_comptages where event_id = $1", [test])).toBe(0);
    });

    it("conserve le catalogue produits, et ne touche à aucun autre événement", async () => {
      const test = await newEvent(db, "Event test", true);
      const reel = await newEvent(db, "Chamonix", false);
      await db.query(
        "insert into public.catalogue_items (event_id, reference, designation, prix_ttc) values ($1, 'R1', 'Casque', 100)",
        [test]
      );
      await vendre(db, test);
      await vendre(db, reel);
      await vendre(db, reel);

      await vider(test);

      expect(await compter(db, "select 1 from public.catalogue_items where event_id = $1", [test])).toBe(1);
      expect(await compter(db, "select 1 from public.tickets where event_id = $1", [reel])).toBe(2);
    });

    it("après un vidage, la numérotation repart à 1", async () => {
      const test = await newEvent(db, "Event test", true);
      await vendre(db, test);
      await vendre(db, test);
      await vider(test);

      expect((await vendre(db, test)).numero).toBe(1);
    });
  });
});

// La migration qui a changé la signature de create_ticket est la plus risquée
// de toutes (cf. la panne ci-dessus). Elle porte son propre filet de sécurité :
// un contrôle final qui annule TOUT s'il reste plus d'une version de la fonction.
describe("migration_vente_date_reelle.sql : filet de sécurité", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it("peut être rejouée sans erreur sur le schéma à jour, et laisse une seule version de chaque fonction", async () => {
    await expect(db.exec(sqlFile("migration_vente_date_reelle.sql"))).resolves.not.toThrow();

    const r = await db.query<{ nom: string; nb: number }>(
      `select nom, count(*)::int as nb from (${FONCTIONS_APPLI}) f
        where nom in ('create_ticket', 'create_ticket_idempotent') group by nom`
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.nom, x.nb]))).toEqual({ create_ticket: 1, create_ticket_idempotent: 1 });
  });

  it("s'annule entièrement si une version parasite de create_ticket subsiste", async () => {
    // On simule l'ancienne signature oubliée : une version en trop que la migration ne supprime pas.
    await db.exec("create function public.create_ticket(p_parasite integer) returns integer language sql as 'select 1'");

    let erreur = "";
    try {
      await db.exec(sqlFile("migration_vente_date_reelle.sql"));
    } catch (e) {
      erreur = (e as Error).message;
      await db.exec("rollback"); // la transaction interrompue doit être nettoyée avant de continuer
    }
    expect(erreur).toMatch(/Surcharge inattendue/);

    // Rien n'a bougé : la version parasite est toujours là, et la vraie aussi.
    const r = await db.query<{ args: string }>(
      "select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'create_ticket' order by 1"
    );
    expect(r.rows.map((x) => x.args)).toHaveLength(2);
    expect(r.rows.some((x) => x.args === "p_parasite integer")).toBe(true);

    await db.exec("drop function public.create_ticket(integer)");
  });
});
