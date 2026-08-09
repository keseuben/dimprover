"use client";

import { useMemo, useState } from "react";
import {
  Brush,
  CircleDot,
  Columns3,
  Download,
  Grid3X3,
  Image as ImageIcon,
  MousePointer2,
  Move,
  Pencil,
  Pentagon,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  calculateIndustrialPolygonArea,
  calculateIndustrialPolylineLength,
  getIndustrialSummary,
  surveyIndustrialMarkupLabels,
  surveyIndustrialToolLabels,
  type SurveyCrackSeverity,
  type SurveyCrackStatus,
  type SurveyIndustrialBackground,
  type SurveyIndustrialBuildingContour,
  type SurveyIndustrialMarkup,
  type SurveyIndustrialSettings,
  type SurveyIndustrialTool,
  type SurveyPillar,
  type SurveyPillarGridInput,
  type SurveyPillarShape,
} from "@/components/property-survey/propertySurveyIndustrialModel";

type PropertySurveyIndustrialPanelProps = {
  tool: SurveyIndustrialTool;
  settings: SurveyIndustrialSettings;
  background: SurveyIndustrialBackground | null;
  buildingContours: SurveyIndustrialBuildingContour[];
  pillars: SurveyPillar[];
  markups: SurveyIndustrialMarkup[];
  activeBuildingContourId: string | null;
  activePillarId: string | null;
  activeMarkupId: string | null;
  activePointIndex: number | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: SurveyIndustrialTool) => void;
  onSettingsChange: (patch: Partial<SurveyIndustrialSettings>) => void;
  onBackgroundImport: (file: File) => Promise<void>;
  onBackgroundUpdate: (patch: Partial<SurveyIndustrialBackground>) => void;
  onBackgroundPageChange: (pageIndex: number) => void;
  onBackgroundTransformReset: () => void;
  onBackgroundDelete: () => void;
  onBuildingContourSelect: (contourId: string) => void;
  onBuildingContourUpdate: (contourId: string, patch: Partial<SurveyIndustrialBuildingContour>) => void;
  onBuildingContourPointInsert: (contourId: string, afterIndex: number | null) => void;
  onBuildingContourPointDelete: (contourId: string, pointIndex: number) => void;
  onBuildingContourDelete: (contourId: string) => void;
  onPillarSelect: (pillarId: string) => void;
  onPillarUpdate: (pillarId: string, patch: Partial<SurveyPillar>) => void;
  onPillarDelete: (pillarId: string) => void;
  onPillarGridGenerate: (input: Omit<SurveyPillarGridInput, "levelId">) => void;
  onMarkupSelect: (markupId: string) => void;
  onMarkupUpdate: (markupId: string, patch: Partial<SurveyIndustrialMarkup>) => void;
  onMarkupPointInsert: (markupId: string, afterIndex: number | null) => void;
  onMarkupPointDelete: (markupId: string, pointIndex: number) => void;
  onMarkupDelete: (markupId: string) => void;
  onExportDxf: () => void;
};

const tools: Array<{ id: SurveyIndustrialTool; icon: typeof MousePointer2; description: string }> = [
  { id: "select", icon: MousePointer2, description: "Elem vagy csomópont kijelölése és mozgatása" },
  { id: "buildingContour", icon: Pentagon, description: "Szabálytalan épületkontúr körberajzolása" },
  { id: "pillar", icon: CircleDot, description: "Pillér elhelyezése az alaprajzon" },
  { id: "crack", icon: Pencil, description: "Repedés felvétele szabadkézi vonallal" },
  { id: "repairArea", icon: SquareDashedMousePointer, description: "Hibás térbeton körberajzolása" },
  { id: "freehand", icon: Brush, description: "Egyéb szabadkézi vektoros jelölés" },
  { id: "transformBackground", icon: Move, description: "A háttér húzása a rajztérben" },
  { id: "calibrateBackground", icon: Ruler, description: "Két ismert ponttal a háttér léptékének beállítása" },
];

const crackSeverityLabels: Record<SurveyCrackSeverity, string> = {
  hairline: "Hajszálrepedés",
  minor: "Kisebb",
  moderate: "Közepes",
  severe: "Súlyos",
};

const crackStatusLabels: Record<SurveyCrackStatus, string> = {
  observed: "Rögzítve",
  monitoring: "Megfigyelés alatt",
  repair_planned: "Javítás tervezve",
  repaired: "Javítva",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]">{children}</span>;
}

export function PropertySurveyIndustrialPanel({
  tool,
  settings,
  background,
  buildingContours,
  pillars,
  markups,
  activeBuildingContourId,
  activePillarId,
  activeMarkupId,
  activePointIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToolChange,
  onSettingsChange,
  onBackgroundImport,
  onBackgroundUpdate,
  onBackgroundPageChange,
  onBackgroundTransformReset,
  onBackgroundDelete,
  onBuildingContourSelect,
  onBuildingContourUpdate,
  onBuildingContourPointInsert,
  onBuildingContourPointDelete,
  onBuildingContourDelete,
  onPillarSelect,
  onPillarUpdate,
  onPillarDelete,
  onPillarGridGenerate,
  onMarkupSelect,
  onMarkupUpdate,
  onMarkupPointInsert,
  onMarkupPointDelete,
  onMarkupDelete,
  onExportDxf,
}: PropertySurveyIndustrialPanelProps) {
  const [backgroundImporting, setBackgroundImporting] = useState(false);
  const [backgroundError, setBackgroundError] = useState("");
  const [pillarGenerator, setPillarGenerator] = useState<Omit<SurveyPillarGridInput, "levelId">>({
    startXMeters: 3,
    startYMeters: 3,
    columns: 4,
    rows: 6,
    spacingXMeters: 5,
    spacingYMeters: 6,
    shape: "rectangle",
    widthMeters: 0.4,
    depthMeters: 0.4,
    diameterMeters: 0.4,
    rotationDegrees: 0,
  });
  const activeBuildingContour = buildingContours.find((contour) => contour.id === activeBuildingContourId) || null;
  const activePillar = pillars.find((pillar) => pillar.id === activePillarId) || null;
  const activeMarkup = markups.find((markup) => markup.id === activeMarkupId) || null;
  const summary = getIndustrialSummary(pillars, markups, buildingContours);
  const generatedPillarCount = Math.min(400, Math.max(1, Math.round(pillarGenerator.columns)) * Math.max(1, Math.round(pillarGenerator.rows)));
  const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
  const textareaClass = "min-h-20 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-semibold text-[var(--survey-text)] outline-none focus:border-cyan-500";
  const activePointText = useMemo(() => activePointIndex === null ? "Nincs kijelölt csomópont" : `${activePointIndex + 1}. csomópont kijelölve`, [activePointIndex]);

  async function importBackground(file: File | undefined) {
    if (!file) return;
    setBackgroundImporting(true);
    setBackgroundError("");
    try {
      await onBackgroundImport(file);
    } catch (error) {
      setBackgroundError(error instanceof Error ? error.message : "A háttérfájl betöltése sikertelen.");
    } finally {
      setBackgroundImporting(false);
    }
  }

  function updateGenerator<K extends keyof typeof pillarGenerator>(key: K, value: (typeof pillarGenerator)[K]) {
    setPillarGenerator((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><Grid3X3 size={20} /></span>
          <div>
            <div className="text-sm font-black">Épület- és csarnokfelmérési rajzi réteg</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">A háttér, az épületkontúr, a pillérek és a hibajelölések külön rétegen maradnak. A v0.5.2-ben a pontok beszúrhatók, törölhetők és illeszthetők.</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" data-industrial-history="undo" onClick={onUndo} disabled={!canUndo} className="survey-action-secondary disabled:cursor-not-allowed disabled:opacity-40"><Undo2 size={16} /> Visszavonás</button>
        <button type="button" data-industrial-history="redo" onClick={onRedo} disabled={!canRedo} className="survey-action-secondary disabled:cursor-not-allowed disabled:opacity-40"><Redo2 size={16} /> Ismétlés</button>
      </div>

      <div className="grid gap-2">
        <div className="text-sm font-black text-[var(--survey-text)]">Rajzeszköz</div>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            const disabled = (item.id === "calibrateBackground" || item.id === "transformBackground") && !background;
            return <button key={item.id} type="button" data-industrial-tool={item.id} disabled={disabled} onClick={() => onToolChange(item.id)} className={`rounded-xl border p-3 text-left transition ${active ? "border-cyan-500 bg-cyan-50 text-slate-950 ring-2 ring-cyan-200" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)] hover:border-cyan-300"} disabled:cursor-not-allowed disabled:opacity-45`} aria-pressed={active}><div className="flex items-center gap-2"><Icon size={17} className={active ? "text-cyan-700" : "text-[var(--survey-muted)]"} /><span className="text-xs font-black">{surveyIndustrialToolLabels[item.id]}</span></div><div className={`mt-1 text-[9px] font-semibold leading-4 ${active ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{item.description}</div></button>;
          })}
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-slate-950">
        <div className="flex items-center gap-2 text-sm font-black"><ImageIcon size={17} className="text-indigo-700" /> PDF vagy kép háttér</div>
        {!background ? <label className="survey-action-secondary cursor-pointer bg-white text-slate-950"><Upload size={17} /> {backgroundImporting ? "Feldolgozás..." : "Háttérfájl betöltése"}<input type="file" data-industrial-background-input="create" className="hidden" accept="application/pdf,image/*" disabled={backgroundImporting} onChange={(event) => { void importBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label> : <>
          <div className="rounded-xl border border-indigo-200 bg-white p-3"><div className="truncate text-xs font-black">{background.fileName}</div><div className="mt-1 text-[9px] font-bold text-slate-500">{background.sourceWidthPixels} × {background.sourceHeightPixels} px · {background.mimeType === "application/pdf" ? `${background.activePageIndex + 1}/${background.sourcePageCount}. PDF oldal` : "optimalizált kép"}</div>{background.sourcePageCount > background.pageCount ? <div className="mt-1 text-[9px] font-bold text-amber-700">Az első {background.pageCount} oldal került helyi előnézetként eltárolásra.</div> : null}</div>
          {background.pageCount > 1 ? <label><FieldLabel>Aktív PDF oldal</FieldLabel><select data-industrial-background-page className="h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold" value={background.activePageIndex} onChange={(event) => onBackgroundPageChange(Number(event.target.value))}>{background.pages.map((page, index) => <option key={page.pageNumber} value={index}>{page.pageNumber}. oldal · {page.widthPixels} × {page.heightPixels} px</option>)}</select></label> : null}
          <label className="flex items-center justify-between rounded-xl border border-indigo-200 bg-white px-3 py-3 text-sm font-black"><span>Háttér látható</span><input type="checkbox" checked={background.visible} onChange={(event) => onBackgroundUpdate({ visible: event.target.checked, updatedAt: new Date().toISOString() })} className="h-5 w-5 accent-indigo-600" /></label>
          <label><FieldLabel>Háttér erőssége · {Math.round(background.opacity * 100)}%</FieldLabel><input type="range" min="0.05" max="1" step="0.05" value={background.opacity} onChange={(event) => onBackgroundUpdate({ opacity: Number(event.target.value), updatedAt: new Date().toISOString() })} className="w-full accent-indigo-600" /></label>
          <label className="flex items-center justify-between rounded-xl border border-indigo-200 bg-white px-3 py-3 text-sm font-black"><span>Szürkeárnyalatos háttér</span><input type="checkbox" checked={background.grayscale} onChange={(event) => onBackgroundUpdate({ grayscale: event.target.checked, updatedAt: new Date().toISOString() })} className="h-5 w-5 accent-indigo-600" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><FieldLabel>Eltolás X (m)</FieldLabel><input data-background-transform="x" type="number" step="0.1" className="h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold" value={background.offsetXMeters} onChange={(event) => onBackgroundUpdate({ offsetXMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label>
            <label><FieldLabel>Eltolás Y (m)</FieldLabel><input data-background-transform="y" type="number" step="0.1" className="h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold" value={background.offsetYMeters} onChange={(event) => onBackgroundUpdate({ offsetYMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label>
            <label><FieldLabel>Forgatás (°)</FieldLabel><input data-background-transform="rotation" type="number" step="0.5" className="h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold" value={background.rotationDegrees} onChange={(event) => onBackgroundUpdate({ rotationDegrees: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label>
            <label><FieldLabel>Méret (%)</FieldLabel><input data-background-transform="scale" type="number" min="10" max="400" step="1" className="h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold" value={background.scalePercent} onChange={(event) => onBackgroundUpdate({ scalePercent: Math.min(400, Math.max(10, Number(event.target.value) || 100)), updatedAt: new Date().toISOString() })} /></label>
          </div>
          <button type="button" data-background-transform-reset onClick={onBackgroundTransformReset} className="survey-action-secondary bg-white text-slate-950"><RotateCcw size={16} /> Háttérhelyzet alaphelyzetbe</button>
          <label><FieldLabel>Kalibrációs távolság (m)</FieldLabel><input type="number" min="0.01" step="0.01" className="h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold" value={background.calibrationDistanceMeters} onChange={(event) => onBackgroundUpdate({ calibrationDistanceMeters: Math.max(0.01, Number(event.target.value) || 0.01), calibrationPoints: [], updatedAt: new Date().toISOString() })} /></label>
          <div className="rounded-xl border border-indigo-200 bg-white p-3 text-[10px] font-semibold leading-5 text-slate-600">A <strong>Háttér mozgatása</strong> eszközzel húzd a rajzot a kívánt helyre. A forgatás és méret pontosan megadható. Kalibráláskor jelöld ki az ismert szakasz két végpontját.</div>
          {background.calibratedAt ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-black text-emerald-800">Kalibrálva · szorzó: {(background.calibrationScaleFactor || 1).toFixed(4)}</div> : null}
          <div className="grid grid-cols-2 gap-2"><label className="survey-action-secondary cursor-pointer bg-white text-slate-950"><Upload size={16} /> Csere<input type="file" data-industrial-background-input="replace" className="hidden" accept="application/pdf,image/*" disabled={backgroundImporting} onChange={(event) => { void importBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button type="button" onClick={onBackgroundDelete} className="survey-action-danger"><Trash2 size={16} /> Törlés</button></div>
        </>}
        {backgroundError ? <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">{backgroundError}</div> : null}
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--survey-text)]"><Ruler size={17} className="text-cyan-700" /> Kalibrált munkaterület és illesztés</div>
        <div className="grid grid-cols-2 gap-3">
          <label><FieldLabel>Szélesség (m)</FieldLabel><input type="number" min="1" step="0.01" className={inputClass} value={settings.planWidthMeters} onChange={(event) => onSettingsChange({ planWidthMeters: Math.max(1, Number(event.target.value) || 1), updatedAt: new Date().toISOString() })} /></label>
          <label><FieldLabel>Hossz (m)</FieldLabel><input type="number" min="1" step="0.01" className={inputClass} value={settings.planHeightMeters} onChange={(event) => onSettingsChange({ planHeightMeters: Math.max(1, Number(event.target.value) || 1), updatedAt: new Date().toISOString() })} /></label>
          <label><FieldLabel>Pillértengely X (m)</FieldLabel><input type="number" min="0.1" step="0.05" className={inputClass} value={settings.gridSpacingXMeters} onChange={(event) => onSettingsChange({ gridSpacingXMeters: Math.max(0.1, Number(event.target.value) || 0.1), updatedAt: new Date().toISOString() })} /></label>
          <label><FieldLabel>Pillértengely Y (m)</FieldLabel><input type="number" min="0.1" step="0.05" className={inputClass} value={settings.gridSpacingYMeters} onChange={(event) => onSettingsChange({ gridSpacingYMeters: Math.max(0.1, Number(event.target.value) || 0.1), updatedAt: new Date().toISOString() })} /></label>
        </div>
        <label className="flex items-center justify-between rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-3 text-sm font-black text-[var(--survey-text)]"><span>Tengelyrács megjelenítése</span><input type="checkbox" checked={settings.showAxisGrid} onChange={(event) => onSettingsChange({ showAxisGrid: event.target.checked, updatedAt: new Date().toISOString() })} className="h-5 w-5 accent-cyan-600" /></label>
        <label className="flex items-center justify-between rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-3 text-sm font-black text-[var(--survey-text)]"><span>Tengelyrácsra illesztés</span><input data-industrial-snap="grid" type="checkbox" checked={settings.snapToGrid} onChange={(event) => onSettingsChange({ snapToGrid: event.target.checked, updatedAt: new Date().toISOString() })} className="h-5 w-5 accent-cyan-600" /></label>
        <label className="flex items-center justify-between rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-3 text-sm font-black text-[var(--survey-text)]"><span>Derékszög-illesztés</span><input data-industrial-snap="right-angle" type="checkbox" checked={settings.snapToRightAngle} onChange={(event) => onSettingsChange({ snapToRightAngle: event.target.checked, updatedAt: new Date().toISOString() })} className="h-5 w-5 accent-cyan-600" /></label>
        <label><FieldLabel>Illesztési tűrés (m)</FieldLabel><input data-industrial-snap="tolerance" type="number" min="0.01" step="0.01" className={inputClass} value={settings.snapToleranceMeters} onChange={(event) => onSettingsChange({ snapToleranceMeters: Math.max(0.01, Number(event.target.value) || 0.01), updatedAt: new Date().toISOString() })} /></label>
      </div>

      <details className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-slate-950">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black"><Columns3 size={17} className="text-violet-700" /> Automatikus pillérsor-generátor</summary>
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label><FieldLabel>Kezdő X (m)</FieldLabel><input type="number" step="0.1" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.startXMeters} onChange={(event) => updateGenerator("startXMeters", Number(event.target.value) || 0)} /></label>
            <label><FieldLabel>Kezdő Y (m)</FieldLabel><input type="number" step="0.1" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.startYMeters} onChange={(event) => updateGenerator("startYMeters", Number(event.target.value) || 0)} /></label>
            <label><FieldLabel>Oszlopok</FieldLabel><input type="number" min="1" max="40" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.columns} onChange={(event) => updateGenerator("columns", Math.min(40, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label><FieldLabel>Sorok</FieldLabel><input type="number" min="1" max="40" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.rows} onChange={(event) => updateGenerator("rows", Math.min(40, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label><FieldLabel>X kiosztás (m)</FieldLabel><input type="number" min="0.1" step="0.1" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.spacingXMeters} onChange={(event) => updateGenerator("spacingXMeters", Math.max(0.1, Number(event.target.value) || 0.1))} /></label>
            <label><FieldLabel>Y kiosztás (m)</FieldLabel><input type="number" min="0.1" step="0.1" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.spacingYMeters} onChange={(event) => updateGenerator("spacingYMeters", Math.max(0.1, Number(event.target.value) || 0.1))} /></label>
          </div>
          <label><FieldLabel>Pilléralak</FieldLabel><select className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.shape} onChange={(event) => updateGenerator("shape", event.target.value as SurveyPillarShape)}><option value="rectangle">Négyszög</option><option value="circle">Kör</option></select></label>
          {pillarGenerator.shape === "circle" ? <label><FieldLabel>Átmérő (m)</FieldLabel><input type="number" min="0.05" step="0.01" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.diameterMeters} onChange={(event) => updateGenerator("diameterMeters", Math.max(0.05, Number(event.target.value) || 0.05))} /></label> : <div className="grid grid-cols-2 gap-3"><label><FieldLabel>Szélesség (m)</FieldLabel><input type="number" min="0.05" step="0.01" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.widthMeters} onChange={(event) => updateGenerator("widthMeters", Math.max(0.05, Number(event.target.value) || 0.05))} /></label><label><FieldLabel>Mélység (m)</FieldLabel><input type="number" min="0.05" step="0.01" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.depthMeters} onChange={(event) => updateGenerator("depthMeters", Math.max(0.05, Number(event.target.value) || 0.05))} /></label></div>}
          <label><FieldLabel>Forgatás (°)</FieldLabel><input type="number" step="1" className="h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold" value={pillarGenerator.rotationDegrees} onChange={(event) => updateGenerator("rotationDegrees", Number(event.target.value) || 0)} /></label>
          <button type="button" data-pillar-grid-generate onClick={() => onPillarGridGenerate(pillarGenerator)} className="survey-action-primary"><Plus size={17} /> {generatedPillarCount} pillér létrehozása</button>
          <div className="text-[9px] font-semibold leading-4 text-violet-800">Legfeljebb 400 pillér hozható létre egy művelettel. A munkaterületen kívüli pontok a rajzhatárra korlátozódnak.</div>
        </div>
      </details>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-cyan-800">Épületkontúr</div><div className="mt-1 text-xl font-black">{summary.buildingContourCount} db</div></div>
        <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">Pillér</div><div className="mt-1 text-xl font-black text-[var(--survey-text)]">{summary.pillarCount} db</div></div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-rose-700">Repedés</div><div className="mt-1 text-xl font-black">{summary.crackLengthMeters.toFixed(1).replace(".", ",")} fm</div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-slate-950"><div className="text-[9px] font-black uppercase text-amber-800">Hibás térbeton</div><div className="mt-1 text-xl font-black">{summary.repairAreaSquareMeters.toFixed(1).replace(".", ",")} m²</div></div>
      </div>

      {buildingContours.length ? <div><div className="mb-2 text-sm font-black text-[var(--survey-text)]">Épületkontúrok</div><div className="grid max-h-36 gap-2 overflow-y-auto pr-1">{buildingContours.map((contour) => <button key={contour.id} type="button" onClick={() => onBuildingContourSelect(contour.id)} className={`rounded-xl border px-3 py-2 text-left ${contour.id === activeBuildingContourId ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="text-xs font-black">{contour.serial} · {contour.title}</div><div className={`mt-1 text-[10px] font-bold ${contour.id === activeBuildingContourId ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{calculateIndustrialPolygonArea(contour.points).toFixed(2)} m² · {contour.points.length} csomópont</div></button>)}</div></div> : null}

      {pillars.length ? <div><div className="mb-2 text-sm font-black text-[var(--survey-text)]">Pillérek</div><div className="grid max-h-36 gap-2 overflow-y-auto pr-1">{pillars.map((pillar) => <button key={pillar.id} type="button" onClick={() => onPillarSelect(pillar.id)} className={`rounded-xl border px-3 py-2 text-left text-xs font-black ${pillar.id === activePillarId ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}>{pillar.label} · {pillar.shape === "circle" ? `Ø ${pillar.diameterMeters.toFixed(2)} m` : `${pillar.widthMeters.toFixed(2)} × ${pillar.depthMeters.toFixed(2)} m`}</button>)}</div></div> : null}

      {markups.length ? <div><div className="mb-2 text-sm font-black text-[var(--survey-text)]">Jelölések</div><div className="grid max-h-44 gap-2 overflow-y-auto pr-1">{markups.map((markup) => { const quantity = markup.kind === "repairArea" ? `${calculateIndustrialPolygonArea(markup.points).toFixed(2)} m²` : `${calculateIndustrialPolylineLength(markup.points).toFixed(2)} m`; return <button key={markup.id} type="button" onClick={() => onMarkupSelect(markup.id)} className={`rounded-xl border px-3 py-2 text-left ${markup.id === activeMarkupId ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="text-xs font-black">{markup.serial} · {surveyIndustrialMarkupLabels[markup.kind]}</div><div className={`mt-1 text-[10px] font-bold ${markup.id === activeMarkupId ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{quantity} · {markup.points.length} csomópont</div></button>; })}</div></div> : null}

      {activeBuildingContour ? <div className="grid gap-3 border-t border-[var(--survey-border)] pt-4">
        <div className="text-sm font-black text-[var(--survey-text)]">Aktív épületkontúr · {activeBuildingContour.serial}</div>
        <label><FieldLabel>Megnevezés</FieldLabel><input className={inputClass} value={activeBuildingContour.title} onChange={(event) => onBuildingContourUpdate(activeBuildingContour.id, { title: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-black text-slate-950">Terület: {calculateIndustrialPolygonArea(activeBuildingContour.points).toFixed(2).replace(".", ",")} m² · {activeBuildingContour.points.length} csomópont</div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[10px] font-semibold leading-5 text-slate-600">{activePointText}. Beszúráskor a kijelölt pont utáni él felezőpontja jön létre; kijelölés nélkül a leghosszabb él felezőpontja.</div>
        <div className="grid grid-cols-2 gap-2"><button type="button" data-point-action="insert-building" onClick={() => onBuildingContourPointInsert(activeBuildingContour.id, activePointIndex)} className="survey-action-secondary"><Plus size={16} /> Pont beszúrása</button><button type="button" data-point-action="delete-building" disabled={activePointIndex === null || activeBuildingContour.points.length <= 3} onClick={() => activePointIndex !== null && onBuildingContourPointDelete(activeBuildingContour.id, activePointIndex)} className="survey-action-danger disabled:opacity-40"><Trash2 size={16} /> Pont törlése</button></div>
        <label><FieldLabel>Megjegyzés</FieldLabel><textarea className={textareaClass} value={activeBuildingContour.note} onChange={(event) => onBuildingContourUpdate(activeBuildingContour.id, { note: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16} />} label="Kontúr törlése · 2 mp" holdingLabel="Törléshez" onComplete={() => onBuildingContourDelete(activeBuildingContour.id)} className="w-full" />
      </div> : null}

      {activePillar ? <div className="grid gap-3 border-t border-[var(--survey-border)] pt-4">
        <div className="text-sm font-black text-[var(--survey-text)]">Aktív pillér · {activePillar.serial}</div>
        <label><FieldLabel>Megnevezés</FieldLabel><input className={inputClass} value={activePillar.label} onChange={(event) => onPillarUpdate(activePillar.id, { label: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <label><FieldLabel>Alak</FieldLabel><select className={inputClass} value={activePillar.shape} onChange={(event) => onPillarUpdate(activePillar.id, { shape: event.target.value as SurveyPillar["shape"], updatedAt: new Date().toISOString() })}><option value="rectangle">Négyszög</option><option value="circle">Kör</option></select></label>
        {activePillar.shape === "circle" ? <label><FieldLabel>Átmérő (m)</FieldLabel><input type="number" min="0.05" step="0.01" className={inputClass} value={activePillar.diameterMeters} onChange={(event) => onPillarUpdate(activePillar.id, { diameterMeters: Math.max(0.05, Number(event.target.value) || 0.05), updatedAt: new Date().toISOString() })} /></label> : <div className="grid grid-cols-2 gap-3"><label><FieldLabel>Szélesség (m)</FieldLabel><input type="number" min="0.05" step="0.01" className={inputClass} value={activePillar.widthMeters} onChange={(event) => onPillarUpdate(activePillar.id, { widthMeters: Math.max(0.05, Number(event.target.value) || 0.05), updatedAt: new Date().toISOString() })} /></label><label><FieldLabel>Mélység (m)</FieldLabel><input type="number" min="0.05" step="0.01" className={inputClass} value={activePillar.depthMeters} onChange={(event) => onPillarUpdate(activePillar.id, { depthMeters: Math.max(0.05, Number(event.target.value) || 0.05), updatedAt: new Date().toISOString() })} /></label></div>}
        <div className="grid grid-cols-2 gap-3"><label><FieldLabel>X (m)</FieldLabel><input type="number" step="0.01" className={inputClass} value={activePillar.xMeters} onChange={(event) => onPillarUpdate(activePillar.id, { xMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label><label><FieldLabel>Y (m)</FieldLabel><input type="number" step="0.01" className={inputClass} value={activePillar.yMeters} onChange={(event) => onPillarUpdate(activePillar.id, { yMeters: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label></div>
        <label><FieldLabel>Forgatás (°)</FieldLabel><input type="number" step="1" className={inputClass} value={activePillar.rotationDegrees} onChange={(event) => onPillarUpdate(activePillar.id, { rotationDegrees: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} /></label>
        <label><FieldLabel>Megjegyzés</FieldLabel><textarea className={textareaClass} value={activePillar.note} onChange={(event) => onPillarUpdate(activePillar.id, { note: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16} />} label="Pillér törlése · 2 mp" holdingLabel="Törléshez" onComplete={() => onPillarDelete(activePillar.id)} className="w-full" />
      </div> : null}

      {activeMarkup ? <div className="grid gap-3 border-t border-[var(--survey-border)] pt-4">
        <div className="text-sm font-black text-[var(--survey-text)]">Aktív jelölés · {activeMarkup.serial}</div>
        <label><FieldLabel>Megnevezés</FieldLabel><input className={inputClass} value={activeMarkup.title} onChange={(event) => onMarkupUpdate(activeMarkup.id, { title: event.target.value, updatedAt: new Date().toISOString() })} /></label>
        <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-sm font-black text-[var(--survey-text)]">{activeMarkup.kind === "repairArea" ? `Terület: ${calculateIndustrialPolygonArea(activeMarkup.points).toFixed(2).replace(".", ",")} m²` : `Hossz: ${calculateIndustrialPolylineLength(activeMarkup.points).toFixed(2).replace(".", ",")} m`} · {activeMarkup.points.length} csomópont</div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[10px] font-semibold leading-5 text-slate-600">{activePointText}. Nyitott vonalnál legalább 2, zárt poligonnál legalább 3 pont marad.</div>
        <div className="grid grid-cols-2 gap-2"><button type="button" data-point-action="insert-markup" onClick={() => onMarkupPointInsert(activeMarkup.id, activePointIndex)} className="survey-action-secondary"><Plus size={16} /> Pont beszúrása</button><button type="button" data-point-action="delete-markup" disabled={activePointIndex === null || activeMarkup.points.length <= (activeMarkup.closed ? 3 : 2)} onClick={() => activePointIndex !== null && onMarkupPointDelete(activeMarkup.id, activePointIndex)} className="survey-action-danger disabled:opacity-40"><Trash2 size={16} /> Pont törlése</button></div>
        {activeMarkup.kind === "crack" ? <div className="grid gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-slate-950">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-rose-800">Részletes repedésadatlap</div>
          <div className="grid grid-cols-2 gap-3"><label><FieldLabel>Súlyosság</FieldLabel><select data-crack-field="severity" className="h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold" value={activeMarkup.crackSeverity} onChange={(event) => onMarkupUpdate(activeMarkup.id, { crackSeverity: event.target.value as SurveyCrackSeverity, updatedAt: new Date().toISOString() })}>{Object.entries(crackSeverityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><FieldLabel>Státusz</FieldLabel><select data-crack-field="status" className="h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold" value={activeMarkup.crackStatus} onChange={(event) => onMarkupUpdate(activeMarkup.id, { crackStatus: event.target.value as SurveyCrackStatus, updatedAt: new Date().toISOString() })}>{Object.entries(crackStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="grid grid-cols-2 gap-3"><label><FieldLabel>Repedésszélesség (mm)</FieldLabel><input data-crack-field="width" type="number" min="0" step="0.1" className="h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold" value={activeMarkup.crackWidthMillimeters} onChange={(event) => onMarkupUpdate(activeMarkup.id, { crackWidthMillimeters: Math.max(0, Number(event.target.value) || 0), updatedAt: new Date().toISOString() })} /></label><label><FieldLabel>Becsült mélység (mm)</FieldLabel><input data-crack-field="depth" type="number" min="0" step="1" className="h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold" value={activeMarkup.crackDepthMillimeters} onChange={(event) => onMarkupUpdate(activeMarkup.id, { crackDepthMillimeters: Math.max(0, Number(event.target.value) || 0), updatedAt: new Date().toISOString() })} /></label></div>
          <label><FieldLabel>Rögzítés dátuma</FieldLabel><input data-crack-field="date" type="date" className="h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold" value={activeMarkup.recordedAt} onChange={(event) => onMarkupUpdate(activeMarkup.id, { recordedAt: event.target.value, updatedAt: new Date().toISOString() })} /></label>
          <label><FieldLabel>Hely / szerkezetrész</FieldLabel><input data-crack-field="location" className="h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold" value={activeMarkup.locationDescription} onChange={(event) => onMarkupUpdate(activeMarkup.id, { locationDescription: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Pl. 12. épület, 3–4. tengely között" /></label>
          <label><FieldLabel>Feltételezett ok</FieldLabel><textarea data-crack-field="cause" className="min-h-20 w-full rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold" value={activeMarkup.causeAssessment} onChange={(event) => onMarkupUpdate(activeMarkup.id, { causeAssessment: event.target.value, updatedAt: new Date().toISOString() })} /></label>
          <label><FieldLabel>Tervezett javítás</FieldLabel><textarea data-crack-field="repair" className="min-h-20 w-full rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold" value={activeMarkup.repairMethod} onChange={(event) => onMarkupUpdate(activeMarkup.id, { repairMethod: event.target.value, updatedAt: new Date().toISOString() })} /></label>
          <label className="flex items-center justify-between rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-black"><span>Statikus felülvizsgálat szükséges</span><input data-crack-field="structural-review" type="checkbox" checked={activeMarkup.requiresStructuralReview} onChange={(event) => onMarkupUpdate(activeMarkup.id, { requiresStructuralReview: event.target.checked, updatedAt: new Date().toISOString() })} className="h-5 w-5 accent-rose-600" /></label>
        </div> : null}
        <label><FieldLabel>Megjegyzés / javítási mód</FieldLabel><textarea className={`${textareaClass} min-h-24`} value={activeMarkup.note} onChange={(event) => onMarkupUpdate(activeMarkup.id, { note: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Pl. nagyobb rések betonjavítása, bitumenes tömítés" /></label>
        <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16} />} label="Jelölés törlése · 2 mp" holdingLabel="Törléshez" onComplete={() => onMarkupDelete(activeMarkup.id)} className="w-full" />
      </div> : null}

      <button type="button" onClick={onExportDxf} className="survey-action-primary w-full"><Download size={18} /> Rétegezett DXF export</button>
      <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">A DXF milliméter egységű. A hibás térbetonfelületek zárt poligonként és valódi <strong>ANSI31 HATCH</strong> elemként kerülnek a <strong>DIMPRO_CONCRETE_REPAIR</strong> rétegre.</div>
    </div>
  );
}
