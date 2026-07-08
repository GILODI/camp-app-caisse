import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { DENOMINATIONS, type SaveComptagePayload } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let payload: SaveComptagePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { event_id, type, comptage_date, counts, by } = payload;

  if (!event_id || (type !== "initial" && type !== "jour")) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  if (type === "jour" && !comptage_date) {
    return NextResponse.json({ error: "Date requise pour un comptage du jour" }, { status: 400 });
  }
  for (const { key } of DENOMINATIONS) {
    if (!(Number.isInteger(counts?.[key]) && counts[key] >= 0)) {
      return NextResponse.json({ error: `Quantité invalide pour ${key}` }, { status: 400 });
    }
  }

  const { data, error } = await supabaseServer
    .rpc("save_comptage", {
      p_event_id: event_id,
      p_type: type,
      p_comptage_date: type === "initial" ? null : comptage_date,
      p_nb_billets_50: counts.nb_billets_50,
      p_nb_billets_20: counts.nb_billets_20,
      p_nb_billets_10: counts.nb_billets_10,
      p_nb_billets_5: counts.nb_billets_5,
      p_nb_pieces_2: counts.nb_pieces_2,
      p_nb_pieces_1: counts.nb_pieces_1,
      p_nb_pieces_050: counts.nb_pieces_050,
      p_nb_pieces_020: counts.nb_pieces_020,
      p_nb_pieces_010: counts.nb_pieces_010,
      p_nb_pieces_005: counts.nb_pieces_005,
      p_by: by,
    })
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
