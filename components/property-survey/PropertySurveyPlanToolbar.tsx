"use client";

import { ArrowDownToLine, ArrowUpToLine, FileType2, Layers3, Maximize2, Pencil, Scale, Trash2 } from "lucide-react";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  surveyScaleOptions,
  type SurveyBuildingLevel,
  type SurveyPaperOrientation,
  type SurveyPaperSize,
  type SurveyPlanSheetSettings,
} from "@/components/property-survey/propertySurveyBuildingModel";

type PropertySurveyPlanToolbarProps = {
  levels: SurveyBuildingLevel[];
  activeLevelId: string;
  planSheet: SurveyPlanSheetSettings;
  recommendedScale: number;
  canDeleteLevel: boolean;
  onLevelSelect: (levelId: string) => void;
  onAddLevel: (direction: "above" | "below") => void;
  onRenameLevel: (levelId: string, name: string) => void;
  onDeleteLevel: () => void;
  onPlanSheetChange: (patch: Partial<SurveyPlanSheetSettings>) => void;
};

export function PropertySurveyPlanToolbar({
  levels,
  activeLevelId,
  planSheet,
  recommendedScale,
  canDeleteLevel,
  onLevelSelect,
  onAddLevel,
  onRenameLevel,
  onDeleteLevel,
  onPlanSheetChange,
}: PropertySurveyPlanToolbarProps) {
  const sortedLevels = [...levels].sort((left, right) => right.order - left.order);
  const activeLevel = levels.find((level) => level.id === activeLevelId) || levels[0];
  const effectiveScale = planSheet.scaleMode === "auto" ? recommendedScale : planSheet.scaleDenominator;

  return (
    <div className="survey-no-print mb-3 grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 shadow-sm xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--survey-text)]"><Layers3 size={16} className="text-cyan-700" /> Épületszintek</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onAddLevel("above")} className="survey-tool-button"><ArrowUpToLine size={14} /> Szint fölé</button>
            <button type="button" onClick={() => onAddLevel("below")} className="survey-tool-button"><ArrowDownToLine size={14} /> Pince alá</button>
            <HoldActionButton tone="danger" durationMs={2000} compact disabled={!canDeleteLevel} icon={<Trash2 size={14} />} label="Szint törlése · 2 mp" holdingLabel="Törléshez" ariaLabel="Az aktív szint törléséhez tartsd nyomva 2 másodpercig" onComplete={onDeleteLevel} />
          </div>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label="Épületszintek választása">
          {sortedLevels.map((level) => {
            const active = level.id === activeLevelId;
            return (
              <button
                key={level.id}
                type="button"
                data-survey-level-id={level.id}
                data-survey-level-order={level.order}
                data-survey-level-kind={level.kind}
                onClick={() => onLevelSelect(level.id)}
                className={`min-w-[116px] rounded-xl border px-3 py-2 text-left transition ${active ? "border-cyan-500 bg-cyan-50 text-slate-950 ring-2 ring-cyan-200" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)] hover:border-cyan-300"}`}
                aria-pressed={active}
              >
                <div className="text-[9px] font-black uppercase tracking-[0.08em] text-cyan-700">{level.shortName} · {level.elevationMeters >= 0 ? "+" : ""}{level.elevationMeters.toFixed(2)} m</div>
                <div className="mt-1 truncate text-xs font-black">{level.name}</div>
              </button>
            );
          })}
        </div>
        {activeLevel ? (
          <label className="mt-2 grid max-w-md grid-cols-[auto_1fr] items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-2">
            <Pencil size={14} className="text-[var(--survey-muted)]" />
            <input value={activeLevel.name} onChange={(event) => onRenameLevel(activeLevel.id, event.target.value)} className="min-w-0 bg-transparent text-xs font-black text-[var(--survey-text)] outline-none" aria-label="Aktív szint neve" />
          </label>
        ) : null}
      </div>

      <div className="grid content-start gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2 sm:grid-cols-4 xl:w-[540px]">
        <label className="grid gap-1">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase text-[var(--survey-muted)]"><FileType2 size={12} /> Papírméret</span>
          <select value={planSheet.paperSize} onChange={(event) => onPlanSheetChange({ paperSize: event.target.value as SurveyPaperSize })} className="h-9 rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] px-2 text-xs font-black text-[var(--survey-text)]">
            <option value="A4">A4</option><option value="A3">A3</option><option value="A2">A2</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase text-[var(--survey-muted)]"><Maximize2 size={12} /> Elhelyezés</span>
          <select value={planSheet.orientation} onChange={(event) => onPlanSheetChange({ orientation: event.target.value as SurveyPaperOrientation })} className="h-9 rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] px-2 text-xs font-black text-[var(--survey-text)]">
            <option value="landscape">Fekvő</option><option value="portrait">Álló</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="flex items-center gap-1 text-[9px] font-black uppercase text-[var(--survey-muted)]"><Scale size={12} /> Lépték mód</span>
          <select value={planSheet.scaleMode} onChange={(event) => onPlanSheetChange({ scaleMode: event.target.value as SurveyPlanSheetSettings["scaleMode"] })} className="h-9 rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] px-2 text-xs font-black text-[var(--survey-text)]">
            <option value="auto">Automatikus</option><option value="manual">Kézi</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[9px] font-black uppercase text-[var(--survey-muted)]">Lépték</span>
          <select disabled={planSheet.scaleMode === "auto"} value={planSheet.scaleMode === "auto" ? recommendedScale : planSheet.scaleDenominator} onChange={(event) => onPlanSheetChange({ scaleDenominator: Number(event.target.value) })} className="h-9 rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] px-2 text-xs font-black text-[var(--survey-text)] disabled:opacity-70">
            {surveyScaleOptions.map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}
          </select>
        </label>
        <div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] font-bold text-cyan-950">
          <span>{planSheet.paperSize} · {planSheet.orientation === "landscape" ? "fekvő" : "álló"}</span>
          <strong>Aktív lépték: 1:{effectiveScale}</strong>
          {planSheet.scaleMode === "manual" && planSheet.scaleDenominator < recommendedScale ? <span className="font-black text-amber-700">A rajz túllóghat; javasolt 1:{recommendedScale}</span> : <span>Automatikusan a lapra illesztve</span>}
        </div>
      </div>
    </div>
  );
}
