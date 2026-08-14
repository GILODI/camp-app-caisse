import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Jamais mise en cache : une réponse servie depuis le cache n'atteindrait
// pas la base et ne compterait donc pas comme activité.
export const dynamic = "force-dynamic";

// Maintient les projets Supabase éveillés. Un projet gratuit se met en pause
// après une période sans activité, et cesse d'être réactivable passé un
// délai. Pour des applications utilisées quelques jours par an, le risque
// est d'arriver devant une base endormie — voire perdue.
//
// Cette tâche couvre AUSSI le projet Prioris, qui est un site statique sans
// fonction serveur : plutôt que de lui en ajouter une, on le pinge d'ici.
// Sa clé anon est publique (elle est servie au navigateur de chaque
// visiteur), il n'y a donc pas de secret en jeu.
//
// Déclenchée par la tâche planifiée Vercel (voir vercel.json).
export async function GET(req: NextRequest) {
  // Si CRON_SECRET est défini côté Vercel, on l'exige. Sans lui la route
  // reste ouverte, ce qui est acceptable : elle ne renvoie aucune donnée.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [caisse, prioris] = await Promise.all([pingCaisse(), pingPrioris()]);

  // 500 si l'un des deux échoue : une tâche planifiée qui échouerait en
  // silence laisserait le projet s'endormir sans que personne ne le sache.
  const ok = caisse.ok && prioris.ok;
  return NextResponse.json({ ok, at: new Date().toISOString(), caisse, prioris }, { status: ok ? 200 : 500 });
}

async function pingCaisse(): Promise<{ ok: boolean; detail?: string }> {
  const { error } = await supabaseServer.from("events").select("id").limit(1);
  if (error) return { ok: false, detail: error.message || error.code || "Erreur Supabase" };
  return { ok: true };
}

// Prioris : simple requête REST authentifiée par sa clé publique. On ne lit
// aucune donnée, seule la requête compte comme activité.
async function pingPrioris(): Promise<{ ok: boolean; detail?: string }> {
  const url = process.env.PRIORIS_SUPABASE_URL;
  const key = process.env.PRIORIS_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: true, detail: "non configuré (ignoré)" };

  try {
    // On vise une vraie table plutôt que la racine de l'API : c'est ce qui
    // sollicite réellement la base, et donc ce qui compte comme activité.
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/tasks?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    // Seul un 2xx atteste que la requête a abouti. Un 401 (clé changée) ou
    // un 5xx (projet en pause) doivent remonter : sinon la tâche
    // « réussirait » sans rien maintenir éveillé.
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
