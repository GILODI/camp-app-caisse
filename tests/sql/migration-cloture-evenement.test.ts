import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compter, newEvent, reperes, sqlFile, vendre } from "../helpers/db";

// Ce test rejoue la migration comme Alex l'exécutera : sur la base TELLE QU'ELLE
// EST EN PRODUCTION (le schema.sql de master), pas sur le schéma déjà corrigé.
// C'est ce qui prouve que la migration fait ce qu'elle annonce et ne casse rien.
//
// TEST DE TRANSITION : il compare à l'état de master. Une fois la migration
// exécutée en production ET fusionnée, master contient déjà le correctif et ce
// fichier n'a plus d'objet — le supprimer alors (les tests de cloture.test.ts
// protègent le comportement durablement).
function schemaDeMaster(): string | null {
  try {
    return execSync("git show master:supabase/schema.sql", { encoding: "utf8", cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
const schemaProduction = schemaDeMaster();
const masterADejaLeCorrectif = schemaProduction !== null && /Événement déjà clôturé/.test(schemaProduction);

describe.skipIf(schemaProduction === null)("migration_cloture_evenement.sql, appliquée à l'état de production", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec("create publication supabase_realtime;");
    await db.exec(schemaProduction as string);
  });
  afterAll(async () => {
    await db.close();
  });

  const cloturerEvenement = async (ev: string) => {
    const { aujourdhui } = await reperes(db);
    await db.query(
      "insert into public.clotures (event_id, type, periode, nb_tickets, total_ttc, hash) values ($1,'jour',$2::date,1,1,'x')",
      [ev, aujourdhui]
    );
    await db.query("select * from public.close_event($1::uuid, 'Alex')", [ev]);
  };

  // Sans cette preuve, le test « après migration » ne démontrerait rien : on
  // vérifie d'abord que le défaut existe bien AVANT. Ignoré (et affiché comme tel)
  // dès que master porte déjà le correctif.
  it.skipIf(masterADejaLeCorrectif)("(avant migration) le défaut existe : une vente est acceptée après la clôture de l'événement", async () => {
    const ev = await newEvent(db);
    const { hier2350 } = await reperes(db);
    await vendre(db, ev);
    await cloturerEvenement(ev);

    const v = await vendre(db, ev, { venduLe: hier2350 });
    expect(v.numero).toBe(1); // acceptée : c'est le défaut
    expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(2);
  });

  it("s'exécute sans erreur, et peut être rejouée", async () => {
    await expect(db.exec(sqlFile("migration_cloture_evenement.sql"))).resolves.not.toThrow();
    await expect(db.exec(sqlFile("migration_cloture_evenement.sql"))).resolves.not.toThrow();
  });

  it("ne crée aucune version en double des fonctions modifiées", async () => {
    const r = await db.query<{ nom: string; nb: number }>(
      `select proname as nom, count(*)::int as nb from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and proname in ('create_ticket', 'cancel_ticket') group by proname`
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.nom, x.nb]))).toEqual({ create_ticket: 1, cancel_ticket: 1 });
  });

  it("(après migration) la vente est désormais refusée après la clôture de l'événement", async () => {
    const ev = await newEvent(db);
    const { hier2350 } = await reperes(db);
    await vendre(db, ev);
    await cloturerEvenement(ev);

    await expect(vendre(db, ev, { venduLe: hier2350 })).rejects.toThrow(/Événement déjà clôturé/);
    expect(await compter(db, "select 1 from public.tickets where event_id = $1", [ev])).toBe(1);
  });

  it("les ventes d'un événement non clôturé ne sont pas affectées", async () => {
    const ev = await newEvent(db);
    const a = await vendre(db, ev);
    const b = await vendre(db, ev);
    expect([a.numero, b.numero]).toEqual([1, 2]);
  });

  it("rejouer la migration ne modifie ni ne supprime aucune donnée existante", async () => {
    const avant = await compter(db, "select 1 from public.tickets");
    await db.exec(sqlFile("migration_cloture_evenement.sql"));
    expect(await compter(db, "select 1 from public.tickets")).toBe(avant);
  });
});
