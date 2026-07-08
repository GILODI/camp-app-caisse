import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet, guessMapping } from "@/lib/catalogueParser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { sheetName, headers, rows } = await parseSpreadsheet(buffer, file.name);

    if (headers.length === 0) {
      return NextResponse.json({ error: "Aucune colonne détectée dans le fichier" }, { status: 400 });
    }

    const guessed = guessMapping(headers);

    return NextResponse.json({
      sheetName,
      headers,
      rowCount: rows.length,
      preview: rows.slice(0, 5),
      guessed,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
