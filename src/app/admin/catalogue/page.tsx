"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useActiveEvent, useCatalogue } from "@/lib/hooks";

interface PreviewData {
  sheetName: string;
  headers: string[];
  rowCount: number;
  preview: Record<string, string>[];
  guessed: {
    referenceCol: string | null;
    designationCol: string | null;
    prixCol: string | null;
    pvpTtcCol: string | null;
  };
}

interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

export default function CataloguePage() {
  const { event } = useActiveEvent();
  const { items: catalogue, reload } = useCatalogue(event?.id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState({ referenceCol: "", designationCol: "", prixCol: "", pvpTtcCol: "" });
  const [mode, setMode] = useState<"append_or_update" | "replace">("append_or_update");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFileChange(f: File) {
    setFile(f);
    setResult(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/catalogue/preview", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setPreview(body);
      setMapping({
        referenceCol: body.guessed.referenceCol ?? "",
        designationCol: body.guessed.designationCol ?? "",
        prixCol: body.guessed.prixCol ?? "",
        pvpTtcCol: body.guessed.pvpTtcCol ?? "",
      });
    } catch (err) {
      toast.error((err as Error).message);
      setFile(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !event) return;
    if (!mapping.referenceCol || !mapping.designationCol || !mapping.prixCol) {
      toast.error("Choisis au minimum les colonnes Référence, Désignation et Prix");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("event_id", event.id);
      formData.append("referenceCol", mapping.referenceCol);
      formData.append("designationCol", mapping.designationCol);
      formData.append("prixCol", mapping.prixCol);
      formData.append("pvpTtcCol", mapping.pvpTtcCol);
      formData.append("mode", mode);
      const res = await fetch("/api/catalogue/import", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResult(body);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      reload();
      toast.success(`${body.imported} produit(s) importé(s)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Active d&apos;abord un événement avant d&apos;importer un catalogue.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-4">
      <div>
        <h1 className="text-lg font-bold">Catalogue — {event.nom}</h1>
        <p className="text-sm text-black/60">{catalogue.length} produit(s) actuellement en base.</p>
      </div>

      <div className="space-y-2 rounded-xl border border-black/10 bg-white p-4">
        <p className="text-sm font-medium">
          Importer le Référentiel Stand (.xlsx, onglet Catalogue) ou un CSV de secours
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
          className="w-full text-sm"
        />
      </div>

      {loading && !preview && <p className="text-sm text-black/50">Lecture du fichier…</p>}

      {preview && (
        <div className="space-y-4 rounded-xl border border-black/10 bg-white p-4">
          <p className="text-sm font-medium">
            {preview.rowCount} ligne(s) détectée(s) dans « {preview.sheetName} ». Vérifie la correspondance des
            colonnes :
          </p>

          <MappingSelect
            label="Référence"
            value={mapping.referenceCol}
            headers={preview.headers}
            onChange={(v) => setMapping((m) => ({ ...m, referenceCol: v }))}
          />
          <MappingSelect
            label="Désignation"
            value={mapping.designationCol}
            headers={preview.headers}
            onChange={(v) => setMapping((m) => ({ ...m, designationCol: v }))}
          />
          <MappingSelect
            label="Prix remisé (celui facturé)"
            value={mapping.prixCol}
            headers={preview.headers}
            onChange={(v) => setMapping((m) => ({ ...m, prixCol: v }))}
          />
          <MappingSelect
            label="PVP TTC avant remise (optionnel)"
            value={mapping.pvpTtcCol}
            headers={preview.headers}
            onChange={(v) => setMapping((m) => ({ ...m, pvpTtcCol: v }))}
            optional
          />

          <div>
            <p className="mb-1 text-xs font-medium text-black/50">Aperçu (5 premières lignes)</p>
            <div className="overflow-x-auto rounded-lg border border-black/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-black/5">
                    {preview.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-black/5">
                      {preview.headers.map((h) => (
                        <td key={h} className="whitespace-nowrap px-2 py-1">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-black/50">Mode d&apos;import</p>
            <div className="flex gap-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={mode === "append_or_update"}
                  onChange={() => setMode("append_or_update")}
                />
                Ajouter / mettre à jour
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                Remplacer tout le catalogue
              </label>
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={loading}
            className="w-full rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Import en cours…" : "Confirmer l'import"}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-xl border border-black/10 bg-white p-4">
          <p className="font-semibold text-green-700">{result.imported} produit(s) importé(s) avec succès.</p>
          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-amber-700">{result.errors.length} ligne(s) ignorée(s) :</p>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-black/60">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Ligne {e.row} : {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MappingSelect({
  label,
  value,
  headers,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-black/50">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-black/15 px-3 py-2"
      >
        {optional && <option value="">— Aucune —</option>}
        {!optional && !value && <option value="">Sélectionner…</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}
