import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Jamais mise en cache : une réponse servie depuis le cache n'atteindrait
// pas la base et ne compterait donc pas comme activité.
export const dynamic = "force-dynamic";

// Maintient le projet Supabase éveillé. Un projet gratuit se met en pause
// après une période sans activité, et n'est plus réactivable passé un délai
// — pour une caisse utilisée 2 à 3 fois par an, le risque est réel. Une
// requête quotidienne suffit à remettre le compteur à zéro.
//
// Déclenchée par la tâche planifiée Vercel (voir vercel.json).
export async function GET(req: NextRequest) {
  // Si CRON_SECRET est défini côté Vercel, on l'exige. Sans lui la route
  // reste ouverte, ce qui est acceptable : elle ne renvoie aucune donnée et
  // ne fait qu'un comptage trivial.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { data, error } = await supabaseServer.from("events").select("id").limit(1);

  if (error) {
    // On remonte le détail : une tâche planifiée qui échoue en silence
    // laisserait le projet s'endormir sans que personne ne le sache.
    return NextResponse.json(
      { ok: false, error: error.message || error.code || "Erreur Supabase inconnue" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    evenements_visibles: data?.length ?? 0,
  });
}
