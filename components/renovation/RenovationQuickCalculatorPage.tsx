"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  Folder,
  Hammer,
  Home,
  LayoutDashboard,
  Menu,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  Wrench,
  Zap,
} from "lucide-react";
import {
  calculateRenovation,
  createBaseCategories,
  createDetailedRows,
  createVersions,
  propertyTypeLabels,
  priceModeLabels,
  qualityLabels,
  renovationSamples,
  type RenovationCalculationInput,
  type RenovationCategoryInput,
  type RenovationCategoryId,
  type RenovationPriceMode,
  type RenovationPropertyType,
  type RenovationQualityLevel,
} from "@/app/lib/renovation/calculator";
import { hourlyRateProfiles, type LaborRateMode } from "@/app/lib/renovation/laborRates";
import {
  ENERGY_CERTIFICATE_AI_RULE,
  energyCertificateAllowedMinimalFields,
  energyCertificateConsentOptions,
  energyCertificateForbiddenStoredFields,
} from "@/app/lib/renovation/energyCertificatePrivacy";

type EnergyCertificateApiResult = {
  fileName: string;
  fileSize: number;
  pageCount?: number;
  status: "success" | "partial" | "failed";
  confidence?: number;
  error?: string;
  warnings?: string[];
  summary?: {
    hetId?: string;
    validUntil?: string;
    propertyType?: string;
    usefulFloorArea?: number;
    roomCount?: number;
    energyRating?: string;
    co2Rating?: string;
    aggregatedEnergyPerformance?: number;
    co2Emission?: number;
    specificHeatLossCoefficient?: number;
    modernizationSuggestions?: string[];
    recommendedRenovationOrder?: string[];
  };
};

const nf = new Intl.NumberFormat("hu-HU");
const steps = ["Alapadatok", "Felújítási tételek", "Becslés összesítés", "Verziók", "Tényleges költségek", "Összehasonlítás"];
const propertyTypes = Object.keys(propertyTypeLabels) as RenovationPropertyType[];
const qualityLevels = Object.keys(qualityLabels) as RenovationQualityLevel[];
const priceModes = Object.keys(priceModeLabels) as RenovationPriceMode[];

const categoryIcons: Partial<Record<RenovationCategoryId, typeof Hammer>> = {
  demolition: Hammer,
  waste: Trash2,
  floor_tiling: LayoutDashboard,
  wall_tiling: LayoutDashboard,
  painting: Wrench,
  electric_rewire: Zap,
  mechanical: Wrench,
  bathroom: Wrench,
  kitchen: Home,
  windows: Building2,
  insulation_facade: Building2,
  insulation_attic: Building2,
  roof: Home,
  fence_build: Building2,
  driveway: LayoutDashboard,
  landscaping: Wrench,
  lawn: Wrench,
  irrigation: Wrench,
  tree_planting: Wrench,
  ac_install_5m: Wrench,
  ac_install_plus: Wrench,
  solar_pv: Zap,
  solar_collector: Zap,
  heat_pump: Wrench,
  other: ClipboardList,
};

function ft(value: number) {
  return `${nf.format(Math.round(value))} Ft`;
}

function pct(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

function selectedAmount(result: ReturnType<typeof calculateRenovation>, netValue: number, grossValue: number) {
  return result.priceMode === "gross" ? grossValue : netValue;
}

function priceModeText(result: ReturnType<typeof calculateRenovation>) {
  return result.priceMode === "gross" ? "Bruttó árakkal számolunk" : "Nettó árakkal számolunk";
}

function toCsvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultInput(): RenovationCalculationInput {
  return renovationSamples[0];
}

export function RenovationQuickCalculatorPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [input, setInput] = useState<RenovationCalculationInput>(() => defaultInput());
  const result = useMemo(() => calculateRenovation(input), [input]);
  const versions = useMemo(() => createVersions(result), [result]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isEnergyCertificateOpen, setIsEnergyCertificateOpen] = useState(false);

  function updateInput(patch: Partial<RenovationCalculationInput>) {
    setInput((current) => ({ ...current, ...patch }));
  }

  function updateCategory(id: RenovationCategoryId, patch: Partial<RenovationCategoryInput>) {
    setInput((current) => ({
      ...current,
      categories: current.categories.map((category) => category.id === id ? { ...category, ...patch } : category),
    }));
  }

  function expandCategoryToDetailedRows(id: RenovationCategoryId) {
    setInput((current) => {
      const parent = current.categories.find((category) => category.id === id);
      if (!parent) return current;
      const detailRows = createDetailedRows(parent);
      const nextCategories = current.categories.flatMap((category) => {
        if (category.id !== id) return [category];
        return [{ ...category, detailMode: true }, ...detailRows];
      });
      return { ...current, categories: nextCategories };
    });
    setSavedMessage("A részletező mód bekapcsolt: a fő tétel alatt megjelentek a kapcsolódó altételek is.");
  }

  function loadSample(sampleId: string) {
    const sample = renovationSamples.find((item) => item.id === sampleId);
    if (!sample) return;
    setInput(structuredClone(sample));
    setActiveStep(0);
    setSavedMessage(`Betöltve: ${sample.label}`);
  }

  function rebuildCategories(propertyType: RenovationPropertyType, area = input.area) {
    updateInput({ propertyType, categories: createBaseCategories(area, propertyType) });
  }

  function saveToBrowser() {
    window.localStorage.setItem("dimpro:renovation-calculator:last", JSON.stringify({ input, savedAt: new Date().toISOString() }));
    setSavedMessage("A kalkuláció mentve lett a böngésző helyi tárába. Adatbázisos mentés későbbi lépésben jön.");
  }

  function createNewProject() {
    const nextInput = structuredClone(renovationSamples[0]);
    nextInput.name = `Új felújítási kalkuláció ${new Date().toLocaleDateString("hu-HU")}`;
    setInput(nextInput);
    setActiveStep(0);
    setSavedMessage("Új projekt / kalkuláció indult. Az alap számítások és minta tételek megmaradtak, innen szabadon módosíthatók.");
  }

  function exportExcel() {
    const rows = [
      ["DIMPRO Felújítási Gyorskalkulátor"],
      ["Kalkuláció", result.name],
      ["Árszámítás", priceModeText(result)],
      ["ÁFA %", result.vatPercent],
      [],
      ["Munkarész", "Mennyiség", "Egység", "Anyag egységár", "Munkadíj egységár", "Egyéb költség", "Becslés", "Kész", "Tényleges költség", "Eltérés"],
      ...result.rows.filter((row) => row.enabled).map((row) => [
        row.name,
        Math.round(row.quantity),
        row.unit,
        Math.round(row.materialUnitPrice),
        Math.round(row.laborUnitPrice),
        Math.round(row.otherCost),
        Math.round(selectedAmount(result, row.estimatedNetTotal, row.estimatedGrossTotal)),
        row.isCompleted ? "igen" : "nem",
        row.isCompleted ? Math.round(selectedAmount(result, row.runningNetBasis, row.runningGrossBasis)) : "",
        Math.round(selectedAmount(result, row.differenceNetFromEstimate, row.differenceGrossFromEstimate)),
      ]),
      [],
      ["Nettó összesen", Math.round(result.estimatedNetTotal)],
      [`ÁFA (${result.vatPercent}%)`, Math.round(result.estimatedVatTotal)],
      ["Bruttó összesen", Math.round(result.estimatedGrossTotal)],
      ["Aktuális várható nettó", Math.round(result.runningNetTotal)],
      ["Aktuális várható bruttó", Math.round(result.runningGrossTotal)],
    ];

    const csv = "\ufeff" + rows.map((row) => row.map((cell) => toCsvCell(cell ?? "")).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.name.replace(/[^a-z0-9áéíóöőúüű -]/gi, "").trim() || "felujitasi-kalkulacio"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function applyEnergyCertificateSummary(summary: EnergyCertificateApiResult["summary"]) {
    if (!summary?.usefulFloorArea) {
      setSavedMessage("A tanúsítványból nem sikerült olyan alapterületet kinyerni, amit át tudnék venni.");
      return;
    }

    const area = Math.max(1, Math.round(summary.usefulFloorArea));
    const rooms = summary.roomCount && summary.roomCount > 0
      ? Math.round(summary.roomCount)
      : Math.max(1, Math.round(area / 24));

    setInput((current) => ({
      ...current,
      area,
      rooms,
      categories: createBaseCategories(area, current.propertyType),
    }));
    setSavedMessage(`Energetikai tanúsítványból átvéve: ${area} m² alapterület, ${rooms} helyiség${summary.roomCount ? "" : " becsült értékkel"}.`);
  }

  function exportPdf() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[265px] border-r border-slate-200 bg-white xl:block">
        <div className="flex h-[76px] items-center border-b border-slate-100 px-6"><DimproLogo /></div>
        <nav className="space-y-2 px-3 py-7">
          {[
            ["Kezdőlap", Home, "https://dimpro.hu"],
            ["Projektek", Folder, "#"],
            ["Dokumentumok", FileText, "#"],
            ["Felújítási Gyorskalkulátor", Calculator, "/felujitasi-gyorskalkulator"],
            ["Költségadatbázis", WalletCards, "/koltsegadatbazis"],
            ["Partnerek", Users, "#"],
            ["Jelentések", BarChart3, "#"],
            ["Beállítások", Settings, "#"],
          ].map(([label, Icon, href]) => (
            <Link key={String(label)} href={String(href)} className={`flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-bold transition ${label === "Felújítási Gyorskalkulátor" ? "border-l-4 border-lime-500 bg-lime-50 text-lime-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
              <Icon size={20} />{String(label)}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="xl:pl-[265px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white xl:hidden"><Menu size={20} /></button>
            <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm sm:flex">
              <Home size={18} />{input.name}<ChevronDown size={16} />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-lime-50 px-4 py-2 text-xs font-black text-lime-700">
            <CheckCircle2 size={17} />Működő MVP kalkulátor
          </div>
        </header>

        <section className="p-4 md:p-7">
          <Hero result={result} />

          <EnergyCertificateTopCard
            isOpen={isEnergyCertificateOpen}
            setIsOpen={setIsEnergyCertificateOpen}
            onApplySummary={applyEnergyCertificateSummary}
          />

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600">{priceModeText(result)}</div>
              <p className="mt-2 text-sm font-semibold text-slate-500">A részszámítások a választott árkezelés és munkadíj óradíj/normaóra logika szerint futnak, a végösszegnél külön látszik a nettó, ÁFA és bruttó összeg.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={createNewProject} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><Folder size={17} /> Új projekt</button>
              <button type="button" onClick={saveToBrowser} className="inline-flex items-center gap-2 rounded-xl bg-lime-600 px-4 py-3 text-sm font-black text-white hover:bg-lime-700"><Save size={17} /> Mentés</button>
              <button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><Download size={17} /> PDF / nyomtatás</button>
              <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><Download size={17} /> Excel export</button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-5">
            {renovationSamples.map((sample) => (
              <button key={sample.id} type="button" onClick={() => loadSample(sample.id)} className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-lime-300 ${sample.name === input.name ? "border-lime-500 bg-lime-50" : "border-slate-200 bg-white"}`}>
                <div className="text-sm font-black text-slate-950">{sample.label}</div>
                <p className="mt-2 line-clamp-3 text-xs font-semibold leading-5 text-slate-500">{sample.description}</p>
              </button>
            ))}
          </div>

          {savedMessage ? <div className="mt-5 rounded-2xl border border-lime-200 bg-lime-50 p-4 text-sm font-black text-lime-800">{savedMessage}</div> : null}

          <Stepper activeStep={activeStep} setActiveStep={setActiveStep} />

          {activeStep === 0 ? <BasicDataView input={input} updateInput={updateInput} rebuildCategories={rebuildCategories} result={result} saveToBrowser={saveToBrowser} exportPdf={exportPdf} /> : null}
          {activeStep === 1 ? <ItemsView result={result} updateCategory={updateCategory} expandCategoryToDetailedRows={expandCategoryToDetailedRows} /> : null}
          {activeStep === 2 ? <SummaryView result={result} exportPdf={exportPdf} exportExcel={exportExcel} /> : null}
          {activeStep === 3 ? <VersionsView versions={versions} result={result} saveToBrowser={saveToBrowser} /> : null}
          {activeStep === 4 ? <ActualCostsView result={result} updateCategory={updateCategory} /> : null}
          {activeStep === 5 ? <ComparisonView result={result} versions={versions} /> : null}

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-900 md:flex-row md:items-center md:justify-between">
            <span className="inline-flex items-center gap-3"><AlertTriangle size={20} /> A kalkuláció tájékoztató jellegű becslés, nem minősül tételes költségvetésnek vagy kivitelezői ajánlatnak.</span>
            <button type="button" className="inline-flex items-center gap-2 font-black text-amber-800">Részletek <ChevronDown size={16} /></button>
          </div>
        </section>
      </div>
    </main>
  );
}

function DimproLogo() {
  return (
    <Link href="https://dimpro.hu" className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 shadow-lg"><div className="h-5 w-5 rounded-[5px] bg-lime-400 shadow-[inset_7px_0_0_#ffffff]" /></div>
      <div><div className="text-2xl font-black uppercase tracking-[0.08em] text-slate-950">DIM<span className="text-lime-600">PRO</span></div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Felújítási modul</div></div>
    </Link>
  );
}

function Hero({ result }: { result: ReturnType<typeof calculateRenovation> }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-lime-100 text-lime-700"><Calculator size={34} /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-600">DIMPRO külön modul</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-4xl">Felújítási Gyorskalkulátor</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500 md:text-base">Becslésből költségkontroll: tételek, verziók, tényleges költségek és összehasonlítás.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard label="Becsült nettó" value={ft(result.estimatedNetTotal)} />
          <MetricCard label={`ÁFA (${result.vatPercent}%)`} value={ft(result.estimatedVatTotal)} />
          <MetricCard label="Becsült bruttó" value={ft(result.estimatedGrossTotal)} highlight />
          <MetricCard label="Aktuális várható bruttó" value={ft(result.runningGrossTotal)} highlight />
        </div>
      </div>
    </div>
  );
}

function Stepper({ activeStep, setActiveStep }: { activeStep: number; setActiveStep: (step: number) => void }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-[980px] items-center justify-between px-6">
        {steps.map((step, index) => (
          <button key={step} type="button" onClick={() => setActiveStep(index)} className={`flex h-14 items-center gap-3 border-b-2 px-2 text-left text-sm font-black transition ${activeStep === index ? "border-lime-500 text-slate-950" : "border-transparent text-slate-400 hover:border-lime-200 hover:text-slate-700"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${activeStep === index ? "bg-lime-500 text-white" : "bg-slate-100 text-slate-400"}`}>{index + 1}</span>{step}
          </button>
        ))}
      </div>
    </div>
  );
}

function BasicDataView({ input, updateInput, rebuildCategories, result, saveToBrowser, exportPdf }: {
  input: RenovationCalculationInput;
  updateInput: (patch: Partial<RenovationCalculationInput>) => void;
  rebuildCategories: (propertyType: RenovationPropertyType, area?: number) => void;
  result: ReturnType<typeof calculateRenovation>;
  saveToBrowser: () => void;
  exportPdf: () => void;
}) {
  return (
    <div className="mt-5 grid gap-5 2xl:grid-cols-[1.25fr_0.75fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="mb-6 text-xl font-black">Alapadatok</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Kalkuláció neve" value={input.name} onChange={(value) => updateInput({ name: value })} />
          <label className="text-sm font-black text-slate-700">Ingatlan típusa
            <select value={input.propertyType} onChange={(event) => rebuildCategories(event.target.value as RenovationPropertyType)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-lime-500">
              {propertyTypes.map((type) => <option key={type} value={type}>{propertyTypeLabels[type]}</option>)}
            </select>
          </label>
          <Input label="Alapterület (m²)" value={String(input.area)} onChange={(value) => { const area = Math.max(1, toNumber(value, input.area)); updateInput({ area }); }} type="number" />
          <Input label="Helyiségek száma" value={String(input.rooms)} onChange={(value) => updateInput({ rooms: Math.max(1, toNumber(value, input.rooms)) })} type="number" />
          <label className="text-sm font-black text-slate-700">Minőségi szint
            <select value={input.qualityLevel} onChange={(event) => updateInput({ qualityLevel: event.target.value as RenovationQualityLevel })} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-lime-500">
              {qualityLevels.map((level) => <option key={level} value={level}>{qualityLabels[level]}</option>)}
            </select>
          </label>
          <label className="text-sm font-black text-slate-700">Árszámítás módja
            <select value={input.priceMode} onChange={(event) => updateInput({ priceMode: event.target.value as RenovationPriceMode })} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-lime-500">
              {priceModes.map((mode) => <option key={mode} value={mode}>{priceModeLabels[mode]}</option>)}
            </select>
          </label>
          <label className="text-sm font-black text-slate-700">Munkadíj számítás alapja
            <select value={input.laborRateMode} onChange={(event) => updateInput({ laborRateMode: event.target.value as LaborRateMode })} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-lime-500">
              <option value="official">ÉVOSZ ajánlott minimum 2026 - 7 830 Ft/óra</option>
              <option value="dimpro">DIMPRO becslési óradíj - 9 500 Ft/óra</option>
              <option value="internal">Belső saját óradíj - 12 500 Ft/óra</option>
            </select>
          </label>
          <Input label="ÁFA (%)" value={String(input.vatPercent)} onChange={(value) => updateInput({ vatPercent: Math.max(0, toNumber(value, input.vatPercent)) })} type="number" />
          <Input label="Tartalékkeret (%)" value={String(input.reservePercent)} onChange={(value) => updateInput({ reservePercent: Math.max(0, toNumber(value, input.reservePercent)) })} type="number" />
          <Input label="Saját munka aránya (%)" value={String(input.ownWorkPercent)} onChange={(value) => updateInput({ ownWorkPercent: Math.max(0, toNumber(value, input.ownWorkPercent)) })} type="number" />
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={saveToBrowser} className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-lime-600/20 hover:bg-lime-700"><Save size={18} /> Mentés helyben</button>
          <button type="button" onClick={exportPdf} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50"><Download size={18} /> PDF / nyomtatás</button>
        </div>
      </section>
      <DashboardResult result={result} />
    </div>
  );
}

function ItemsView({ result, updateCategory, expandCategoryToDetailedRows }: { result: ReturnType<typeof calculateRenovation>; updateCategory: (id: RenovationCategoryId, patch: Partial<RenovationCategoryInput>) => void; expandCategoryToDetailedRows: (id: RenovationCategoryId) => void }) {
  return (
    <Panel title="Felújítási tételek" text="A táblázat szerkeszthető. Kapcsolható kategóriák, mennyiség, egységárak és egyéb költségek alapján frissül a kalkuláció.">
      <EditableItemsTable result={result} updateCategory={updateCategory} expandCategoryToDetailedRows={expandCategoryToDetailedRows} mode="estimate" />
    </Panel>
  );
}

function SummaryView({ result, exportPdf, exportExcel }: { result: ReturnType<typeof calculateRenovation>; exportPdf: () => void; exportExcel: () => void }) {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <DashboardResult result={result} />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Becslés összesítés</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <SummaryRow label="Anyagköltség" value={result.materialNetTotal} />
          <SummaryRow label="Munkadíj" value={result.laborNetTotal} />
          <SummaryRow label="Egyéb költség" value={result.otherNetTotal} />
          <SummaryRow label="Tartalékkeret" value={result.reserveNetTotal} />
          <SummaryRow label="Nettó összesen" value={result.estimatedNetTotal} strong />
          <SummaryRow label={`ÁFA (${result.vatPercent}%)`} value={result.estimatedVatTotal} strong />
          <SummaryRow label="Bruttó végösszeg" value={result.estimatedGrossTotal} strong />
          <SummaryRow label="Aktuális várható bruttó" value={result.runningGrossTotal} strong />
        </div>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">A kalkuláció tájékoztató jellegű költségbecslés, nem minősül részletes kivitelezői ajánlatnak vagy tételes költségvetésnek.</div>
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl bg-lime-600 px-5 py-3 text-sm font-black text-white hover:bg-lime-700"><Download size={18} /> PDF / nyomtatás</button><button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><Download size={18} /> Excel export</button></div>
      </section>
    </div>
  );
}

function VersionsView({ versions, result, saveToBrowser }: { versions: ReturnType<typeof createVersions>; result: ReturnType<typeof calculateRenovation>; saveToBrowser: () => void }) {
  return (
    <Panel title="Verziók" text="A verziók a jelenlegi kalkulációból számolt mentési állapotok. Adatbázisos mentés később kapcsolható be.">
      <div className="grid gap-4 md:grid-cols-3">
        {versions.map((version) => <MetricCard key={version.id} label={`${version.id} · ${version.name}`} value={ft(version.grossTotal)} sub={`Nettó: ${ft(version.netTotal)} · ${version.createdAt}`} />)}
      </div>
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">Aktuális számított érték: <span className="font-black text-slate-950">{ft(result.estimatedTotal)}</span></div>
      <button type="button" onClick={saveToBrowser} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-lime-600 px-5 py-3 text-sm font-black text-white"><Save size={18} /> Aktuális verzió mentése helyben</button>
    </Panel>
  );
}

function ActualCostsView({ result, updateCategory }: { result: ReturnType<typeof calculateRenovation>; updateCategory: (id: RenovationCategoryId, patch: Partial<RenovationCategoryInput>) => void }) {
  return (
    <Panel title="Tényleges költségek" text="Ha egy munkafolyamat elkészült, jelöld készre, majd add meg a tényleges költségét. A még nem kész munkarészeknél az utolsó becslés marad a várható összegben.">
      <EditableItemsTable result={result} updateCategory={updateCategory} mode="actual" />
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <MetricCard label="Kész tényköltség bruttó" value={ft(result.completedActualGrossTotal)} highlight />
        <MetricCard label="Még becsült rész bruttó" value={ft(result.remainingEstimatedGrossTotal)} />
        <MetricCard label="Aktuális várható bruttó" value={ft(result.runningGrossTotal)} highlight />
        <MetricCard label="Eltérés bruttó" value={`${result.runningDifferenceGross >= 0 ? "+" : ""}${ft(result.runningDifferenceGross)}`} sub={pct(result.runningDifferencePercent)} danger={result.runningDifferenceGross > 0} />
      </div>
    </Panel>
  );
}

function ComparisonView({ result, versions }: { result: ReturnType<typeof calculateRenovation>; versions: ReturnType<typeof createVersions> }) {
  return (
    <Panel title="Összehasonlítás" text="Kész munkarésznél tényköltség, nyitott munkarésznél utolsó becslés szerepel az aktuális várható összegben.">
      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <MetricCard label="Első becslés bruttó" value={ft(versions[0].grossTotal)} />
        <MetricCard label="Véglegesített bruttó" value={ft(versions[2].grossTotal)} />
        <MetricCard label="Kész tényköltség bruttó" value={ft(result.completedActualGrossTotal)} highlight />
        <MetricCard label="Még becsült bruttó" value={ft(result.remainingEstimatedGrossTotal)} />
        <MetricCard label="Aktuális várható bruttó" value={ft(result.runningGrossTotal)} danger={result.runningDifferenceGross > 0} highlight={result.runningDifferenceGross <= 0} sub={`Nettó: ${ft(result.runningNetTotal)} · ${pct(result.runningDifferencePercent)}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs font-black uppercase tracking-[0.08em] text-slate-400"><tr><th className="py-3">Munkarész</th><th>Becslés bruttó</th><th>Aktuális összköltség alapja</th><th>Tényleges költség</th><th>Eltérés bruttó</th></tr></thead>
          <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
            {result.rows.filter((row) => row.enabled).map((row) => {
              const hasActual = row.isCompleted && typeof row.actualCost === "number";
              const good = row.differenceGrossFromEstimate <= 0;
              return (
                <tr key={row.id}>
                  <td className="py-4 font-black text-slate-950">{row.name}</td>
                  <td>{ft(selectedAmount(result, row.estimatedNetTotal, row.estimatedGrossTotal))}</td>
                  <td><span className={`inline-flex min-w-44 flex-col rounded-xl border px-3 py-2 ${hasActual ? good ? "border-lime-200 bg-lime-50 text-lime-700" : "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}><b>{ft(selectedAmount(result, row.runningNetBasis, row.runningGrossBasis))}</b><small className="mt-1 font-black uppercase">{hasActual ? "tényleges adatból" : "utolsó becslésből"}</small></span></td>
                  <td className={hasActual ? good ? "font-black text-lime-700" : "font-black text-red-600" : "text-slate-400"}>{hasActual ? ft(row.runningGrossBasis) : "még nincs tényadat"}</td>
                  <td className={good ? "font-black text-lime-700" : "font-black text-red-600"}>{row.differenceGrossFromEstimate >= 0 ? "+" : ""}{ft(row.differenceGrossFromEstimate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EditableItemsTable({ result, updateCategory, expandCategoryToDetailedRows, mode }: { result: ReturnType<typeof calculateRenovation>; updateCategory: (id: RenovationCategoryId, patch: Partial<RenovationCategoryInput>) => void; expandCategoryToDetailedRows?: (id: RenovationCategoryId) => void; mode: "estimate" | "actual" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="text-xs font-black uppercase tracking-[0.08em] text-slate-400"><tr><th className="py-3">Aktív</th><th>Munkarész</th><th>Mennyiség</th><th>Anyag egységár</th><th>Munkadíj egységár</th><th>Egyéb</th><th>Becslés</th>{mode === "actual" ? <><th>Kész</th><th>Tényleges</th></> : null}</tr></thead>
        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
          {result.rows.map((row) => {
            const Icon = categoryIcons[row.id] ?? ClipboardList;
            return (
              <tr key={row.id} className={!row.enabled ? "opacity-45" : ""}>
                <td className="py-4"><input type="checkbox" checked={row.enabled} onChange={(event) => updateCategory(row.id, { enabled: event.target.checked })} className="h-4 w-4 accent-lime-600" /></td>
                <td className="min-w-72 py-4 align-top font-black text-slate-950">
                  <span className="inline-flex items-center gap-2"><Icon size={18} className="text-slate-400" />{row.name}</span>
                  {row.relatedWorks?.length ? (
                    <div className="mt-2 max-w-xl text-xs font-semibold leading-5 text-slate-500">
                      <span className="font-black text-slate-600">A tételhez jellemzően kapcsolódhat: </span>{row.relatedWorks.slice(0, 8).join(" · ")}
                    </div>
                  ) : null}
                  {mode === "estimate" && row.relatedWorks?.length && expandCategoryToDetailedRows && !row.detailMode && !row.id.includes(":") ? (
                    <button type="button" onClick={() => expandCategoryToDetailedRows(row.id)} className="mt-3 inline-flex rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-lime-700 hover:bg-lime-100">
                      Részletező mód bekapcsolása
                    </button>
                  ) : null}
                </td>
                <td><MiniNumber value={row.quantity} suffix={row.unit} onChange={(value) => updateCategory(row.id, { quantity: value })} /></td>
                <td><MiniNumber value={row.materialUnitPrice} onChange={(value) => updateCategory(row.id, { materialUnitPrice: value })} /></td>
                <td><MiniNumber value={row.laborUnitPrice} onChange={(value) => updateCategory(row.id, { laborUnitPrice: value })} /></td>
                <td><MiniNumber value={row.otherCost} onChange={(value) => updateCategory(row.id, { otherCost: value })} /></td>
                <td className="font-black text-lime-700">{ft(selectedAmount(result, row.estimatedNetTotal, row.estimatedGrossTotal))}</td>
                {mode === "actual" ? <><td><input type="checkbox" checked={!!row.isCompleted} onChange={(event) => updateCategory(row.id, { isCompleted: event.target.checked, actualCost: event.target.checked ? row.actualCost ?? Math.round(row.estimatedTotal) : undefined })} className="h-4 w-4 accent-lime-600" /></td><td><MiniNumber value={row.actualCost ?? 0} disabled={!row.isCompleted} onChange={(value) => updateCategory(row.id, { actualCost: value })} /></td></> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DashboardResult({ result }: { result: ReturnType<typeof calculateRenovation> }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="mb-5 text-xl font-black">Eredmény</h2>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">Munkadíj alap: <span className="font-black text-slate-900">{hourlyRateProfiles.find((profile) => profile.id.includes(result.laborRateMode))?.label ?? "Normaóra × óradíj"}</span></div>
      <div className="text-4xl font-black tracking-[-0.05em] text-lime-700">{ft(result.estimatedGrossTotal)}</div>
      <div className="mt-5 grid gap-3">
        <SummaryRow label="Anyag" value={result.materialNetTotal} />
        <SummaryRow label="Munkadíj" value={result.laborNetTotal} />
        <SummaryRow label="Egyéb" value={result.otherNetTotal} />
        <SummaryRow label="Tartalék" value={result.reserveNetTotal} />
        <SummaryRow label={`ÁFA (${result.vatPercent}%)`} value={result.estimatedVatTotal} />
        <SummaryRow label="Bruttó összesen" value={result.estimatedGrossTotal} strong />
        <SummaryRow label="Aktuális várható bruttó" value={result.runningGrossTotal} strong />
      </div>
    </section>
  );
}

function EnergyCertificateUploadPanel({ onApplySummary }: { onApplySummary?: (summary: EnergyCertificateApiResult["summary"]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<EnergyCertificateApiResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savePdfToArchive, setSavePdfToArchive] = useState(false);
  const [useAnonymizedData, setUseAnonymizedData] = useState(false);

  async function processFiles() {
    if (files.length === 0) {
      setError("Válassz ki legalább egy energetikai tanúsítvány PDF fájlt.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("processAndDeleteOriginalPdf", "true");
      formData.append("saveOriginalPdfToUserAccount", savePdfToArchive ? "true" : "false");
      formData.append("useAnonymizedTechnicalDataForInternalImprovement", useAnonymizedData ? "true" : "false");
      const response = await fetch("/api/renovation-energy-certificate", { method: "POST", body: formData });
      const payload = await response.json() as { ok: boolean; error?: string; results?: EnergyCertificateApiResult[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Nem sikerült feldolgozni a PDF fájlokat.");
      setResults(payload.results ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ismeretlen feldolgozási hiba.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-950">Energetikai tanúsítvány PDF feldolgozás</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            Több PDF is feltölthető egyszerre. A rendszer memóriában dolgozza fel, majd csak a személyes adatoktól megtisztított energetikai összesítőt jeleníti meg. A felismert alapterület és helyiségszám átvehető az alapadatokhoz.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-lime-200 bg-white px-5 py-3 text-sm font-black text-lime-700 shadow-sm hover:bg-lime-50">
          PDF fájlok kiválasztása
          <input type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setResults([]); setError(null); }} />
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <CheckBoxLabel checked readOnly label="Csak feldolgozás, majd eredeti PDF törlése" />
        <CheckBoxLabel checked={savePdfToArchive} onChange={setSavePdfToArchive} label="PDF mentése saját fiókba később" />
        <CheckBoxLabel checked={useAnonymizedData} onChange={setUseAnonymizedData} label="Anonimizált műszaki adat fejlesztési célra" />
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-bold text-slate-600">Kiválasztott fájlok: <span className="font-black text-slate-950">{files.length}</span></div>
        <button type="button" onClick={processFiles} disabled={isProcessing || files.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-lime-600/20 disabled:cursor-not-allowed disabled:bg-slate-300">
          <FileText size={18} /> {isProcessing ? "Feldolgozás..." : "PDF adatok kinyerése"}
        </button>
      </div>

      {files.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {files.map((file) => (
            <span key={`${file.name}-${file.size}`} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">{file.name} · {Math.round(file.size / 1024)} KB</span>
          ))}
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}
      {results.length > 0 ? <div className="mt-5 grid gap-4">{results.map((result) => <CertificateResult key={result.fileName} result={result} onApplySummary={onApplySummary} />)}</div> : null}
    </div>
  );
}

function CertificateResult({ result, onApplySummary }: { result: EnergyCertificateApiResult; onApplySummary?: (summary: EnergyCertificateApiResult["summary"]) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h4 className="text-base font-black text-slate-950">{result.fileName}</h4>
          <p className="mt-1 text-xs font-bold text-slate-500">{result.pageCount ?? 0} oldal · {Math.round(result.fileSize / 1024)} KB · felismerési arány: {result.confidence ?? 0}%</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${result.status === "success" ? "bg-lime-50 text-lime-700" : result.status === "partial" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{result.status === "success" ? "Sikeres" : result.status === "partial" ? "Részleges" : "Sikertelen"}</span>
      </div>

      {result.error ? <p className="mt-4 text-sm font-bold text-red-600">{result.error}</p> : null}
      {result.summary ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <CertificateValue label="HET azonosító" value={result.summary.hetId} />
            <CertificateValue label="Érvényesség" value={result.summary.validUntil} />
            <CertificateValue label="Ingatlan típusa" value={result.summary.propertyType} />
            <CertificateValue label="Alapterület" value={result.summary.usefulFloorArea ? `${result.summary.usefulFloorArea} m²` : undefined} />
            <CertificateValue label="Helyiségek száma" value={result.summary.roomCount ? `${result.summary.roomCount}` : undefined} />
            <CertificateValue label="Energetikai besorolás" value={result.summary.energyRating} />
            <CertificateValue label="CO2 besorolás" value={result.summary.co2Rating} />
            <CertificateValue label="Összesített energetikai jellemző" value={result.summary.aggregatedEnergyPerformance ? `${result.summary.aggregatedEnergyPerformance} kWh/m²év` : undefined} />
            <CertificateValue label="CO2 kibocsátás" value={result.summary.co2Emission ? `${result.summary.co2Emission}` : undefined} />
          </div>
          <button type="button" onClick={() => onApplySummary?.(result.summary)} disabled={!result.summary.usefulFloorArea} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-lime-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-lime-600/20 disabled:cursor-not-allowed disabled:bg-slate-300">
            <CheckCircle2 size={18} /> Alapterület és helyiségszám átvétele
          </button>
        </>
      ) : null}

      {result.summary?.modernizationSuggestions?.length ? (
        <div className="mt-4 rounded-xl border border-lime-200 bg-lime-50 p-4">
          <div className="mb-2 text-sm font-black text-lime-800">Felismert korszerűsítési javaslatok</div>
          <div className="flex flex-wrap gap-2">{result.summary.modernizationSuggestions.map((item) => <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-black text-lime-700 ring-1 ring-lime-100">{item}</span>)}</div>
        </div>
      ) : null}

      {result.warnings?.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">{result.warnings.map((warning) => <div key={warning}>• {warning}</div>)}</div> : null}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-black uppercase tracking-[0.08em] text-slate-500">PDF tárolás: nincs · PDF válaszban: nincs · AI payload: csak anonimizált JSON</div>
    </div>
  );
}

function EnergyCertificateTopCard({ isOpen, setIsOpen, onApplySummary }: { isOpen: boolean; setIsOpen: (value: boolean) => void; onApplySummary: (summary: EnergyCertificateApiResult["summary"]) => void }) {
  return (
    <section className="mt-5 rounded-2xl border border-lime-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-lime-100 text-lime-700"><ShieldCheck size={25} /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-600">Opcionális gyorsítás</p>
            <h2 className="text-xl font-black tracking-[-0.03em] text-slate-950">Energetikai tanúsítvány feltöltése</h2>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Hasznos, mert a tanúsítványból automatikusan átvehető a hasznos alapterület, a helyiségek száma, az energetikai besorolás és a fő korszerűsítési javaslatok. Így kevesebbet kell kézzel beírni, és pontosabb alapadatokból indulhat a felújítási becslés.
            </p>
            <p className="mt-2 text-xs font-bold text-slate-500">Alapértelmezés: a PDF csak feldolgozásra kerül, nem tároljuk el véglegesen.</p>
          </div>
        </div>
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-lime-600/20 hover:bg-lime-700">
          {isOpen ? "Tanúsítvány panel bezárása" : "Tanúsítvány feltöltése"}
          <ChevronDown size={17} className={isOpen ? "rotate-180" : ""} />
        </button>
      </div>

      {isOpen ? <EnergyCertificateUploadPanel onApplySummary={onApplySummary} /> : null}
      {isOpen ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="mb-4 text-sm font-black uppercase tracking-[0.1em] text-slate-500">Felhasználói hozzájárulás</h3>
            <div className="space-y-3">{energyCertificateConsentOptions.map((option) => <CheckBoxLabel key={option.id} checked={option.defaultChecked} readOnly label={option.label} />)}</div>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
            <TagBox title="Alapból nem menthető" tone="red" items={[...energyCertificateForbiddenStoredFields]} />
            <TagBox title="Menthető minimalizált adat" tone="lime" items={[...energyCertificateAllowedMinimalFields]} />
          </div>
        </div>
      ) : null}
      {isOpen ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900"><span className="font-black">AI szabály:</span> {ENERGY_CERTIFICATE_AI_RULE}</div> : null}
    </section>
  );
}


function Panel({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="mb-5 flex items-start gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-lime-100 text-lime-700"><Calculator size={22} /></div><div><h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">{title}</h2><p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-500">{text}</p></div></div>{children}</section>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm font-black text-slate-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-lime-500" /></label>;
}

function MiniNumber({ value, onChange, suffix, disabled }: { value: number; onChange: (value: number) => void; suffix?: string; disabled?: boolean }) {
  return <div className="flex min-w-32 items-center rounded-xl border border-slate-200 bg-white px-3 py-2"><input type="number" value={Number.isFinite(value) ? Math.round(value) : 0} disabled={disabled} onChange={(event) => onChange(toNumber(event.target.value, value))} className="w-full bg-transparent text-sm font-bold outline-none disabled:text-slate-300" />{suffix ? <span className="ml-2 text-xs font-black text-slate-400">{suffix}</span> : null}</div>;
}

function SummaryRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${strong ? "border-lime-200 bg-lime-50" : "border-slate-100 bg-slate-50"}`}>
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${strong ? "bg-lime-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
        <CheckCircle2 size={14} /> {label}
      </span>
      <span className={`font-black ${strong ? "text-lime-700" : "text-slate-800"}`}>{ft(value)}</span>
    </div>
  );
}

function MetricCard({ label, value, sub, highlight, danger }: { label: string; value: string; sub?: string; highlight?: boolean; danger?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${danger ? "border-red-200 bg-red-50" : highlight ? "border-lime-200 bg-lime-50" : "border-slate-200 bg-white"}`}><div className={`text-sm font-black ${danger ? "text-red-700" : highlight ? "text-lime-700" : "text-slate-600"}`}>{label}</div><div className={`mt-4 text-2xl font-black tracking-[-0.04em] ${danger ? "text-red-700" : highlight ? "text-lime-700" : "text-slate-950"}`}>{value}</div>{sub ? <div className="mt-2 text-xs font-semibold text-slate-500">{sub}</div> : null}</div>;
}

function CertificateValue({ label, value }: { label: string; value?: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div><div className="mt-2 text-sm font-black text-slate-800">{value ?? "—"}</div></div>;
}

function CheckBoxLabel({ checked, label, onChange, readOnly }: { checked: boolean; label: string; onChange?: (value: boolean) => void; readOnly?: boolean }) {
  return <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold leading-6 text-slate-700"><input type="checkbox" checked={checked} readOnly={readOnly} onChange={(event) => onChange?.(event.target.checked)} className="mt-1 h-4 w-4 accent-lime-600" /><span>{label}</span></label>;
}

function TagBox({ title, tone, items }: { title: string; tone: "red" | "lime"; items: string[] }) {
  return <div className={`rounded-2xl border p-5 ${tone === "red" ? "border-red-200 bg-red-50" : "border-lime-200 bg-lime-50"}`}><h3 className={`mb-3 text-sm font-black uppercase tracking-[0.1em] ${tone === "red" ? "text-red-700" : "text-lime-800"}`}>{title}</h3><div className="flex flex-wrap gap-2">{items.map((item) => <span key={item} className={`rounded-full bg-white px-3 py-1 text-xs font-black ring-1 ${tone === "red" ? "text-red-700 ring-red-100" : "text-lime-700 ring-lime-100"}`}>{item}</span>)}</div></div>;
}
