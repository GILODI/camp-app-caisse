import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { parseSpreadsheet, buildCatalogueItems } from "@/lib/catalogueParser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const event_id = formData.get("event_id");
  const referenceCol = formData.get("referenceCol");
  const designationCol = formData.get("designationCol");
  const categorieCol = formData.get("categorieCol");
  const prixCol = formData.get("prixCol");
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
      categorieCol: typeof categorieCol === "string" && categorieCol ? categorieCol : null,
      prixCol,
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
