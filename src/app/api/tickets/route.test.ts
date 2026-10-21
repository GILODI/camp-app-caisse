import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// La base et le contrôle d'accès sont remplacés : on teste uniquement la
// logique de la route (validation, choix de la fonction SQL, repli).
const { rpc, autorise } = vi.hoisted(() => ({ rpc: vi.fn(), autorise: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: { rpc } }));
vi.mock("@/lib/eventAuth", () => ({ isEventRequestAllowed: autorise }));

import { POST } from "./route";

const REF = "11111111-1111-4111-8111-111111111111";
const HEURE_VENTE = "2026-10-18T21:50:00.000Z";
const TICKET = { id: "t1", numero: 1, vente_date: "2026-10-18", total_ttc: 200 };

const corps = (extra: Record<string, unknown> = {}) => ({
  event_id: "ev",
  vendeur: "Alex",
  mode_paiement: "CB",
  items: [{ reference: "R1", designation: "Casque", prix_unitaire: 100, quantite: 2 }],
  ...extra,
});

const envoyer = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/tickets", { method: "POST", body: JSON.stringify(body) }));

// Programme les réponses successives de la base, dans l'ordre des appels.
type Reponse = { data?: unknown; error?: { code?: string; message: string } };
function programmer(...reponses: Reponse[]) {
  const file = [...reponses];
  rpc.mockImplementation(() => ({
    single: async () => file.shift() ?? { data: null, error: { message: "aucune réponse programmée" } },
  }));
}
const fonctionsAppelees = () => rpc.mock.calls.map((c) => c[0] as string);
const argsAppel = (i: number) => rpc.mock.calls[i][1] as Record<string, unknown>;

const ABSENTE = { error: { code: "PGRST202", message: "Could not find the function" } };

describe("POST /api/tickets", () => {
  beforeEach(() => {
    rpc.mockReset();
    autorise.mockReset();
    autorise.mockResolvedValue(true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("refus avant tout accès à la base", () => {
    it("401 sans le code d'accès de l'événement, et aucune écriture", async () => {
      autorise.mockResolvedValue(false);
      const r = await envoyer(corps({ client_ref: REF }));
      expect(r.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    });

    it.each([
      ["référence de vente mal formée", { client_ref: "pas-un-uuid" }, /Référence de vente invalide/],
      ["date de vente invalide", { vendu_le: "demain matin" }, /Date de vente invalide/],
      ["vendeur manquant", { vendeur: "" }, /Champs requis/],
      ["ticket sans ligne", { items: [] }, /au moins une ligne/],
      ["quantité nulle", { items: [{ reference: "R", designation: "D", prix_unitaire: 1, quantite: 0 }] }, /Ligne de ticket invalide/],
      ["prix négatif", { items: [{ reference: "R", designation: "D", prix_unitaire: -1, quantite: 1 }] }, /Ligne de ticket invalide/],
    ])("400 : %s", async (_nom, extra, message) => {
      const r = await envoyer(corps(extra));
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toMatch(message);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("chemin normal", () => {
    it("avec une référence : appelle la création idempotente, avec l'heure de la vente", async () => {
      programmer({ data: TICKET });
      const r = await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));

      expect(r.status).toBe(201);
      expect(await r.json()).toEqual(TICKET);
      expect(fonctionsAppelees()).toEqual(["create_ticket_idempotent"]);
      expect(argsAppel(0)).toMatchObject({ p_client_ref: REF, p_vendu_le: HEURE_VENTE, p_event_id: "ev", p_vendeur: "Alex" });
    });

    it("sans référence (ancien client) : appelle la création classique", async () => {
      programmer({ data: TICKET });
      const r = await envoyer(corps());

      expect(r.status).toBe(201);
      expect(fonctionsAppelees()).toEqual(["create_ticket"]);
      expect(argsAppel(0)).not.toHaveProperty("p_client_ref");
      expect(argsAppel(0)).not.toHaveProperty("p_vendu_le");
    });

    it("sans référence mais avec l'heure : la transmet à la création classique", async () => {
      programmer({ data: TICKET });
      await envoyer(corps({ vendu_le: HEURE_VENTE }));

      expect(fonctionsAppelees()).toEqual(["create_ticket"]);
      expect(argsAppel(0)).toMatchObject({ p_vendu_le: HEURE_VENTE });
    });
  });

  // Code déployé AVANT la migration SQL : les ventes ne doivent jamais s'arrêter.
  describe("repli quand la base n'a pas encore la fonction ou la signature (PGRST202)", () => {
    it("signature sans heure de vente : réessaie la même fonction sans l'heure, et garde la protection anti-doublon", async () => {
      programmer(ABSENTE, { data: TICKET });
      const r = await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));

      expect(r.status).toBe(201);
      expect(fonctionsAppelees()).toEqual(["create_ticket_idempotent", "create_ticket_idempotent"]);
      expect(argsAppel(0)).toHaveProperty("p_vendu_le");
      expect(argsAppel(1)).not.toHaveProperty("p_vendu_le");
      expect(argsAppel(1)).toMatchObject({ p_client_ref: REF });
    });

    it("fonction idempotente absente : retombe sur la création classique, avec l'heure si possible", async () => {
      programmer(ABSENTE, ABSENTE, { data: TICKET });
      const r = await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));

      expect(r.status).toBe(201);
      expect(fonctionsAppelees()).toEqual(["create_ticket_idempotent", "create_ticket_idempotent", "create_ticket"]);
      expect(argsAppel(2)).toMatchObject({ p_vendu_le: HEURE_VENTE });
    });

    it("toute la chaîne absente : dernier recours sans heure, la vente est enregistrée", async () => {
      programmer(ABSENTE, ABSENTE, ABSENTE, { data: TICKET });
      const r = await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));

      expect(r.status).toBe(201);
      expect(fonctionsAppelees()).toHaveLength(4);
      expect(argsAppel(3)).not.toHaveProperty("p_vendu_le");
      expect(argsAppel(3)).not.toHaveProperty("p_client_ref");
    });

    it("le repli est signalé dans les journaux (la protection est alors réduite)", async () => {
      programmer(ABSENTE, { data: TICKET });
      await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));
      expect(console.warn).toHaveBeenCalled();
    });
  });

  // Le point le plus important : un repli sur une erreur autre que « fonction
  // absente » pourrait créer la vente DEUX fois (la première tentative a pu
  // aboutir en base avant l'erreur).
  describe("aucune autre erreur ne déclenche de nouvelle tentative", () => {
    it.each([
      ["journée clôturée", { code: "P0001", message: "Journée du 2026-10-18 déjà clôturée" }],
      ["violation d'unicité", { code: "23505", message: "duplicate key value" }],
      ["erreur de connexion", { message: "fetch failed" }],
      ["clé de service invalide", { message: "Invalid API key" }],
    ])("%s : une seule tentative, erreur 500 renvoyée au téléphone", async (_nom, error) => {
      programmer({ error });
      const r = await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));

      expect(r.status).toBe(500);
      expect(((await r.json()) as { error: string }).error).toBe(error.message);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("une erreur survenant APRÈS un premier repli n'en déclenche pas un second", async () => {
      programmer(ABSENTE, { error: { code: "P0001", message: "Journée déjà clôturée" } });
      const r = await envoyer(corps({ client_ref: REF, vendu_le: HEURE_VENTE }));

      expect(r.status).toBe(500);
      expect(rpc).toHaveBeenCalledTimes(2);
    });
  });
});
