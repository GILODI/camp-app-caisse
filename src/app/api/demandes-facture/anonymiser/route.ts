import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Efface les coordonnées client d'un événement une fois les factures
// établies dans l'ERP (RGPD : on ne conserve pas des données personnelles
// devenues inutiles). La ligne est conservée — c'est elle qui porte le
// marqueur « facture demandée » qui sort la vente du total à traiter en
// bloc dans les exports ; la supprimer rendrait une archive régénérée
// incohérente avec ce qui a été déclaré à la comptabilité.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const eventId: string = (body.event_id ?? "").trim();
  if (!eventId) return NextResponse.json({ error: "event_id requis" }, { status: 400 });

  // Les colonnes texte sont NOT NULL : on les vide plutôt que de les passer
  // à null. C'est anonymise_at qui fait foi sur l'état de la ligne.
  const { data, error } = await supabaseServer
    .from("demandes_facture")
    .update({
      client_nom: "",
      client_prenom: "",
      client_adresse: "",
      client_telephone: "",
      client_email: "",
      client_siret: null,
      anonymise_at: new Date().toISOString(),
    })
    .eq("event_id", eventId)
    .is("anonymise_at", null)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ anonymisees: data?.length ?? 0 });
}
