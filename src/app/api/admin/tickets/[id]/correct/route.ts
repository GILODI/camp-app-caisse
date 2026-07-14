import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminRequest } from "@/lib/adminAuth";
import type { PaymentMethod } from "@/lib/types";

export const runtime = "nodejs";

interface AdminCorrectPayload {
  mode_paiement: PaymentMethod;
  items: {
    reference: string;
    designation: string;
    prix_unitaire: number;
    pvp_ttc: number | null;
    prix_modifie: boolean;
    quantite: number;
  }[];
  by: string;
  motif?: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  let payload: AdminCorrectPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { mode_paiement, items, by, motif } = payload;

  if (!mode_paiement || !Array.isArray(items) || items.length === 0 || !by) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .rpc("admin_correct_ticket", {
      p_ticket_id: id,
      p_mode_paiement: mode_paiement,
      p_items: items,
      p_by: by,
      ...(motif ? { p_motif: motif } : {}),
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
