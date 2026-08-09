"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from "lucide-react";

type RawRow = (string | number | boolean | null)[];

type ParsedTercRow = {
  rowNumber: number;
  sourceType: "item" | "section" | "summary" | "empty";
  serial: string;
  tercCode: string;
  text: string;
  quantity: number | null;
  unit: string;
  materialUnitPrice: number | null;
  laborUnitPrice: number | null;
  materialTotal: number | null;
  laborTotal: number | null;
  dimproCode: string;
  dimproName: string;
  dimproWorkType: string;
  status: "Ellenőrzendő" | "Importálható" | "Kihagyandó";
};

type ColumnMap = {
  serial?: number;
  tercCode?: number;
  text?: number;
  quantity?: number;
  unit?: number;
  materialUnitPrice?: number;
  laborUnitPrice?: number;
  materialTotal?: number;
  laborTotal?: number;
};

const nf = new Intl.NumberFormat("hu-HU");
const money = (value: number | null) => (value === null || Number.isNaN(value) ? "-" : `${nf.format(Math.round(value))} Ft`);

function normalizeCell(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return normalizeCell(value).toLowerCase().replace(/[áà]/g, "a").replace(/[é]/g, "e").replace(/[í]/g, "i").replace(/[óöő]/g, "o").replace(/[úüű]/g, "u");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizeCell(value).replace(/\s/g, "").replace(/Ft/gi, "").replace(/,/g, ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectColumnMap(rows: RawRow[]): { headerRowIndex: number; map: ColumnMap; warnings: string[] } {
  const warnings: string[] = [];
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 25).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score = ["tetelszam", "tetel", "menny", "egyseg", "anyag", "dij"].reduce((sum, key) => sum + (headers.some((header) => header.includes(key)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  const header = rows[bestIndex] ?? [];
  const find = (...needles: string[]) => header.findIndex((cell) => needles.every((needle) => normalizeHeader(cell).includes(needle)));
  const map: ColumnMap = {
    serial: find("ssz"),
    tercCode: find("tetelszam"),
    text: find("tetel", "szoveg"),
    quantity: find("menny"),
    unit: find("egyseg"),
    materialUnitPrice: find("anyag", "egysegar"),
    laborUnitPrice: find("dij", "egysegar"),
    materialTotal: find("anyag", "osszes"),
    laborTotal: find("dij", "osszes"),
  };

  Object.entries(map).forEach(([key, value]) => {
    if (value === -1) {
      delete map[key as keyof ColumnMap];
      warnings.push(`Nem talált oszlop: ${key}`);
    }
  });

  if (bestScore < 3) warnings.push("A fejléc felismerése bizonytalan. Ellenőrizd a nyers TERC táblát.");
  return { headerRowIndex: bestIndex, map, warnings };
}

function createDimproCode(tercCode: string, rowNumber: number) {
  const safe = tercCode.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return safe ? `DIMPRO-TERC-${safe}` : `DIMPRO-IMPORT-${rowNumber}`;
}

function guessWorkType(code: string, text: string) {
  const combined = `${code} ${text}`.toLowerCase();
  if (combined.includes("burkol")) return "Burkolás";
  if (combined.includes("fest")) return "Festés";
  if (combined.includes("beton") || combined.includes("vasbeton")) return "Beton / vasbeton";
  if (combined.includes("fold") || combined.includes("föld")) return "Földmunka";
  if (combined.includes("zsal")) return "Zsaluzás";
  if (combined.includes("szigetel")) return "Szigetelés";
  if (combined.includes("villany") || combined.includes("kábel") || combined.includes("vezeték")) return "Villanyszerelés";
  if (combined.includes("gepesz") || combined.includes("gépész")) return "Gépészet";
  return "Egyéb / kézi besorolás";
}

function parseRows(rows: RawRow[], headerRowIndex: number, map: ColumnMap): ParsedTercRow[] {
  return rows.slice(headerRowIndex + 1).map((row, index) => {
    const rowNumber = headerRowIndex + index + 2;
    const tercCode = normalizeCell(map.tercCode !== undefined ? row[map.tercCode] : "");
    const text = normalizeCell(map.text !== undefined ? row[map.text] : "");
    const quantity = toNumber(map.quantity !== undefined ? row[map.quantity] : null);
    const materialUnitPrice = toNumber(map.materialUnitPrice !== undefined ? row[map.materialUnitPrice] : null);
    const laborUnitPrice = toNumber(map.laborUnitPrice !== undefined ? row[map.laborUnitPrice] : null);
    const materialTotal = toNumber(map.materialTotal !== undefined ? row[map.materialTotal] : null);
    const laborTotal = toNumber(map.laborTotal !== undefined ? row[map.laborTotal] : null);
    const hasPrice = materialUnitPrice !== null || laborUnitPrice !== null || materialTotal !== null || laborTotal !== null;
    const hasItemCode = tercCode.length > 0 && /\d/.test(tercCode);
    const isEmpty = !tercCode && !text && quantity === null && !hasPrice;
    const sourceType: ParsedTercRow["sourceType"] = isEmpty ? "empty" : hasItemCode && text ? "item" : hasPrice ? "summary" : "section";
    return {
      rowNumber,
      sourceType,
      serial: normalizeCell(map.serial !== undefined ? row[map.serial] : ""),
      tercCode,
      text,
      quantity,
      unit: normalizeCell(map.unit !== undefined ? row[map.unit] : ""),
      materialUnitPrice,
      laborUnitPrice,
      materialTotal,
      laborTotal,
      dimproCode: sourceType === "item" ? createDimproCode(tercCode, rowNumber) : "",
      dimproName: sourceType === "item" ? text.slice(0, 90) : "",
      dimproWorkType: sourceType === "item" ? guessWorkType(tercCode, text) : "",
      status: sourceType === "item" ? "Ellenőrzendő" : "Kihagyandó",
    };
  });
}

function makeCsv(rows: ParsedTercRow[]) {
  const header = ["TERC_sor", "TERC_ENGY_kod", "TERC_tetel_szoveg", "Mennyiseg", "Egyseg", "Anyag_egysegar", "Dij_egysegar", "Anyag_osszesen", "Dij_osszesen", "DIMPRO_kod", "DIMPRO_tetelnev", "DIMPRO_munkanem", "Statusz"];
  const exportRows = rows.filter((row) => row.sourceType === "item").map((row) => [row.rowNumber, row.tercCode, row.text, row.quantity ?? "", row.unit, row.materialUnitPrice ?? "", row.laborUnitPrice ?? "", row.materialTotal ?? "", row.laborTotal ?? "", row.dimproCode, row.dimproName, row.dimproWorkType, row.status]);
  return [header, ...exportRows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function TercXlsImportPreprocessorPage() {
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const detected = useMemo(() => (rawRows.length ? detectColumnMap(rawRows) : null), [rawRows]);
  const parsedRows = useMemo(() => (detected ? parseRows(rawRows, detected.headerRowIndex, detected.map) : []), [rawRows, detected]);
  const itemRows = parsedRows.filter((row) => row.sourceType === "item");
  const sectionRows = parsedRows.filter((row) => row.sourceType === "section");
  const summaryRows = parsedRows.filter((row) => row.sourceType === "summary");

  async function handleFile(file: File) {
    setError("");
    setWarnings([]);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error("A fájlban nem található munkalap.");
      const sheet = workbook.Sheets[firstSheet];
      const data = XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1, raw: true, blankrows: false });
      setSheetName(firstSheet);
      setRawRows(data);
      const detection = detectColumnMap(data);
      setWarnings(detection.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült beolvasni a fájlt.");
      setRawRows([]);
    }
  }

  function downloadCsv() {
    const blob = new Blob([makeCsv(parsedRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "terc"}_dimpro_import.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-lime-100 text-lime-700"><FileSpreadsheet size={28} /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-600">DIMPRO költségadatbázis import</p>
                <h1 className="text-3xl font-black tracking-[-0.04em]">TERC .xls előfeldolgozó</h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Régi TERC .xls, modern .xlsx vagy CSV jellegű Excel fájl nyers beolvasása, tételsorok felismerése és DIMPRO import CSV előkészítése.</p>
              </div>
            </div>
            <a href="/koltsegadatbazis" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Vissza a költségadatbázishoz</a>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <aside className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-lime-300 bg-white p-8 text-center shadow-sm hover:bg-lime-50">
              <UploadCloud size={38} className="text-lime-600" />
              <span className="mt-3 text-lg font-black">TERC export feltöltése</span>
              <span className="mt-1 text-sm font-semibold text-slate-500">.xls / .xlsx / .csv jellegű Excel fájl</span>
              <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Állapot</h2>
              <div className="mt-4 grid gap-3">
                <Metric label="Fájl" value={fileName || "nincs"} />
                <Metric label="Munkalap" value={sheetName || "-"} />
                <Metric label="Nyers sor" value={rawRows.length} />
                <Metric label="Felismerhető tételsor" value={itemRows.length} />
                <Metric label="Fejezet / munkanem sor" value={sectionRows.length} />
                <Metric label="Összesítő sor" value={summaryRows.length} />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
              <div className="flex items-center gap-2 font-black"><AlertTriangle size={18} /> Fontos</div>
              <p className="mt-2">Ez előfeldolgozó: a TERC szöveget és árakat beolvassa, de a DIMPRO tételbe emelés előtt minden sort ellenőrizni kell.</p>
            </div>
          </aside>

          <section className="space-y-4">
            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}
            {warnings.length ? <div className="rounded-2xl border border-amber-200 bg-white p-4 text-sm font-bold text-amber-800">{warnings.join(" • ")}</div> : null}

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black">DIMPRO import előnézet</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">A táblázat azokat a sorokat mutatja, amelyeket a rendszer tételsorként ismert fel.</p>
                </div>
                <button onClick={downloadCsv} disabled={!itemRows.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Download size={17} /> DIMPRO import CSV
                </button>
              </div>

              <div className="mt-5 overflow-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1200px] w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase tracking-[0.08em] text-white">
                    <tr>
                      <th className="px-3 py-3">Sor</th>
                      <th className="px-3 py-3">TERC/ÉNGY kód</th>
                      <th className="px-3 py-3">Tétel szöveg</th>
                      <th className="px-3 py-3">Menny.</th>
                      <th className="px-3 py-3">Egység</th>
                      <th className="px-3 py-3">Anyag e.ár</th>
                      <th className="px-3 py-3">Díj e.ár</th>
                      <th className="px-3 py-3">DIMPRO kód</th>
                      <th className="px-3 py-3">Munkanem</th>
                      <th className="px-3 py-3">Státusz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemRows.slice(0, 150).map((row) => (
                      <tr key={`${row.rowNumber}-${row.tercCode}`} className="border-b border-slate-100 align-top hover:bg-slate-50">
                        <td className="px-3 py-3 font-bold text-slate-400">{row.rowNumber}</td>
                        <td className="px-3 py-3 font-black text-slate-900">{row.tercCode}</td>
                        <td className="max-w-[480px] px-3 py-3 font-semibold text-slate-700">{row.text}</td>
                        <td className="px-3 py-3 font-bold">{row.quantity ?? "-"}</td>
                        <td className="px-3 py-3 font-bold">{row.unit}</td>
                        <td className="px-3 py-3 font-bold">{money(row.materialUnitPrice)}</td>
                        <td className="px-3 py-3 font-bold">{money(row.laborUnitPrice)}</td>
                        <td className="px-3 py-3 font-black text-lime-700">{row.dimproCode}</td>
                        <td className="px-3 py-3 font-bold">{row.dimproWorkType}</td>
                        <td className="px-3 py-3"><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800"><CheckCircle2 size={13} /> {row.status}</span></td>
                      </tr>
                    ))}
                    {!itemRows.length ? <tr><td colSpan={10} className="px-4 py-12 text-center font-bold text-slate-400">Tölts fel egy TERC .xls fájlt az előnézethez.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100"><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</div><div className="mt-1 truncate text-sm font-black text-slate-900">{value}</div></div>;
}
