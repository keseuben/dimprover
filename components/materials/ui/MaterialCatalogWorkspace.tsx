"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Database, Plus, Search, Star, X } from "lucide-react";
import { developmentMaterialSourcePackage, genericMaterialCatalog } from "@/components/materials/catalog/genericMaterialCatalog";
import { materialCategories, materialCategoryById } from "@/components/materials/catalog/materialCategories";
import { searchMaterialCatalog } from "@/components/materials/catalog/materialSearchIndex";
import {
  copyMaterialToProject,
  createProjectCustomMaterial,
  toggleMaterialFavorite,
  type CreateProjectMaterialInput,
  type MaterialWorkspaceState,
} from "@/components/materials/domain/materialWorkspaceTypes";
import type { MaterialCatalogEntry } from "@/components/materials/domain/materialTypes";

const inputClass = "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-950 outline-none focus:border-cyan-500";

type Props = {
  workspace: MaterialWorkspaceState;
  selectedMaterialId?: string;
  onWorkspaceChange: (workspace: MaterialWorkspaceState) => void;
  onSelect: (entry: MaterialCatalogEntry) => void;
  onClose: () => void;
};

type SpecialFilter = "all" | "favorites" | "recent" | "project";

export function MaterialCatalogWorkspace({ workspace, selectedMaterialId, onWorkspaceChange, onSelect, onClose }: Props) {
  const entries = useMemo(() => [...workspace.projectMaterials, ...genericMaterialCatalog], [workspace.projectMaterials]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>("all");
  const [activeId, setActiveId] = useState(selectedMaterialId || entries[0]?.material.id || "");
  const [customOpen, setCustomOpen] = useState(false);
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => searchMaterialCatalog(entries, { query, categoryId: categoryId || undefined }).filter((entry) => {
    if (specialFilter === "favorites") return workspace.favoriteIds.includes(entry.material.id);
    if (specialFilter === "recent") return workspace.recentIds.includes(entry.material.id);
    if (specialFilter === "project") return entry.material.catalogId === workspace.projectCatalog.id;
    return true;
  }).sort((left, right) => {
    if (specialFilter === "recent") return workspace.recentIds.indexOf(left.material.id) - workspace.recentIds.indexOf(right.material.id);
    return left.material.productName.localeCompare(right.material.productName, "hu-HU");
  }), [categoryId, entries, query, specialFilter, workspace.favoriteIds, workspace.projectCatalog.id, workspace.recentIds]);
  const active = entries.find((entry) => entry.material.id === activeId) || filtered[0] || null;
  const sourcePackages = [developmentMaterialSourcePackage, ...workspace.sourcePackages];
  const source = active ? sourcePackages.find((item) => item.id === active.version.sourcePackageId) : null;

  function copyActive() {
    if (!active) return;
    try {
      const result = copyMaterialToProject(workspace, active);
      onWorkspaceChange(result.workspace);
      setActiveId(result.entry.material.id);
      setSpecialFilter("project");
      setMessage("Saját projektmásolat elkészült. Az adatok továbbra is ellenőrizetlenek.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A másolat nem készíthető el.");
    }
  }

  return <div className="fixed inset-0 z-[120] flex items-stretch justify-center bg-slate-950/65 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label="DIMPRO Anyag- és Terméktörzs" data-material-catalog-dialog="true">
    <div className="flex min-h-0 w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-cyan-300 bg-slate-50 shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-black text-slate-950"><Database size={18} className="text-cyan-700" /> DIMPRO Anyag- és Terméktörzs</div><div className="mt-1 text-[10px] font-semibold text-slate-500">MAT-0.3 · projekt saját anyagok + belső fejlesztési katalógus</div></div><button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700"><X size={18} /></button></header>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[250px_minmax(340px,1fr)_360px] lg:overflow-hidden">
        <aside className="border-b border-slate-200 bg-white p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input data-material-search className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Anyag, kód, kategória..." /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">{([['all','Összes'],['favorites','Kedvencek'],['recent','Legutóbbi'],['project','Projekt saját']] as const).map(([id,label]) => <button key={id} type="button" data-material-special-filter={id} onClick={() => setSpecialFilter(id)} className={`rounded-xl border px-3 py-2 text-left text-[10px] font-black ${specialFilter === id ? "border-cyan-400 bg-cyan-50 text-cyan-900" : "border-slate-200 bg-white text-slate-600"}`}>{label}{id === "favorites" ? ` · ${workspace.favoriteIds.length}` : id === "project" ? ` · ${workspace.projectMaterials.length}` : ""}</button>)}</div>
          <div className="mt-4 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Kategóriák</div>
          <div className="mt-2 grid gap-1"> <button type="button" onClick={() => setCategoryId("")} className={`rounded-lg px-2 py-2 text-left text-[10px] font-bold ${!categoryId ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Minden kategória</button>{materialCategories.map((category) => <button key={category.id} type="button" data-material-category={category.id} onClick={() => setCategoryId(category.id)} className={`rounded-lg px-2 py-2 text-left text-[10px] font-bold ${categoryId === category.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`} style={{ paddingLeft: category.parentId ? 22 : 8 }}>{category.name}</button>)}</div>
          <button type="button" data-create-custom-material onClick={() => setCustomOpen(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-3 py-3 text-xs font-black text-white"><Plus size={16} /> Saját anyag létrehozása</button>
        </aside>

        <main className="min-h-[300px] border-b border-slate-200 p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between"><div className="text-xs font-black text-slate-950">Találatok</div><div className="text-[9px] font-bold text-slate-500">{filtered.length} / {entries.length}</div></div>
          <div className="grid gap-2" data-material-result-list="true">{filtered.map((entry) => { const lambda = entry.version.designLambdaWmK?.value ?? entry.version.declaredLambdaWmK?.value; const favorite = workspace.favoriteIds.includes(entry.material.id); const project = entry.material.catalogId === workspace.projectCatalog.id; return <button key={entry.material.id} type="button" data-material-result={entry.material.id} onClick={() => setActiveId(entry.material.id)} className={`rounded-xl border p-3 text-left ${active?.material.id === entry.material.id ? "border-cyan-500 bg-cyan-50 ring-1 ring-cyan-300" : "border-slate-200 bg-white hover:border-cyan-300"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${project ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{project ? <Check size={15} /> : <AlertTriangle size={15} />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-950">{entry.material.productName}</span><span className="mt-1 block text-[9px] font-semibold text-slate-500">{materialCategoryById[entry.material.categoryId]?.name || entry.material.categoryId} · λ {lambda ?? "–"} W/(mK) · {entry.version.verificationStatus}</span></span>{favorite ? <Star size={15} className="shrink-0 fill-amber-400 text-amber-500" /> : null}</div></button>; })}{!filtered.length ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs font-bold text-slate-500">Nincs találat a megadott szűrőkkel.</div> : null}</div>
        </main>

        <aside className="p-4 lg:overflow-y-auto" data-material-detail-panel="true">
          {active ? <div className="grid gap-4"><div><div className="text-lg font-black leading-tight text-slate-950">{active.material.productName}</div><div className="mt-2 flex flex-wrap gap-1"><Badge>{active.material.kind}</Badge><Badge>{active.material.publicationStatus}</Badge><Badge>{active.material.visibility}</Badge><Badge>{active.version.verificationStatus}</Badge></div></div>
            <div className="grid grid-cols-2 gap-2"><Property label="λ" value={`${active.version.designLambdaWmK?.value ?? active.version.declaredLambdaWmK?.value ?? "–"} W/(mK)`} /><Property label="Sűrűség" value={`${active.version.densityKgM3?.value ?? "–"} kg/m³`} /><Property label="Fajhő" value={`${active.version.specificHeatJkgK?.value ?? "–"} J/(kgK)`} /><Property label="μ" value={`${active.version.vaporResistanceFactorMu?.value ?? "–"}`} /><Property label="Alapvastagság" value={`${active.version.defaultThicknessMm ?? "–"} mm`} /><Property label="Verzió" value={`v${active.version.versionNumber}`} /></div>
            <div className={`rounded-xl border p-3 text-[10px] font-bold leading-5 ${active.version.verificationStatus === "verified" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>{active.version.verificationStatus === "verified" ? "Szakmailag ellenőrzött anyagverzió." : "Ellenőrizetlen adat. Rétegrendbe választható, de a későbbi energetikai számítás figyelmeztetéssel kezeli."}</div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase text-slate-500">Forrás és licenc</div><div className="mt-2 text-xs font-black text-slate-950">{source?.name || active.version.sourcePackageId}</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">{source?.licenseReference || "A forrásrészlet nem található."}</div><div className="mt-2 text-[9px] font-bold text-slate-500">Licenc: {source?.licenseStatus || "ismeretlen"} · továbbadás: {source?.redistributionAllowed ? "engedélyezett" : "tiltott"}</div></div>
            {message ? <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-[10px] font-bold text-blue-950">{message}</div> : null}
            <div className="grid grid-cols-2 gap-2"><button type="button" data-toggle-material-favorite onClick={() => onWorkspaceChange(toggleMaterialFavorite(workspace, active.material.id))} className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-900"><Star size={15} className={workspace.favoriteIds.includes(active.material.id) ? "fill-amber-400" : ""} /> Kedvenc</button><button type="button" data-copy-material onClick={copyActive} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-800"><Copy size={15} /> Saját másolat</button></div>
            <button type="button" data-select-material onClick={() => onSelect(active)} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white"><Check size={17} /> Anyag kiválasztása a réteghez</button>
          </div> : <div className="text-xs font-bold text-slate-500">Válassz egy anyagot.</div>}
        </aside>
      </div>
    </div>
    {customOpen ? <CustomMaterialDialog onClose={() => setCustomOpen(false)} onCreate={(input) => { const result = createProjectCustomMaterial(workspace, input); onWorkspaceChange(result.workspace); setActiveId(result.entry.material.id); setSpecialFilter("project"); setCustomOpen(false); setMessage("A saját projektanyag elkészült. Szakmai ellenőrzésig unverified állapotú."); }} /> : null}
  </div>;
}

function CustomMaterialDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (input: CreateProjectMaterialInput) => void }) {
  const [form, setForm] = useState({
    name: "",
    categoryId: "masonry",
    lambdaWmK: "",
    defaultThicknessMm: "",
    densityKgM3: "",
    specificHeatJkgK: "",
    mu: "",
    sourceNote: "Saját projektadat – szakmai ellenőrzés szükséges.",
  });
  const parseDecimal = (value: string) => Number(value.trim().replace(",", "."));
  const optionalPositive = (value: string) => {
    const parsed = parseDecimal(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const lambda = parseDecimal(form.lambdaWmK);
  const valid = Boolean(form.name.trim() && form.categoryId && Number.isFinite(lambda) && lambda > 0 && form.sourceNote.trim());
  function submit() {
    if (!valid) return;
    onCreate({
      name: form.name,
      categoryId: form.categoryId,
      lambdaWmK: lambda,
      defaultThicknessMm: optionalPositive(form.defaultThicknessMm),
      densityKgM3: optionalPositive(form.densityKgM3),
      specificHeatJkgK: optionalPositive(form.specificHeatJkgK),
      mu: optionalPositive(form.mu),
      sourceNote: form.sourceNote,
    });
  }
  return <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Saját anyag létrehozása"><div className="w-full max-w-xl rounded-2xl border border-cyan-300 bg-white p-4 shadow-2xl"><div className="flex items-center justify-between"><div className="text-base font-black text-slate-950">Saját projektanyag</div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-300"><X size={16} /></button></div><div className="mt-4 grid gap-3"><label><Label>Név</Label><input data-custom-material-name className={inputClass} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label><Label>Kategória</Label><select data-custom-material-category className={inputClass} value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>{materialCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label><Label>λ W/(mK) *</Label><input data-custom-material-lambda type="text" inputMode="decimal" className={inputClass} value={form.lambdaWmK} onChange={(event) => setForm((current) => ({ ...current, lambdaWmK: event.target.value }))} placeholder="0,039" /></label><label><Label>Alapvastagság mm</Label><input type="text" inputMode="decimal" className={inputClass} value={form.defaultThicknessMm} onChange={(event) => setForm((current) => ({ ...current, defaultThicknessMm: event.target.value }))} /></label><label><Label>Sűrűség kg/m³</Label><input type="text" inputMode="decimal" className={inputClass} value={form.densityKgM3} onChange={(event) => setForm((current) => ({ ...current, densityKgM3: event.target.value }))} /></label><label><Label>Fajhő J/(kgK)</Label><input type="text" inputMode="decimal" className={inputClass} value={form.specificHeatJkgK} onChange={(event) => setForm((current) => ({ ...current, specificHeatJkgK: event.target.value }))} /></label><label><Label>μ</Label><input type="text" inputMode="decimal" className={inputClass} value={form.mu} onChange={(event) => setForm((current) => ({ ...current, mu: event.target.value }))} /></label></div><label><Label>Adatforrás és megjegyzés *</Label><textarea data-custom-material-source className="min-h-20 w-full rounded-xl border border-slate-300 p-3 text-xs font-bold text-slate-950" value={form.sourceNote} onChange={(event) => setForm((current) => ({ ...current, sourceNote: event.target.value }))} /></label><div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[10px] font-bold leading-5 text-amber-950">A saját anyag projektláthatóságú és unverified állapotú. Nem kerül automatikusan a DIMPRO központi katalógusba. A decimális érték ponttal és vesszővel is megadható.</div><button type="button" data-save-custom-material disabled={!valid} onClick={submit} className="rounded-xl bg-cyan-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">Saját anyag mentése</button></div></div></div>;
}

function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[8px] font-black uppercase text-slate-600">{children}</span>; }
function Property({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-2"><div className="text-[8px] font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-xs font-black text-slate-950">{value}</div></div>; }
function Label({ children }: { children: React.ReactNode }) { return <span className="mb-1 block text-[9px] font-black uppercase text-slate-500">{children}</span>; }
