import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewTicketPayload } from "./types";

// Le téléphone d'un vendeur peut perdre le réseau à tout moment, y compris
// APRÈS que le serveur a enregistré la vente et AVANT que la confirmation
// arrive. La file d'attente renvoie alors la vente : ces tests garantissent
// qu'un renvoi ne peut ni créer de doublon, ni changer la date de la vente.

const T0 = new Date("2026-10-18T21:50:00.000Z"); // hier 23h50, heure de Paris
const HEURE = 3600_000;

const vente = (): NewTicketPayload => ({
  event_id: "ev",
  vendeur: "Alex",
  mode_paiement: "CB",
  items: [{ reference: "R1", designation: "Casque", prix_unitaire: 100, pvp_ttc: null, prix_modifie: false, quantite: 2 }],
});

interface Recu {
  client_ref?: string;
  vendu_le?: string;
}

// Un serveur factice qui applique la même règle que create_ticket_idempotent :
// la même référence retrouve le même ticket. Il peut « perdre » sa réponse
// après avoir enregistré la vente, ou répondre par un code d'erreur.
function creerServeur() {
  const tickets = new Map<string, { id: string; numero: number }>();
  const recus: Recu[] = [];
  const etat = { reponsesAPerdre: 0, statut: 201 };

  const fetchFactice = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Recu;
    recus.push(body);
    if (etat.statut !== 201) {
      return { ok: false, status: etat.statut, json: async () => ({ error: "refusé" }) };
    }
    const ref = body.client_ref as string;
    let t = tickets.get(ref);
    if (!t) {
      t = { id: `t${tickets.size + 1}`, numero: tickets.size + 1 };
      tickets.set(ref, t);
    }
    if (etat.reponsesAPerdre > 0) {
      etat.reponsesAPerdre--;
      throw new TypeError("Failed to fetch"); // enregistré côté serveur, confirmation perdue
    }
    return { ok: true, status: 201, json: async () => ({ ...t, vente_date: "2026-10-18", total_ttc: 200 }) };
  });

  return { fetchFactice, tickets, recus, etat };
}

type FileTest = {
  submit: (p: NewTicketPayload) => Promise<{ status: string }>;
  getQueue: () => { localId: string; payload: NewTicketPayload; attempts: number; createdAt: number }[];
  flush: () => Promise<void>;
};

describe("file d'attente des ventes hors ligne", () => {
  let stockage: Map<string, string>;
  let serveur: ReturnType<typeof creerServeur>;
  let file: FileTest;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    stockage = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => stockage.get(k) ?? null,
        setItem: (k: string, v: string) => void stockage.set(k, v),
      },
      addEventListener: () => {},
    });
    serveur = creerServeur();
    vi.stubGlobal("fetch", serveur.fetchFactice);

    // Module neuf à chaque test : la file est un singleton.
    vi.resetModules();
    const { getTicketQueue } = await import("./offlineQueue");
    file = getTicketQueue() as unknown as FileTest;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const queueStockee = () => JSON.parse(stockage.get("camp-caisse:ticket-queue") ?? "[]") as ReturnType<FileTest["getQueue"]>;

  describe("une vente qui passe du premier coup", () => {
    it("n'est pas mise en file d'attente", async () => {
      const r = await file.submit(vente());
      expect(r.status).toBe("ok");
      expect(file.getQueue()).toHaveLength(0);
    });

    it("porte dès le premier envoi une référence unique et l'heure de validation", async () => {
      await file.submit(vente());
      const [envoye] = serveur.recus;
      expect(envoye.client_ref).toMatch(/^[0-9a-f-]{36}$/);
      expect(envoye.vendu_le).toBe(T0.toISOString());
    });
  });

  describe("la confirmation se perd après enregistrement côté serveur", () => {
    it("le renvoi ne crée pas de doublon : même référence, un seul ticket côté serveur", async () => {
      serveur.etat.reponsesAPerdre = 1;
      const r = await file.submit(vente());
      expect(r.status).toBe("queued"); // le vendeur voit « en attente »…
      expect(serveur.tickets.size).toBe(1); // …alors que la vente est bien enregistrée

      await file.flush();

      expect(serveur.recus).toHaveLength(2);
      expect(serveur.recus[1].client_ref).toBe(serveur.recus[0].client_ref);
      expect(serveur.tickets.size).toBe(1);
      expect(file.getQueue()).toHaveLength(0);
    });

    it("l'heure de la vente est celle de la validation, pas celle du renvoi", async () => {
      serveur.etat.reponsesAPerdre = 1;
      await file.submit(vente());

      vi.setSystemTime(new Date(T0.getTime() + 9 * HEURE)); // le réseau revient le lendemain matin
      await file.flush();

      expect(serveur.recus[1].vendu_le).toBe(T0.toISOString());
      expect(Date.now() - Date.parse(serveur.recus[1].vendu_le as string)).toBe(9 * HEURE);
    });

    it("plusieurs coupures successives : toujours la même référence et la même heure", async () => {
      serveur.etat.reponsesAPerdre = 3;
      await file.submit(vente());
      for (let i = 1; i <= 3; i++) {
        vi.setSystemTime(new Date(T0.getTime() + i * HEURE));
        await file.flush();
      }

      expect(serveur.recus).toHaveLength(4);
      expect(new Set(serveur.recus.map((r) => r.client_ref)).size).toBe(1);
      expect(new Set(serveur.recus.map((r) => r.vendu_le)).size).toBe(1);
      expect(serveur.tickets.size).toBe(1);
    });
  });

  it("deux ventes distinctes portent deux références différentes", async () => {
    await file.submit(vente());
    await file.submit(vente());
    expect(new Set(serveur.recus.map((r) => r.client_ref)).size).toBe(2);
    expect(serveur.tickets.size).toBe(2);
  });

  describe("tickets déjà en file avant l'introduction de la référence et de l'heure", () => {
    const installer = (payload: Partial<NewTicketPayload>, createdAt: number) =>
      stockage.set(
        "camp-caisse:ticket-queue",
        JSON.stringify([{ localId: "ancien", payload: { ...vente(), ...payload }, attempts: 2, createdAt }])
      );

    it("reçoivent une référence, et l'heure de leur entrée en file (la meilleure information disponible)", async () => {
      const il_y_a_10h = T0.getTime() - 10 * HEURE;
      installer({}, il_y_a_10h);

      await file.flush();

      expect(serveur.recus[0].client_ref).toBeTruthy();
      expect(serveur.recus[0].vendu_le).toBe(new Date(il_y_a_10h).toISOString());
    });

    it("les enregistrent AVANT l'envoi, pour que le renvoi les réutilise", async () => {
      installer({}, T0.getTime() - 3 * HEURE);
      serveur.etat.reponsesAPerdre = 1;

      await file.flush();
      const [enFile] = queueStockee();
      expect(enFile.payload.client_ref).toBe(serveur.recus[0].client_ref);
      expect(enFile.payload.vendu_le).toBe(serveur.recus[0].vendu_le);

      await file.flush();
      expect(serveur.recus[1].client_ref).toBe(serveur.recus[0].client_ref);
      expect(serveur.recus[1].vendu_le).toBe(serveur.recus[0].vendu_le);
      expect(serveur.tickets.size).toBe(1);
    });

    it("conservent leur référence existante et reçoivent seulement l'heure qui manque", async () => {
      const il_y_a_3h = T0.getTime() - 3 * HEURE;
      installer({ client_ref: "cccccccc-0000-4000-8000-000000000001" }, il_y_a_3h);

      await file.flush();

      expect(serveur.recus[0].client_ref).toBe("cccccccc-0000-4000-8000-000000000001");
      expect(serveur.recus[0].vendu_le).toBe(new Date(il_y_a_3h).toISOString());
    });
  });

  // Principe de la caisse : une vente encaissée ne doit jamais disparaître.
  describe("une vente n'est jamais perdue sur un refus temporaire", () => {
    it("un refus d'accès (401, code d'événement absent ou changé) la garde en file", async () => {
      serveur.etat.statut = 401;
      const r = await file.submit(vente());

      expect(r.status).toBe("queued");
      expect(file.getQueue()).toHaveLength(1);

      await file.flush();
      expect(file.getQueue()).toHaveLength(1); // toujours là
      expect(queueStockee()[0].attempts).toBe(1);
    });

    it("elle repart dès que l'accès est rétabli, avec la même référence", async () => {
      serveur.etat.statut = 401;
      await file.submit(vente());

      serveur.etat.statut = 201;
      await file.flush();

      expect(file.getQueue()).toHaveLength(0);
      expect(serveur.tickets.size).toBe(1);
      expect(serveur.recus[1].client_ref).toBe(serveur.recus[0].client_ref);
    });

    it("une erreur serveur (500) la garde en file", async () => {
      serveur.etat.statut = 500;
      const r = await file.submit(vente());

      expect(r.status).toBe("queued");
      expect(file.getQueue()).toHaveLength(1);
    });
  });
});
