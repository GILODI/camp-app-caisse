import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lit un fichier SQL du dossier supabase/. Les tests se lancent depuis la
// racine du projet (npm test), d'où process.cwd().
export function sqlFile(name: string): string {
  return readFileSync(resolve(process.cwd(), "supabase", name), "utf8");
}

// Un vrai moteur Postgres, en mémoire, avec le schema.sql COMPLET chargé : les
// tests exercent donc les vraies fonctions SQL de l'application, pas une copie.
// Rien n'est envoyé nulle part, la production n'est jamais touchée.
export async function createDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  // Fourni d'office par Supabase, supposé présent par le schéma.
  await db.exec("create publication supabase_realtime;");
  await db.exec(sqlFile("schema.sql"));
  return db;
}

export interface Vente {
  id: string;
  numero: number;
  vente_date: string;
  total_ttc: number;
}

export const LIGNES = [{ reference: "R1", designation: "Casque", prix_unitaire: 100, quantite: 2 }];

export async function newEvent(db: PGlite, nom = "Événement", isTest = false): Promise<string> {
  const r = await db.query<{ id: string }>(
    "insert into public.events (nom, is_test) values ($1, $2) returning id",
    [nom, isTest]
  );
  return r.rows[0].id;
}

// Enregistre une vente par le chemin normal de l'application
// (create_ticket_idempotent). Chaque appel sans `ref` est une vente nouvelle ;
// rappeler avec la même `ref` simule un renvoi.
export async function vendre(
  db: PGlite,
  eventId: string,
  opts: { ref?: string; venduLe?: string | null; lignes?: unknown[] } = {}
): Promise<Vente> {
  const r = await db.query<Vente>(
    `select id, numero, vente_date::text as vente_date, total_ttc::float8 as total_ttc
       from public.create_ticket_idempotent($1::uuid, $2::uuid, 'Alex', 'CB', $3::jsonb, $4::timestamptz)`,
    [opts.ref ?? randomUUID(), eventId, JSON.stringify(opts.lignes ?? LIGNES), opts.venduLe ?? null]
  );
  return r.rows[0];
}

export interface TicketEnBase {
  vente_date: string;
  vendu_le: Date | null;
  statut: string;
  remplace_ticket_id: string | null;
  client_ref: string | null;
}

export async function ticketEnBase(db: PGlite, id: string): Promise<TicketEnBase> {
  const r = await db.query<TicketEnBase>(
    "select vente_date::text as vente_date, vendu_le, statut, remplace_ticket_id, client_ref from public.tickets where id = $1",
    [id]
  );
  return r.rows[0];
}

export async function compter(db: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ c: number }>(`select count(*)::int as c from (${sql}) q`, params);
  return r.rows[0].c;
}

// Repères de temps calculés PAR LA BASE (fuseau Europe/Paris), pour que les
// tests restent justes quelle que soit l'heure à laquelle on les lance.
export async function reperes(db: PGlite) {
  const r = await db.query<{ aujourdhui: string; hier: string; hier2350: Date }>(
    `select (now() at time zone 'Europe/Paris')::date::text as aujourdhui,
            ((now() at time zone 'Europe/Paris')::date - 1)::text as hier,
            ((((now() at time zone 'Europe/Paris')::date - 1) + time '23:50') at time zone 'Europe/Paris') as hier2350`
  );
  const row = r.rows[0];
  return { aujourdhui: row.aujourdhui, hier: row.hier, hier2350: row.hier2350.toISOString() };
}

// Décalage par rapport à maintenant, en millisecondes (négatif = passé).
export const decale = (ms: number): string => new Date(Date.now() + ms).toISOString();

// Pose une clôture de jour directement, pour mettre la base dans l'état voulu.
export async function fermerJour(db: PGlite, eventId: string, date: string): Promise<void> {
  await db.query(
    `insert into public.clotures (event_id, type, periode, nb_tickets, total_ttc, hash)
     values ($1, 'jour', $2::date, 1, 1, 'test')`,
    [eventId, date]
  );
}
