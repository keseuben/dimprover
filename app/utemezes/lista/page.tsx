"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ListChecks, Plus, Printer, X } from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import ModulePanel from "@/components/layout/ModulePanel";
import { initialSchedule } from "@/app/lib/schedule/sampleSchedule";
import { buildVisibleRows } from "@/app/lib/schedule/rowBuilder";
import { ScheduleLocation, ScheduleTask } from "@/app/lib/schedule/types";

const STORAGE_KEY = "dimprover.practice.schedule.v1";

type PersistedSchedule = {
  scheduleName?: string;
  schedule?: ScheduleLocation[];
};

type PdfPaperSize = "A4" | "A3" | "A2" | "A1";
type PdfOrientation = "landscape" | "portrait";

const PDF_PAPER_MM: Record<PdfPaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
};

function getPdfPageSize(size: PdfPaperSize, direction: PdfOrientation) {
  const paper = PDF_PAPER_MM[size];
  return direction === "landscape"
    ? { width: Math.max(paper.width, paper.height), height: Math.min(paper.width, paper.height) }
    : { width: Math.min(paper.width, paper.height), height: Math.max(paper.width, paper.height) };
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function getTaskStart(task: ScheduleTask) {
  return task.actualStartDate || task.startDate || "";
}

function getTaskEnd(task: ScheduleTask) {
  return task.actualEndDate || task.endDate || "";
}

function collectIds(schedule: ScheduleLocation[]) {
  const ids: string[] = [];
  schedule.forEach((location) => {
    ids.push(location.id);
    location.buildings.forEach((building) => {
      ids.push(building.id);
      building.categories.forEach((category) => ids.push(category.id));
    });
  });
  return ids;
}

export default function UtemezesListaPage() {
  const [scheduleName, setScheduleName] = useState("Ütemterv (Lista nézet)");
  const [schedule, setSchedule] = useState<ScheduleLocation[]>(initialSchedule);
  const [filter, setFilter] = useState("");
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [paperSize, setPaperSize] = useState<PdfPaperSize>("A3");
  const [orientation, setOrientation] = useState<PdfOrientation>("landscape");
  const pdfFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as PersistedSchedule;
        setScheduleName("Ütemterv (Lista nézet)");
        setSchedule(saved.schedule || initialSchedule);
      } catch {
        setSchedule(initialSchedule);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const visibleRows = useMemo(() => buildVisibleRows(schedule, collapsedRows), [schedule, collapsedRows]);
  const filteredRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return visibleRows;
    return visibleRows.filter((row) => {
      if (row.rowType === "location") return row.location.name.toLowerCase().includes(query) || "helyszín".includes(query);
      if (row.rowType === "building") return row.building.name.toLowerCase().includes(query) || "épület".includes(query);
      if (row.rowType === "category") return row.category.name.toLowerCase().includes(query) || "munkanem".includes(query);
      return [row.task.name, row.task.contractor, row.task.taskType, row.task.category, row.number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [filter, visibleRows]);

  const saveListSnapshot = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ scheduleName: "Ütemterv (Gantt diagram)", schedule }));
  };

  const toggleRow = (id: string) => {
    setCollapsedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsedRows(new Set());
  const collapseAll = () => setCollapsedRows(new Set(collectIds(schedule)));

  const listPdfHtml = useMemo(() => {
    const rows = filteredRows.map((row) => {
      if (row.rowType === "location") {
        return `<tr class="row-location"><td></td><td>${escapeHtml(row.location.name)}</td><td>Helyszín</td><td></td><td></td><td></td><td></td></tr>`;
      }
      if (row.rowType === "building") {
        return `<tr class="row-building"><td>${escapeHtml(row.number)}</td><td class="indent-1">${escapeHtml(row.building.name)}</td><td>Épület</td><td></td><td></td><td></td><td></td></tr>`;
      }
      if (row.rowType === "category") {
        return `<tr class="row-category"><td>${escapeHtml(row.number)}</td><td class="indent-2">${escapeHtml(row.category.name)}</td><td>Munkanem</td><td></td><td></td><td></td><td></td></tr>`;
      }
      const progress = Math.max(0, Math.min(100, Math.round(row.task.progress ?? 0)));
      const progressCells = Array.from({ length: 10 })
        .map((_, index) => `<span class="step ${index < Math.round(progress / 10) ? "active" : ""}"></span>`)
        .join("");
      return `<tr class="row-task"><td>${escapeHtml(row.number)}</td><td class="indent-3"><strong>${escapeHtml(row.task.name)}</strong><small>${escapeHtml(row.task.contractor)}</small></td><td>${escapeHtml(row.task.taskType || "Feladat")}</td><td>${escapeHtml(getTaskStart(row.task))}</td><td>${escapeHtml(getTaskEnd(row.task))}</td><td><div class="progress"><b>${progress}%</b><span>${progressCells}</span></div></td><td>${escapeHtml(row.task.contractor)}</td></tr>`;
    }).join("");

    const pageSize = getPdfPageSize(paperSize, orientation);

    return `<!doctype html><html lang="hu"><head><meta charset="utf-8" /><title>${escapeHtml(scheduleName)} - PDF előnézet</title><style>
      @page{size:${paperSize} ${orientation};margin:10mm}*{box-sizing:border-box}body{margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a}.page{width:${pageSize.width}mm;min-height:${pageSize.height}mm;margin:18px auto;background:white;padding:14mm;box-shadow:0 18px 50px rgba(15,23,42,.18);max-width:none}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:12px}h1{margin:0;font-size:22px}.meta{font-size:11px;color:#475569;line-height:1.7}.badge{display:inline-block;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:5px 10px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#e5e7eb;color:#0f172a;text-align:left;border:1px solid #cbd5e1;padding:8px;font-weight:800}td{border:1px solid #dbe4ef;padding:6px;vertical-align:middle}.row-location td{background:#cbd5e1;font-weight:800}.row-building td{background:#e2e8f0;font-weight:700}.row-category td{background:#f1f5f9;font-weight:700}.row-task td{background:#fff}.indent-1{padding-left:18px}.indent-2{padding-left:34px}.indent-3{padding-left:50px}.row-task small{display:block;color:#64748b;font-size:9px;margin-top:2px}.progress{min-width:120px}.progress b{display:block;margin-bottom:3px;color:#047857}.progress span{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}.step{height:8px;background:#d1fae5;border:1px solid #a7f3d0}.step.active{background:#10b981}footer{margin-top:18px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;color:#64748b;display:flex;justify-content:space-between}@media print{body{background:white}.page{margin:0;box-shadow:none;max-width:none}}
    </style></head><body><main class="page"><header><div><span class="badge">Ütemterv (Lista nézet)</span><h1>${escapeHtml(scheduleName)}</h1><div class="meta">Nyomtatóbarát lista nézet · Látható sorok: ${filteredRows.length}</div></div><div class="meta">DIMPROVER<br/>Készítés: ${escapeHtml(new Date().toLocaleString("hu-HU"))}<br/>Lapméret: ${paperSize} · ${orientation === "landscape" ? "Fekvő" : "Álló"}</div></header><table><thead><tr><th>Sorszám</th><th>Megnevezés</th><th>Típus</th><th>Kezdés</th><th>Befejezés</th><th>Készültség</th><th>Vállalkozó / megjegyzés</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Nincs megjeleníthető sor.</td></tr>'}</tbody></table><footer><span>DIMPROVER · Ütemterv lista PDF előnézet</span><span>${escapeHtml(scheduleName)}</span></footer></main></body></html>`;
  }, [filteredRows, orientation, paperSize, scheduleName]);

  const printListPdf = () => {
    const iframe = pdfFrameRef.current;
    const frameWindow = iframe?.contentWindow;
    const frameDocument = iframe?.contentDocument;
    if (!frameWindow || !frameDocument) return;

    frameDocument.open();
    frameDocument.write(listPdfHtml);
    frameDocument.close();

    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
    }, 150);
  };

  return (
    <AppLayout>
      <section className="relative mb-0 min-h-screen overflow-hidden px-8 pb-8 pt-7">
        <div className="relative z-[1]">
          <div className="mb-5 border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <Link href="/project" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Vissza a projekt áttekintéséhez</Link>
                <div className="mt-4 text-sm text-slate-500">Projektek / Ütemterv / Lista nézet</div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950">Ütemterv (Lista nézet)</h1>
                <p className="mt-2 text-sm text-emerald-600">Automatikus mentés aktív · Gantt diagrammal közös adatforrás</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex overflow-hidden rounded-none border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-600 shadow-sm">
                  <Link href="/utemezes" className="rounded-none px-4 py-1.5 hover:bg-slate-50">Gantt diagram</Link>
                  <Link href="/utemezes/lista" className="rounded-none bg-blue-600 px-4 py-1.5 text-white shadow-sm">Lista nézet</Link>
                </div>
                <button onClick={saveListSnapshot} className="rounded-none border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Mentés</button>
                <button onClick={() => setShowPdfPreview(true)} className="rounded-none border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">PDF előnézet / export</button>
                <button className="rounded-none bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Véglegesítés</button>
              </div>
            </div>
          </div>

          <ModulePanel storageKey="utemezes-lista:content" title="Feladatlista" contentClassName="px-5 py-4" className="mb-4">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 xl:flex-row xl:items-center xl:justify-between">
              <label className="flex max-w-xl flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                <ListChecks size={16} />
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Szűrés feladat, típus, vállalkozó vagy számozás szerint" className="w-full bg-transparent outline-none" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button onClick={expandAll} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Összes kinyitása</button>
                <button onClick={collapseAll} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Összes összecsukása</button>
                <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Plus size={14} />Új feladat</button>
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-[1180px] w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950 text-left text-xs uppercase tracking-wide text-white">
                  <tr>
                    <th className="w-28 px-4 py-3">Sorszám</th>
                    <th className="px-4 py-3">Megnevezés</th>
                    <th className="w-36 px-4 py-3">Típus</th>
                    <th className="w-36 px-4 py-3">Kezdés</th>
                    <th className="w-36 px-4 py-3">Befejezés</th>
                    <th className="w-56 px-4 py-3">Készültség</th>
                    <th className="px-4 py-3">Vállalkozó / megjegyzés</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    if (row.rowType === "location") {
                      return <tr key={row.id} className="border-b border-slate-200 bg-slate-300/95 font-bold text-slate-900"><td className="px-4 py-2 font-mono text-slate-400">—</td><td className="px-4 py-2"><button onClick={() => toggleRow(row.location.id)} className="mr-2">{collapsedRows.has(row.location.id) ? "▸" : "▾"}</button>{row.location.name}</td><td className="px-4 py-2 text-slate-700">Helyszín</td><td colSpan={4}></td></tr>;
                    }
                    if (row.rowType === "building") {
                      return <tr key={row.id} className="border-b border-slate-200 bg-slate-200/95 font-semibold text-slate-900"><td className="px-4 py-2 font-mono">{row.number}</td><td className="px-4 py-2 pl-8"><button onClick={() => toggleRow(row.building.id)} className="mr-2">{collapsedRows.has(row.building.id) ? "▸" : "▾"}</button>{row.building.name}</td><td className="px-4 py-2 text-slate-700">Épület</td><td colSpan={4}></td></tr>;
                    }
                    if (row.rowType === "category") {
                      return <tr key={row.id} className="border-b border-slate-100 bg-slate-50 font-semibold text-slate-900"><td className="px-4 py-2 font-mono">{row.number}</td><td className="px-4 py-2 pl-12"><button onClick={() => toggleRow(row.category.id)} className="mr-2">{collapsedRows.has(row.category.id) ? "▸" : "▾"}</button><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${row.category.color}`} />{row.category.name}</td><td className="px-4 py-2 text-slate-700">Munkanem</td><td colSpan={4}></td></tr>;
                    }
                    const progress = Math.max(0, Math.min(100, Math.round(row.task.progress ?? 0)));
                    const activeSteps = Math.round(progress / 10);
                    return (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-blue-50/50">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">{row.number}</td>
                        <td className="px-4 py-3 pl-20 font-semibold text-slate-900">{row.task.name}</td>
                        <td className="px-4 py-3 text-slate-600">{row.task.taskType || "Feladat"}</td>
                        <td className="px-4 py-3 text-slate-700"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{getTaskStart(row.task)}</span></td>
                        <td className="px-4 py-3 text-slate-700">{getTaskEnd(row.task)}</td>
                        <td className="px-4 py-3 text-slate-700"><div className="min-w-[170px]"><div className="mb-1 flex items-center justify-between text-xs font-semibold text-emerald-700"><span>Készültség</span><span>{progress}%</span></div><div className="grid grid-cols-10 gap-0.5">{Array.from({ length: 10 }).map((_, index) => <span key={index} className={`h-2.5 rounded-sm ${index < activeSteps ? "bg-emerald-500" : "bg-emerald-100 ring-1 ring-inset ring-emerald-200"}`} title={`${(index + 1) * 10}%`} />)}</div></div></td>
                        <td className="px-4 py-3 text-slate-600">{row.task.contractor}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ModulePanel>
        </div>
        {showPdfPreview ? (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/65 p-6">
            <div className="flex h-[88vh] w-[86vw] flex-col overflow-hidden rounded-none bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Ütemterv lista PDF előnézet</h2>
                  <p className="text-xs text-slate-500">Lapméret és tájolás választása után indítható a PDF / nyomtatás.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={paperSize} onChange={(event) => setPaperSize(event.target.value as PdfPaperSize)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                    <option value="A2">A2</option>
                    <option value="A1">A1</option>
                  </select>
                  <select value={orientation} onChange={(event) => setOrientation(event.target.value as PdfOrientation)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <option value="landscape">Fekvő</option>
                    <option value="portrait">Álló</option>
                  </select>
                  <button onClick={printListPdf} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                    <Printer size={14} /> PDF / nyomtatás
                  </button>
                  <button onClick={() => setShowPdfPreview(false)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <X size={14} /> Bezárás
                  </button>
                </div>
              </div>
              <iframe key={`${paperSize}-${orientation}-${filteredRows.length}`} ref={pdfFrameRef} title="Ütemterv lista PDF előnézet" srcDoc={listPdfHtml} className="h-full w-full bg-slate-100" />
            </div>
          </div>
        ) : null}

      </section>
    </AppLayout>
  );
}
