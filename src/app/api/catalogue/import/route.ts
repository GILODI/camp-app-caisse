import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseSpreadsheet, buildCatalogueItems } from "@/lib/catalogueParser";
import { isAdminRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const event_id = formData.get("event_id");
  const referenceCol = formData.get("referenceCol");
  const designationCol = formData.get("designationCol");
  const prixCol = formData.get("prixCol");
  const pvpTtcCol = formData.get("pvpTtcCol");
  const stockCol = formData.get("stockCol");
  const barcodeCol = formData.get("barcodeCol");
  const mode = formData.get("mode"); // "replace" | "append_or_update"

  if (!(file instanceof File) || typeof event_id !== "string") {
    return NextResponse.json({ error: "Fichier ou événement manquant" }, { status: 400 });
  }
  if (typeof referenceCol !== "string" || typeof designationCol !== "string" || typeof prixCol !== "string") {
    return NextResponse.json({ error: "Mapping de colonnes incomplet" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = await parseSpreadsheet(buffer, file.name);
    const { items, errors } = buildCatalogueItems(rows, {
      referenceCol,
      designationCol,
      prixCol,
      pvpTtcCol: typeof pvpTtcCol === "string" && pvpTtcCol ? pvpTtcCol : null,
      stockCol: typeof stockCol === "string" && stockCol ? stockCol : null,
      barcodeCol: typeof barcodeCol === "string" && barcodeCol ? barcodeCol : null,
    });

    if (items.length === 0) {
      return NextResponse.json({ error: "Aucune ligne valide à importer", errors }, { status: 400 });
    }

    if (mode === "replace") {
      const { error: deleteError } = await supabaseServer
        .from("catalogue_items")
        .delete()
        .eq("event_id", event_id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { error: upsertError } = await supabaseServer.from("catalogue_items").upsert(
      items.map((item) => ({ ...item, event_id, updated_at: new Date().toISOString() })),
      { onConflict: "event_id,reference" }
    );

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    return NextResponse.json({ imported: items.length, errors });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
