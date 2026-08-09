"use client";

import { useMemo, useState } from "react";
import { Download, Search, Table2 } from "lucide-react";
import type { EnergyExpertTable } from "@/components/property-survey/propertySurveyExpertTables";

type Props = {
  tables: EnergyExpertTable[];
  exporting?: boolean;
  onExportWorkbook: () => void;
};

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "Igen" : "Nem";
  if (typeof value === "number") return value.toLocaleString("hu-HU", { maximumFractionDigits: 4 });
  return String(value);
}

function statusTone(value: unknown) {
  const normalized = String(value || "").toLocaleLowerCase("hu-HU");
  if (normalized.includes("rendben") || normalized.includes("validált") || normalized.includes("megfelel")) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (normalized.includes("blokkol") || normalized.includes("hiányzik") || normalized.includes("nem megfelelő")) return "border-rose-300 bg-rose-50 text-rose-800";
  if (normalized.includes("előzetes") || normalized.includes("ellenőrz") || normalized.includes("winwatt")) return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function EnergyExpertTablesPanel({ tables, exporting = false, onExportWorkbook }: Props) {
  const [activeTableId, setActiveTableId] = useState(tables[0]?.id || "general");
  const [query, setQuery] = useState("");
  const activeTable = tables.find((table) => table.id === activeTableId) || tables[0];
  const filteredRows = useMemo(() => {
    if (!activeTable) return [];
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    if (!normalized) return activeTable.rows;
    return activeTable.rows.filter((row) => activeTable.columns.some((column) => valueLabel(row[column.key]).toLocaleLowerCase("hu-HU").includes(normalized)));
  }, [activeTable, query]);

  if (!activeTable) return <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-5 text-sm font-bold text-[var(--survey-muted)]">Nincs megjeleníthető szakértői tábla.</div>;

  return <div className="grid gap-4" data-energy-expert-tables="true">
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><Table2 size={20} /></span><div><div className="text-base font-black">WinWatt-logikájú szakértői táblák</div><div className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-700">A terepi űrlapokból, alaprajzból és számítási motorokból automatikusan felépített ellenőrző táblák. Az Excel kimenet előkészítő adatcsomag, nem natív WinWatt projektfájl.</div></div></div>
        <button type="button" disabled={exporting} onClick={onExportWorkbook} className="survey-action-primary shrink-0 disabled:opacity-50"><Download size={17} /> {exporting ? "Excel készül…" : "Excel munkafüzet"}</button>
      </div>
    </div>

    <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="grid content-start gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">
        {tables.map((table) => <button key={table.id} type="button" data-expert-table-select={table.id} onClick={() => { setActiveTableId(table.id); setQuery(""); }} className={`rounded-xl border px-3 py-3 text-left transition ${activeTable.id === table.id ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-transparent bg-[var(--survey-panel-strong)] text-[var(--survey-text)] hover:border-[var(--survey-border)]"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-black">{table.label}</span><span className="rounded-full border border-current/20 px-2 py-0.5 text-[9px] font-black">{table.rows.length}</span></div><div className={`mt-1 text-[10px] font-semibold leading-4 ${activeTable.id === table.id ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{table.description}</div></button>)}
      </aside>

      <section className="min-w-0 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--survey-border)] p-3">
          <div><div className="text-sm font-black text-[var(--survey-text)]">{activeTable.label}</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">{filteredRows.length} / {activeTable.rows.length} sor</div></div>
          <label className="flex h-10 min-w-[220px] items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3"><Search size={15} className="text-[var(--survey-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Keresés a szakértői táblában" placeholder="Keresés minden oszlopban…" className="min-w-0 flex-1 bg-transparent text-xs font-bold text-[var(--survey-text)] outline-none" /></label>
        </div>
        <div className="max-h-[68vh] overflow-auto" data-expert-table-scroll>
          <table className="min-w-max border-collapse text-left text-[10px]">
            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800 shadow-sm">
              <tr>{activeTable.columns.map((column, index) => <th key={column.key} className={`whitespace-nowrap border-b border-r border-slate-200 px-3 py-2.5 font-black uppercase tracking-[0.05em] ${column.sticky || index === 0 ? "sticky left-0 z-30 bg-slate-100" : ""}`}><span>{column.label}</span>{column.unit ? <span className="ml-1 text-[8px] font-bold text-slate-500">[{column.unit}]</span> : null}</th>)}</tr>
            </thead>
            <tbody>{filteredRows.map((row, rowIndex) => <tr key={row.id} className={rowIndex % 2 ? "bg-[var(--survey-panel-strong)]" : "bg-[var(--survey-panel)]"}>{activeTable.columns.map((column, columnIndex) => {
              const value = row[column.key];
              const statusColumn = column.key.toLocaleLowerCase("hu-HU").includes("status") || column.key === "compliance" || column.key === "dataStatus";
              return <td key={column.key} className={`max-w-[360px] whitespace-nowrap border-b border-r border-[var(--survey-border)] px-3 py-2 font-semibold text-[var(--survey-text)] ${column.sticky || columnIndex === 0 ? "sticky left-0 z-10 bg-inherit font-black" : ""}`}>{statusColumn && value ? <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(value)}`}>{valueLabel(value)}</span> : <span title={valueLabel(value)}>{valueLabel(value)}</span>}</td>;
            })}</tr>)}</tbody>
          </table>
          {!filteredRows.length ? <div className="p-8 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs a keresésnek megfelelő sor.</div> : null}
        </div>
      </section>
    </div>
  </div>;
}
