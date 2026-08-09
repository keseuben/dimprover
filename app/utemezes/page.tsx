"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CloudSun,
  Diamond,
  Eye,
  FileSignature,
  Hammer,
  KeyRound,
  Minus,
  MoreHorizontal,
  HelpCircle,
  Percent,
  PencilRuler,
  Pin,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  SplitSquareVertical,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import ModulePanel from "@/components/layout/ModulePanel";
import FeatureToggle from "@/components/schedule/FeatureToggle";
import GridLines from "@/components/schedule/GridLines";
import TimelineHeader from "@/components/schedule/TimelineHeader";
import VirtualScheduleRenderer from "@/components/schedule/VirtualScheduleRenderer";
import DependencyLayer from "@/components/schedule/layers/DependencyLayer";
import CreateTaskModal, { ScheduleTaskInput } from "@/components/schedule/CreateTaskModal";

import { buildVisibleRows } from "@/app/lib/schedule/rowBuilder";
import {
  calculateVisibleRowLayout,
  getVisibleRowRange,
} from "@/app/lib/schedule/rowLayoutEngine";
import {
  addTaskToCategory,
  createEmptySchedule,
  deleteTaskFromSchedule,
  updateTaskInSchedule,
} from "@/app/lib/schedule/helpers";
import { initialSchedule } from "@/app/lib/schedule/sampleSchedule";
import { normalizeSchedule } from "@/app/lib/schedule/normalizer";
import { selectAllTasks, selectTaskRows } from "@/app/lib/schedule/selectors";
import { getVisibleDateRange } from "@/app/lib/schedule/viewportEngine";
import {
  differenceInDays,
  getXFromDate,
  toDate,
  toIsoDate,
} from "@/app/lib/schedule/timelineEngine";
import {
  LEFT_COL_WIDTH,
  TYPE_COL_WIDTH,
  diffInDays,
} from "@/app/lib/schedule/timeline";
import {
  ScheduleBarInteractionMode,
  ScheduleFeatureState,
  ScheduleLocation,
  ScheduleSource,
  ScheduleTask,
  ViewMode,
} from "@/app/lib/schedule/types";

const STORAGE_KEY = "dimprover.practice.schedule.v1";
const DIMPRO_GANTT_VIEWPORT_HEIGHT_KEY = "dimprover-gantt-viewport-height";
const SCHEDULE_BUILD_MARKER = "Ütemterv javítás aktív: drag-collapse-v3";

const stickyFirstCol =
  "sticky left-0 z-[220] flex items-center gap-2 border-r border-slate-300 px-4 text-left shadow-[3px_0_0_rgba(226,232,240,0.9)]";

const stickySecondCol = "sticky z-[220] border-r border-slate-200";

const initialFeatures: ScheduleFeatureState = {
  showContractBars: true,
  showActualBars: true,
  showProgressOverlay: true,
  showTodayLine: true,
  showLegend: true,
  showCollapsedSummaryBars: true,
  showFilters: true,
  showPdfExport: true,
  showViewSwitcher: true,
  showFloatingToolbar: true,
  showWeekendHighlight: true,
  showHolidayHighlight: true,
  showMilestoneTypeIcon: true,
  showMilestoneStatusIcon: true,
  showMilestonePriorityMarker: true,
};

type ScheduleBoundary = {
  id: string;
  title: string;
  date: string;
  color: string;
};

type SavedVersion = {
  id: string;
  name: string;
  savedAt: string;
  template: string;
};

type ManualHoliday = {
  id: string;
  title: string;
  date: string;
};

type ScheduleMilestoneStatus = "planned" | "in_progress" | "completed" | "delayed" | "closed" | "cancelled";
type ScheduleMilestoneType = "preparation" | "design" | "permitting" | "construction" | "contract" | "handover" | "finance" | "other";
type ScheduleMilestonePriority = "normal" | "important" | "critical";

type ScheduleMilestone = {
  id: string;
  name: string;
  date: string;
  type: ScheduleMilestoneType;
  relatedTaskId: number | null;
  owner: string;
  status: ScheduleMilestoneStatus;
  priority: ScheduleMilestonePriority;
  note: string;
  showType: boolean;
  showStatus: boolean;
  showPriority: boolean;
};

type ScheduleMilestoneForm = Omit<ScheduleMilestone, "id">;

const milestoneStatusLabels: Record<ScheduleMilestoneStatus, string> = {
  planned: "Tervezett",
  in_progress: "Folyamatban",
  completed: "Teljesült",
  delayed: "Csúszik",
  closed: "Lezárt",
  cancelled: "Törölt",
};

const milestoneStatusIcons: Record<ScheduleMilestoneStatus, React.ElementType> = {
  planned: Clock3,
  in_progress: TimerReset,
  completed: CheckCircle2,
  delayed: AlertTriangle,
  closed: ShieldCheck,
  cancelled: Ban,
};


const milestoneTypeLabels: Record<ScheduleMilestoneType, string> = {
  preparation: "Előkészítési",
  design: "Tervezési",
  permitting: "Engedélyezési",
  construction: "Kivitelezési",
  contract: "Szerződéses",
  handover: "Átadási",
  finance: "Pénzügyi",
  other: "Egyéb",
};

const milestonePriorityLabels: Record<ScheduleMilestonePriority, string> = {
  normal: "Normál",
  important: "Fontos",
  critical: "Kritikus",
};

const milestoneTypeIcons: Record<ScheduleMilestoneType, React.ElementType> = {
  preparation: ClipboardList,
  design: PencilRuler,
  permitting: ShieldCheck,
  construction: Hammer,
  contract: FileSignature,
  handover: KeyRound,
  finance: WalletCards,
  other: MoreHorizontal,
};


const milestonePriorityClasses: Record<ScheduleMilestonePriority, string> = {
  normal: "border-blue-200 bg-blue-600 text-white shadow-[0_0_18px_rgba(37,99,235,0.28)]",
  important: "border-orange-200 bg-orange-500 text-white shadow-[0_0_22px_rgba(249,115,22,0.34)]",
  critical: "border-red-200 bg-red-600 text-white shadow-[0_0_26px_rgba(220,38,38,0.40)]",
};

const milestonePriorityLineClasses: Record<ScheduleMilestonePriority, string> = {
  normal: "border-blue-600/70",
  important: "border-orange-500/75",
  critical: "border-red-600/75",
};

function createDefaultMilestone(date: string, relatedTaskId: number | null = null): ScheduleMilestoneForm {
  return {
    name: "Új mérföldkő",
    date,
    type: "construction",
    relatedTaskId,
    owner: "Projektvezetés",
    status: "planned",
    priority: "important",
    note: "",
    showType: true,
    showStatus: true,
    showPriority: true,
  };
}


type PdfPaperSize = "A4" | "A3" | "A2" | "A1";
type PdfOrientation = "landscape" | "portrait";

const PDF_PAGE_MM: Record<PdfPaperSize, { width: number; height: number; chart: number }> = {
  A4: { width: 297, height: 210, chart: 1050 },
  A3: { width: 420, height: 297, chart: 1500 },
  A2: { width: 594, height: 420, chart: 2150 },
  A1: { width: 841, height: 594, chart: 3050 },
};

type PersistedSchedule = {
  scheduleName: string;
  schedule: ScheduleLocation[];
  boundaries: ScheduleBoundary[];
  versions: SavedVersion[];
  timelineStartDate: string;
  timelineEndDate: string;
  manualHolidays?: ManualHoliday[];
  milestones?: ScheduleMilestone[];
};

const boundaryColors = [
  { label: "Kék", value: "#2563eb" },
  { label: "Piros", value: "#dc2626" },
  { label: "Narancs", value: "#ea580c" },
  { label: "Zöld", value: "#059669" },
  { label: "Lila", value: "#7c3aed" },
  { label: "Fekete", value: "#111827" },
];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function parseDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

function getTimelineEndDate(startDate: Date, viewMode: ViewMode) {
  if (viewMode === "day") return new Date(startDate);
  if (viewMode === "week") return addDays(startDate, 6);
  if (viewMode === "month") return addDays(addMonths(startDate, 1), -1);
  if (viewMode === "year") return addDays(addMonths(startDate, 12), -1);
  return addDays(addMonths(startDate, 4), -1);
}

function getIsoWeekNumber(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getIsoWeekYear(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  return temp.getUTCFullYear();
}

function getViewLabel(viewMode: ViewMode) {
  const labels: Record<ViewMode, string> = {
    year: "Éves nézet",
    fourMonth: "4 havi nézet",
    month: "Havi nézet",
    week: "Heti nézet",
    day: "Napi nézet",
  };
  return labels[viewMode];
}

function getTaskActualStartDate(task: ScheduleTask) {
  return task.actualStartDate || task.startDate;
}

function getTaskActualEndDate(task: ScheduleTask) {
  return task.actualEndDate || task.endDate;
}

function getWeekOffsetFromDate(timelineStartDate: Date, date: string) {
  return Math.max(1, Math.floor(diffInDays(timelineStartDate, new Date(date)) / 7) + 1);
}

function getDurationWeeks(startDate: string, endDate: string) {
  return Math.max(1, Math.ceil((differenceInDays(startDate, endDate) + 1) / 7));
}

function actualStartDateForStatus(schedule: ScheduleLocation[], taskId: number) {
  for (const location of schedule) for (const building of location.buildings) for (const category of building.categories) for (const task of category.tasks) if (task.id === taskId) return task.actualStartDate || task.startDate;
  return "";
}

function actualEndDateForStatus(schedule: ScheduleLocation[], taskId: number) {
  for (const location of schedule) for (const building of location.buildings) for (const category of building.categories) for (const task of category.tasks) if (task.id === taskId) return task.actualEndDate || task.endDate;
  return "";
}

function getCategoryColor(schedule: ScheduleLocation[], categoryName: string) {
  for (const location of schedule) {
    for (const building of location.buildings) {
      for (const category of building.categories) {
        if (category.name === categoryName) return category.color;
      }
    }
  }
  return "bg-blue-600";
}

function NewScheduleModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, startDate: string, endDate: string, withSampleTask: boolean) => void;
}) {
  const [name, setName] = useState("Új munkaközi ütemterv");
  const [startDate, setStartDate] = useState("2026-05-01");
  const [endDate, setEndDate] = useState("2026-08-31");
  const [withSampleTask, setWithSampleTask] = useState(true);

  if (!isOpen || typeof document === "undefined") return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-6">
      <div className="w-full max-w-6xl rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Új ütemterv létrehozása</h2>
            <p className="text-sm text-slate-500">Gyakorló ütemterv, dátumtartomány és kezdő sáv beállítása.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ütemterv neve</label>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Kezdő dátum</label>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Záró dátum</label>
              <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={withSampleTask} onChange={(event) => setWithSampleTask(event.target.checked)} />
            Hozzon létre egy kezdő 1 sávos próbaütemtervet
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
          <button type="button" onClick={() => onCreate(name, startDate, endDate, withSampleTask)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Létrehozás</button>
        </div>
      </div>
    </div>
  );
}

function BoundaryModal({
  isOpen,
  onClose,
  boundaries,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  boundaries: ScheduleBoundary[];
  onSave: (boundaries: ScheduleBoundary[]) => void;
}) {
  const [items, setItems] = useState<ScheduleBoundary[]>(boundaries);

  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = window.setTimeout(() => {
      setItems(boundaries);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, boundaries]);

  if (!isOpen) return null;

  const addBoundary = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `boundary-${Date.now()}`,
        title: "Új szakaszhatár",
        date: toIsoDate(new Date()),
        color: "#dc2626",
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-slate-950/60 p-6">
      <div className="max-h-[calc(100vh-48px)] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Szakaszhatárolók</h2>
            <p className="text-sm text-slate-500">Projekt kezdés, szakaszhatárok és befejező vonalak beállítása.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_160px_160px_44px]">
              <input value={item.title} onChange={(event) => setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <input type="date" value={item.date} onChange={(event) => setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, date: event.target.value } : entry))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <select value={item.color} onChange={(event) => setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, color: event.target.value } : entry))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
                {boundaryColors.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
              </select>
              <button type="button" onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))} className="rounded-lg border border-red-200 text-red-600 hover:bg-red-50">×</button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={addBoundary} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">+ Új vonal</button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
            <button type="button" onClick={() => { onSave(items); onClose(); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Mentés</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function MilestoneModal({
  isOpen,
  mode,
  form,
  taskOptions,
  onClose,
  onChange,
  onSave,
  onDelete,
}: {
  isOpen: boolean;
  mode: "create" | "edit";
  form: ScheduleMilestoneForm;
  taskOptions: Array<{ id: number; name: string }>;
  onClose: () => void;
  onChange: (form: ScheduleMilestoneForm) => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const [editorHeightVh, setEditorHeightVh] = useState(48);
  const [isResizingEditor, setIsResizingEditor] = useState(false);

  useEffect(() => {
    if (!isResizingEditor) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextHeight = Math.round((event.clientY / window.innerHeight) * 100);
      setEditorHeightVh(Math.min(88, Math.max(28, nextHeight)));
    };

    const handlePointerUp = () => setIsResizingEditor(false);

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingEditor]);

  // A duplikált szerkesztőpanelek kézi DOM törlése eltávolítva.
  // React/Next által kezelt portal node kézi remove() hívása mentés utáni kliensoldali hibát okozhatott.

  if (!isOpen || typeof document === "undefined") return null;

  const portalRootId = "dimprover-single-milestone-editor-root";
  let portalRoot = document.getElementById(portalRootId);
  if (!portalRoot) {
    portalRoot = document.createElement("div");
    portalRoot.id = portalRootId;
    document.body.appendChild(portalRoot);
  }

  const update = <K extends keyof ScheduleMilestoneForm>(key: K, value: ScheduleMilestoneForm[K]) => {
    onChange({ ...form, [key]: value });
  };

  return createPortal(
    <div data-dimprover-milestone-editor-root="true" data-dimprover-current-editor="milestone" className="dimprover-milestone-editor-shell fixed inset-0 z-[10000] pointer-events-none overflow-hidden bg-slate-950/10">
      <div className="absolute left-[88px] right-[88px] top-0 pointer-events-auto">
        <div className="relative isolate grid max-h-[88vh] min-h-[28vh] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-b-xl border border-t-0 border-blue-500 bg-blue-200 shadow-[0_18px_55px_rgba(15,23,42,0.22)] ring-1 ring-blue-500/80" style={{ height: `${editorHeightVh}vh` }}>
          <div className="shrink-0 flex items-center justify-between border-b border-blue-500 bg-gradient-to-r from-blue-400 via-blue-300 to-blue-200 px-3 py-1.5">
            <div>
              <div className="flex items-start gap-2">
                <span className="inline-flex min-h-[32px] w-[132px] items-center justify-center rounded-md border border-blue-300 bg-white/80 px-2 py-0.5 text-center text-[12px] font-black uppercase leading-none tracking-[0.08em] text-blue-800">Szerkesztő mód</span>
                <div>
                  <h2 className="text-base font-semibold leading-tight text-slate-950">{mode === "create" ? "Új mérföldkő" : "Mérföldkő szerkesztése"}</h2>
                  <p className="text-xs font-medium text-white/90 drop-shadow-sm">Dátumhoz kötött projekt-esemény, Gantt marker, státusz és kapcsolódó feladat beállítása.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
            </div>
          </div>

          <div data-dimprover-milestone-editor-body="true" className="grid h-full min-h-0 overflow-y-auto overscroll-contain gap-3 bg-gradient-to-b from-blue-200 via-blue-100 to-blue-50 px-4 py-3 pb-5 text-xs lg:grid-cols-2 xl:grid-cols-[1.45fr_0.95fr_1.05fr_1.75fr] 2xl:grid-cols-[1.45fr_0.95fr_1.05fr_1.85fr]">
            <div className="grid content-start gap-2 md:grid-cols-2 xl:col-start-1 xl:row-start-1">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-700">Mérföldkő neve</label>
                <input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="pl. I. ütem részátadás" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
                <select value="" onChange={(event) => { if (event.target.value) update("name", event.target.value); event.currentTarget.value = ""; }} className="mt-2 w-full rounded-lg border border-blue-100 bg-white/85 px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-500">
                  <option value="">Mérföldkő név választása adatbázisból...</option>
                  <option value="Munkaterület átadás">Munkaterület átadás</option>
                  <option value="Alapozás kezdése">Alapozás kezdése</option>
                  <option value="Szerkezetkész állapot">Szerkezetkész állapot</option>
                  <option value="Rész határidő">Rész határidő</option>
                  <option value="Műszaki átadás-átvétel">Műszaki átadás-átvétel</option>
                  <option value="Pénzügyi zárás">Pénzügyi zárás</option>
                </select>
              </div>
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white/90 p-3">
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Kapcsolódó feladat</label>
                <select value={form.relatedTaskId ?? ""} onChange={(event) => update("relatedTaskId", event.target.value ? Number(event.target.value) : null)} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500">
                  <option value="">Nincs kapcsolódó feladat</option>
                  {taskOptions.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
                </select>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">A marker a kiválasztott feladat sorához igazítható.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Dátum</label>
                <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
                <div className="mt-1 rounded-md bg-white/70 px-2 py-1 text-[11px] font-semibold text-blue-800">Hét száma: {form.date ? getIsoWeekNumber(new Date(form.date)) : "-"}. hét</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Felelős</label>
                <input value={form.owner} onChange={(event) => update("owner", event.target.value)} placeholder="pl. Projektvezetés" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
                <select value="" onChange={(event) => { if (event.target.value) update("owner", event.target.value); event.currentTarget.value = ""; }} className="mt-2 w-full rounded-lg border border-blue-100 bg-white/85 px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-500">
                  <option value="">Felelős választása adatbázisból...</option>
                  <option value="Projektvezetés">Projektvezetés</option>
                  <option value="Műszaki ellenőr">Műszaki ellenőr</option>
                  <option value="Beruházó">Beruházó</option>
                  <option value="Generálkivitelező Kft.">Generálkivitelező Kft.</option>
                  <option value="Földgép 2000 Kft.">Földgép 2000 Kft.</option>
                  <option value="Beton-Projekt Kft.">Beton-Projekt Kft.</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-white p-3 xl:col-start-2 xl:row-start-1 xl:min-h-[280px]">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Típus</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(milestoneTypeLabels).map(([value, label]) => {
                  const Icon = milestoneTypeIcons[value as ScheduleMilestoneType];
                  return (
                    <button key={value} type="button" onClick={() => update("type", value as ScheduleMilestoneType)} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${form.type === value ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      <span className={`flex h-4 w-4 items-center justify-center rounded-sm ${form.type === value ? "text-slate-900" : "text-slate-500"}`}>
                        <Icon size={13} strokeWidth={1.9} />
                      </span>
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-slate-600">
                <div className="mb-2 font-bold text-slate-700">Megjelenítés az ütemtervben</div>
                <div className="grid gap-1.5 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                  {[
                    ["showType", "Típus ikon"],
                    ["showStatus", "Státusz jel"],
                    ["showPriority", "Fontosság jel"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600">
                      <input type="checkbox" checked={form[key as keyof ScheduleMilestoneForm] !== false} onChange={(event) => update(key as keyof ScheduleMilestoneForm, event.target.checked as never)} className="h-3.5 w-3.5 accent-blue-600" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 xl:col-start-3 xl:row-start-1 xl:self-start">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Státusz és fontosság</label>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Státusz</label>
                  <select value={form.status} onChange={(event) => update("status", event.target.value as ScheduleMilestoneStatus)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500">
                    {Object.entries(milestoneStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Fontosság</label>
                  <select value={form.priority} onChange={(event) => update("priority", event.target.value as ScheduleMilestonePriority)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500">
                    {Object.entries(milestonePriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white bg-white/85 px-3 py-2 text-xs text-slate-600">
                <div className="mb-2 font-bold text-slate-700">Státusz jelek</div>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {Object.entries(milestoneStatusLabels).map(([value, label]) => {
                    const StatusIcon = milestoneStatusIcons[value as ScheduleMilestoneStatus];
                    return (
                      <button key={value} type="button" onClick={() => update("status", value as ScheduleMilestoneStatus)} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${form.status === value ? "border-blue-400 bg-blue-50 text-blue-800 ring-2 ring-blue-100" : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"}`}>
                        <StatusIcon size={13} strokeWidth={2.1} />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white bg-white/85 px-3 py-2 text-xs text-slate-600">
                <div className="mb-2 font-bold text-slate-700">Gantt jelmagyarázat</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["normal", "Normál", "Alap mérföldkő"],
                    ["important", "Fontos", "Kiemelt projektpont"],
                    ["critical", "Kritikus", "Csúszás / határidő kockázat"],
                  ] as Array<[ScheduleMilestonePriority, string, string]>).map(([priority, label, help]) => (
                    <button key={priority} type="button" onClick={() => update("priority", priority)} className={`rounded-lg border bg-white px-2 py-2 text-left transition hover:bg-blue-50/60 ${form.priority === priority ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100"}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                          <span className={`absolute left-1/2 top-0 h-7 w-0 -translate-x-1/2 border-l-2 border-dotted ${milestonePriorityLineClasses[priority]}`} />
                          <span className={`relative h-3.5 w-3.5 rotate-45 rounded-sm border ${milestonePriorityClasses[priority]}`} />
                        </span>
                        <span className="font-black text-slate-800">{label}</span>
                      </div>
                      <div className="text-[11px] leading-snug text-slate-500">{help}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] leading-snug text-slate-500">A rombusz és a pontozott dátumvonal ugyanazt a fontossági színt használja.</div>
              </div>
            </div>

            <div className="min-h-[150px] rounded-lg border border-slate-200 bg-white p-3 xl:col-start-4 xl:row-start-1 xl:self-start">
              <label className="mb-1 block text-xs font-medium text-slate-700">Megjegyzés</label>
              <textarea value={form.note} onChange={(event) => update("note", event.target.value)} rows={10} placeholder="Rövid megjegyzés, átadási feltétel vagy döntési pont..." className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
            </div>
          </div>

          <div className="relative z-20 flex min-h-[52px] items-center justify-between border-t border-blue-500 bg-gradient-to-r from-blue-400 via-blue-300 to-blue-200 px-4 py-2 shadow-[0_-10px_24px_rgba(15,23,42,0.12)]">
            <div>{mode === "edit" && onDelete && <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete(); }} className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 size={13} /> Mérföldkő törlése</button>}</div>
            <div className="flex gap-3">
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSave(); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">{mode === "edit" ? "Módosítás mentése" : "Mérföldkő létrehozása"}</button>
            </div>
          </div>

          <button
            type="button"
            aria-label="Mérföldkő szerkesztő magasságának állítása"
            onPointerDown={(event) => { event.preventDefault(); setIsResizingEditor(true); }}
            className={`absolute bottom-[-7px] left-1/2 z-30 h-3 w-24 -translate-x-1/2 cursor-ns-resize rounded-full border border-blue-500 bg-blue-600 shadow-[0_4px_14px_rgba(37,99,235,0.35)] transition hover:w-32 hover:bg-blue-700 ${isResizingEditor ? "w-36 bg-blue-800" : ""}`}
          >
            <span className="mx-auto mt-[3px] block h-1 w-12 rounded-full bg-white/85" />
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  );
}

function HolidayModal({
  isOpen,
  onClose,
  holidays,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  holidays: ManualHoliday[];
  onSave: (holidays: ManualHoliday[]) => void;
}) {
  const [items, setItems] = useState<ManualHoliday[]>(holidays);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => setItems(holidays), 0);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen, holidays]);

  if (!isOpen) return null;

  const addHoliday = () => {
    setItems((prev) => [
      ...prev,
      { id: `holiday-${Date.now()}`, title: "Mozgó ünnepnap", date: toIsoDate(new Date()) },
    ]);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end overflow-hidden bg-slate-950/35">
      <div className="h-full w-full max-w-[580px] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Mozgó ünnepnapok</h2>
            <p className="text-sm text-slate-500">Manuálisan felvett ünnepnapok halvány piros háttérrel jelennek meg az ütemterv rácsában.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_150px_42px]">
              <input value={item.title} onChange={(event) => setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <input type="date" value={item.date} onChange={(event) => setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, date: event.target.value } : entry))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              <button type="button" onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))} className="rounded-lg border border-red-200 text-red-600 hover:bg-red-50">×</button>
            </div>
          ))}
          {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Még nincs manuális ünnepnap felvéve.</div>}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={addHoliday} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">+ Új ünnepnap</button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
            <button type="button" onClick={() => { onSave(items); onClose(); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Mentés</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintSettingsModal({
  isOpen,
  onClose,
  onPrint,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (paperSize: "A4" | "A3", template: string) => void;
}) {
  const [paperSize, setPaperSize] = useState<"A4" | "A3">("A3");
  const [template, setTemplate] = useState("Részletes sávos ütemterv");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-6">
      <div className="w-full max-w-6xl rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nyomtatási kép / PDF export</h2>
            <p className="text-sm text-slate-500">A munkaközi mentés külön történik, ez csak kiadási/export nézet.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lapméret</label>
            <select value={paperSize} onChange={(event) => setPaperSize(event.target.value as "A4" | "A3")} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500">
              <option value="A3">A3 fekvő</option>
              <option value="A4">A4 fekvő</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Sablon</label>
            <select value={template} onChange={(event) => setTemplate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500">
              <option>Munkaközi ütemterv</option>
              <option>Tervezett ütemterv jóváhagyásra</option>
              <option>Részletes sávos ütemterv</option>
            </select>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Fejléc/lábléc sablon:</p>
          <p className="mt-1">Fejléc: projekt neve, dokumentumtípus, dátumtartomány, verzió és készítés dátuma.</p>
          <p>Lábléc: DIMPROVER, oldalszám, státusz és készítő megjegyzés.</p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
          <button type="button" onClick={() => onPrint(paperSize, template)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Nyomtatási kép</button>
        </div>
      </div>
    </div>
  );
}

function SchedulePdfPreviewModal({
  isOpen,
  html,
  paperSize,
  orientation,
  onPaperSizeChange,
  onOrientationChange,
  onClose,
}: {
  isOpen: boolean;
  html: string;
  paperSize: PdfPaperSize;
  orientation: PdfOrientation;
  onPaperSizeChange: (value: PdfPaperSize) => void;
  onOrientationChange: (value: PdfOrientation) => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  if (!isOpen) return null;

  const printFrame = () => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    frameWindow.print();
  };

  return (
    <div className="fixed inset-0 z-[12000] bg-slate-950/70 p-4">
      <div className="mx-auto flex h-full max-w-[1480px] flex-col overflow-hidden rounded-none border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ütemterv PDF előnézet</h2>
            <p className="text-xs text-slate-500">Lapméret és tájolás választása után indítható a PDF / nyomtatás.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={paperSize}
              onChange={(event) => onPaperSizeChange(event.target.value as PdfPaperSize)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50"
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="A2">A2</option>
              <option value="A1">A1</option>
            </select>
            <select
              value={orientation}
              onChange={(event) => onOrientationChange(event.target.value as PdfOrientation)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50"
            >
              <option value="landscape">Fekvő</option>
              <option value="portrait">Álló</option>
            </select>
            <button type="button" onClick={printFrame} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
              <Printer size={14} /> PDF / nyomtatás
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Bezárás</button>
          </div>
        </div>
        <iframe ref={iframeRef} title="Ütemterv PDF előnézet" srcDoc={html} className="h-full w-full bg-slate-100" />
      </div>
    </div>
  );
}

export default function UtemezesPage() {
  const [scheduleName, setScheduleName] = useState("Ütemterv (Gantt diagram)");
  const [schedule, setSchedule] = useState<ScheduleLocation[]>(initialSchedule);
  const [features, setFeatures] = useState<ScheduleFeatureState>(initialFeatures);
  const [selectedSource, setSelectedSource] = useState<ScheduleSource>("sample");
  const [viewMode, setViewMode] = useState<ViewMode>("fourMonth");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNewScheduleOpen, setIsNewScheduleOpen] = useState(false);
  const [isBoundaryModalOpen, setIsBoundaryModalOpen] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState("");
  const [pdfPaperSize, setPdfPaperSize] = useState<PdfPaperSize>("A3");
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>("landscape");
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isScheduleHelpOpen, setIsScheduleHelpOpen] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState<ScheduleMilestoneForm>(() => createDefaultMilestone("2026-05-15"));
  const scheduleScrollRef = useRef<HTMLDivElement | null>(null);
  const schedulePanTimerRef = useRef<number | null>(null);
  const schedulePanStateRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number; active: boolean } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1400);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [scheduleViewportHeight, setScheduleViewportHeight] = useState(() => {
    if (typeof window === "undefined") return 620;
    const savedHeight = Number(window.localStorage.getItem(DIMPRO_GANTT_VIEWPORT_HEIGHT_KEY));
    return Number.isFinite(savedHeight) && savedHeight >= 420 && savedHeight <= 980 ? savedHeight : 620;
  });
  const [timelineStartDate, setTimelineStartDate] = useState(new Date(2026, 4, 1));
  const [customTimelineEndDate, setCustomTimelineEndDate] = useState<Date | null>(null);
  const [statusMessage, setStatusMessage] = useState(SCHEDULE_BUILD_MARKER);
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [manualHolidays, setManualHolidays] = useState<ManualHoliday[]>([]);
  const [boundaries, setBoundaries] = useState<ScheduleBoundary[]>([
    { id: "start", title: "Projekt kezdés", date: "2026-05-05", color: "#2563eb" },
    { id: "phase-1", title: "I. szakasz", date: "2026-07-01", color: "#ea580c" },
    { id: "finish", title: "Projekt befejezés", date: "2026-10-19", color: "#dc2626" },
  ]);
  const [milestones, setMilestones] = useState<ScheduleMilestone[]>([
    { id: "milestone-start", name: "Projektindító mérföldkő", date: "2026-05-15", type: "preparation", relatedTaskId: null, owner: "Projektvezetés", status: "planned", priority: "important", note: "Kezdő mérföldkő mintaadatként.", showType: true, showStatus: true, showPriority: true },
  ]);
  const [scheduleRevision, setScheduleRevision] = useState(0);

  const timelineEndDate = useMemo(
    () => customTimelineEndDate ?? getTimelineEndDate(timelineStartDate, viewMode),
    [customTimelineEndDate, timelineStartDate, viewMode]
  );

  const timelineStartIso = toIsoDate(timelineStartDate);
  const timelineEndIso = toIsoDate(timelineEndDate);
  const totalDays = Math.max(1, differenceInDays(timelineStartIso, timelineEndIso) + 1);
  const visibleTimelineWidth = Math.max(720, viewportWidth - LEFT_COL_WIDTH - TYPE_COL_WIDTH - 24);
  const dayWidth = Math.max(3, (visibleTimelineWidth / totalDays) * zoomLevel);
  const weekWidth = dayWidth * 7;
  const timelineWidth = Math.max(totalDays * dayWidth, visibleTimelineWidth);
  const minTableWidth = LEFT_COL_WIDTH + TYPE_COL_WIDTH + timelineWidth;

  const normalizedSchedule = useMemo(() => normalizeSchedule(schedule), [schedule]);
  const allTasks = useMemo(() => selectAllTasks(normalizedSchedule), [normalizedSchedule]);

  const visibleDateRange = useMemo(
    () => getVisibleDateRange(timelineStartDate, { scrollLeft, viewportWidth, dayWidth, overscanDays: 14 }),
    [scrollLeft, viewportWidth, timelineStartDate, dayWidth]
  );

  const visibleRows = useMemo(() => buildVisibleRows(schedule, collapsedRows), [schedule, collapsedRows]);
  const visibleRowLayouts = useMemo(() => calculateVisibleRowLayout(visibleRows), [visibleRows]);
  const visibleViewportRows = useMemo(
    () => getVisibleRowRange(visibleRowLayouts, scrollTop, viewportHeight, 300),
    [visibleRowLayouts, scrollTop, viewportHeight]
  );
  const dependencyTaskRows = useMemo(() => selectTaskRows(visibleRowLayouts), [visibleRowLayouts]);
  const taskRowByTaskId = useMemo(() => {
    const map = new Map<number, (typeof dependencyTaskRows)[number]>();
    dependencyTaskRows.forEach((row) => map.set(row.task.id, row));
    return map;
  }, [dependencyTaskRows]);
  const milestoneCollisionSlots = useMemo(() => {
    const slotMap = new Map<string, { slot: number; count: number }>();
    const groups = new Map<string, ScheduleMilestone[]>();

    milestones.forEach((milestone) => {
      const relatedTaskRow = milestone.relatedTaskId ? taskRowByTaskId.get(milestone.relatedTaskId) : undefined;
      const rowKey = relatedTaskRow ? `task-${milestone.relatedTaskId}` : "floating";
      const groupKey = `${milestone.date}::${rowKey}`;
      const group = groups.get(groupKey) ?? [];
      group.push(milestone);
      groups.set(groupKey, group);
    });

    groups.forEach((group) => {
      group
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((milestone, slot) => {
          slotMap.set(milestone.id, { slot, count: group.length });
        });
    });

    return slotMap;
  }, [milestones, taskRowByTaskId]);
  const totalVirtualHeight = useMemo(() => visibleRowLayouts.at(-1)?.bottom ?? 0, [visibleRowLayouts]);
  useEffect(() => {
    const updateScheduleViewportMetrics = () => {
      const element = scheduleScrollRef.current;
      if (!element) {
        setViewportHeight(scheduleViewportHeight);
        return;
      }
      setViewportWidth(element.clientWidth);
      setViewportHeight(element.clientHeight || scheduleViewportHeight);
    };

    updateScheduleViewportMetrics();
    const timeoutId = window.setTimeout(updateScheduleViewportMetrics, 0);
    window.addEventListener("resize", updateScheduleViewportMetrics);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updateScheduleViewportMetrics);
    };
  }, [scheduleViewportHeight, viewMode, zoomLevel, scheduleRevision, isPdfPreviewOpen]);

  const todayIso = toIsoDate(new Date());
  const todayVisible = todayIso >= timelineStartIso && todayIso <= timelineEndIso;
  const todayLeftPx = getXFromDate(todayIso, timelineStartIso) * (dayWidth / 28);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as PersistedSchedule;
        setScheduleName(saved.scheduleName || "DIMPROVER gyakorló ütemterv");
        setSchedule(saved.schedule || initialSchedule);
        setBoundaries(saved.boundaries || []);
        setVersions(saved.versions || []);
        setManualHolidays(saved.manualHolidays || []);
        setMilestones(saved.milestones || []);
        if (saved.timelineStartDate) setTimelineStartDate(parseDateInput(saved.timelineStartDate));
        if (saved.timelineEndDate) setCustomTimelineEndDate(parseDateInput(saved.timelineEndDate));
        setStatusMessage("Korábbi munkaközi mentés betöltve");
      } catch {
        setStatusMessage("A korábbi mentés nem volt betölthető, mintaadat indult");
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const payload: PersistedSchedule = {
        scheduleName,
        schedule,
        boundaries,
        versions,
        timelineStartDate: timelineStartIso,
        timelineEndDate: timelineEndIso,
        manualHolidays,
        milestones,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [scheduleName, schedule, boundaries, versions, timelineStartIso, timelineEndIso, manualHolidays, milestones]);


  useEffect(() => {
    const element = scheduleScrollRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.altKey) return;
      event.preventDefault();
      setZoomLevel((prev) => {
        const next = Math.min(10, Math.max(0.25, Number((prev + (event.deltaY < 0 ? 0.5 : -0.5)).toFixed(2))));
        setStatusMessage(`Nagyítás: ${Math.round(next * 100)}%`);
        return next;
      });
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);



  const saveWorkingSchedule = (template = "Munkaközi ütemterv") => {
    const nextVersion: SavedVersion = {
      id: `version-${Date.now()}`,
      name: `${template} v${versions.length + 1}`,
      savedAt: new Date().toISOString(),
      template,
    };
    const nextVersions = [nextVersion, ...versions].slice(0, 20);
    const payload: PersistedSchedule = {
      scheduleName,
      schedule,
      boundaries,
      versions: nextVersions,
      timelineStartDate: timelineStartIso,
      timelineEndDate: timelineEndIso,
      manualHolidays,
      milestones,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setVersions(nextVersions);
    setStatusMessage(`Mentve: ${nextVersion.name}`);
  };

  const toggleFeature = (featureKey: keyof ScheduleFeatureState) => setFeatures((prev) => ({ ...prev, [featureKey]: !prev[featureKey] }));
  const toggleRow = (id: string) => setCollapsedRows((prev) => {
    const next = new Set(prev);
    const willOpen = next.has(id);
    if (willOpen) next.delete(id);
    else next.add(id);
    setStatusMessage(willOpen ? "Csoport kinyitva" : "Csoport összecsukva");
    return next;
  });

  const handleCreateTask = (task: ScheduleTaskInput) => {
    const actualStart = task.startDate || timelineStartIso;
    const actualEnd = task.endDate || formatLocalDate(addDays(toDate(actualStart), task.duration * 7 - 1));
    const contractStart = task.contractStartDate || actualStart;
    const contractEnd = task.contractEndDate || actualEnd;

    const editedTaskId = selectedTask?.id ?? selectedTaskId;

    if (editedTaskId !== null) {
      setSchedule((prev) => {
        const updated = updateTaskInSchedule(prev, editedTaskId, (item) => ({
          ...item,
          ...task,
          actualStartDate: actualStart,
          actualEndDate: actualEnd,
          startDate: actualStart,
          endDate: actualEnd,
          contractStartDate: contractStart,
          contractEndDate: contractEnd,
          actualStartWeek: getWeekOffsetFromDate(timelineStartDate, actualStart),
          startWeek: getWeekOffsetFromDate(timelineStartDate, actualStart),
          actualDuration: getDurationWeeks(actualStart, actualEnd),
          duration: getDurationWeeks(actualStart, actualEnd),
          contractStartWeek: getWeekOffsetFromDate(timelineStartDate, contractStart),
          contractDuration: getDurationWeeks(contractStart, contractEnd),
          predecessors: task.predecessors || [],
        }));
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          scheduleName,
          schedule: updated,
          boundaries,
          versions,
          timelineStartDate: timelineStartIso,
          timelineEndDate: timelineEndIso,
          manualHolidays,
          milestones,
        }));
        setScheduleRevision((rev) => rev + 1);
        return updated;
      });
    } else {
      const nextTask: ScheduleTask = {
        id: Date.now(),
        order: allTasks.length + 1,
        name: task.name,
        contractor: task.contractor || "Vállalkozó neve",
        category: task.category,
        color: task.color,
        taskType: task.taskType,
        workType: task.workType,
        progress: task.progress ?? 0,
        startWeek: getWeekOffsetFromDate(timelineStartDate, actualStart),
        duration: getDurationWeeks(actualStart, actualEnd),
        contractStartWeek: getWeekOffsetFromDate(timelineStartDate, contractStart),
        contractDuration: getDurationWeeks(contractStart, contractEnd),
        actualStartWeek: getWeekOffsetFromDate(timelineStartDate, actualStart),
        actualDuration: getDurationWeeks(actualStart, actualEnd),
        startDate: actualStart,
        endDate: actualEnd,
        contractStartDate: contractStart,
        contractEndDate: contractEnd,
        actualStartDate: actualStart,
        actualEndDate: actualEnd,
        predecessors: task.predecessors || [],
      };
      setSchedule((prev) => {
        const updated = addTaskToCategory(prev, nextTask, task.category);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          scheduleName,
          schedule: updated,
          boundaries,
          versions,
          timelineStartDate: timelineStartIso,
          timelineEndDate: timelineEndIso,
          manualHolidays,
          milestones,
        }));
        setScheduleRevision((rev) => rev + 1);
        return updated;
      });
    }
    setSelectedTask(null);
    setSelectedTaskId(null);
    setIsCreateModalOpen(false);
    setStatusMessage("Feladat mentve az ütemtervben");
  };

  const handleSelectTask = (task: ScheduleTask) => {
    setSelectedTask(task);
    setSelectedTaskId(task.id);
    setIsCreateModalOpen(true);
  };

  const closeTaskEditor = () => {
    setIsCreateModalOpen(false);
    setSelectedTask(null);
    setSelectedTaskId(null);
  };


  const openCreateMilestone = () => {
    setSelectedMilestoneId(null);
    setMilestoneForm(createDefaultMilestone(timelineStartIso));
    setIsMilestoneModalOpen(true);
    setStatusMessage("Új mérföldkő létrehozása");
  };

  const openEditMilestone = (milestone: ScheduleMilestone) => {
    if (isMilestoneModalOpen && selectedMilestoneId === milestone.id) {
      closeMilestoneModal();
      setStatusMessage("Mérföldkő szerkesztő bezárva");
      return;
    }

    setSelectedMilestoneId(milestone.id);
    const { id: _id, ...form } = milestone;
    void _id;
    setMilestoneForm({
      ...form,
      showType: form.showType ?? true,
      showStatus: form.showStatus ?? true,
      showPriority: form.showPriority ?? true,
    });
    setIsMilestoneModalOpen(true);
    setStatusMessage(`Mérföldkő szerkesztése: ${milestone.name}`);
  };

  const closeMilestoneModal = () => {
    setIsMilestoneModalOpen(false);
    setSelectedMilestoneId(null);
  };

  const saveMilestone = () => {
    if (!milestoneForm.name.trim() || !milestoneForm.date) {
      setStatusMessage("A mérföldkő neve és dátuma kötelező");
      return;
    }

    const normalizedMilestoneForm = {
      ...milestoneForm,
      name: milestoneForm.name.trim(),
      showType: milestoneForm.showType ?? true,
      showStatus: milestoneForm.showStatus ?? true,
      showPriority: milestoneForm.showPriority ?? true,
    };

    setMilestones((current) => {
      const nextMilestones = selectedMilestoneId
        ? current.map((item) => item.id === selectedMilestoneId ? { ...item, ...normalizedMilestoneForm } : item)
        : [{ id: `milestone-${Date.now()}`, ...normalizedMilestoneForm }, ...current];

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          scheduleName,
          schedule,
          boundaries,
          versions,
          timelineStartDate: timelineStartIso,
          timelineEndDate: timelineEndIso,
          manualHolidays,
          milestones: nextMilestones,
        }));
      } catch {
        // A localStorage hiba ne vigye el az oldalt Next hibaoldalra.
      }

      return nextMilestones;
    });

    setStatusMessage(selectedMilestoneId ? "Mérföldkő frissítve" : "Mérföldkő létrehozva");
    window.setTimeout(() => {
      setIsMilestoneModalOpen(false);
      setSelectedMilestoneId(null);
    }, 0);
  };

  const deleteMilestone = () => {
    if (!selectedMilestoneId) return;
    setMilestones((current) => current.filter((item) => item.id !== selectedMilestoneId));
    closeMilestoneModal();
    setStatusMessage("Mérföldkő törölve");
  };

  const handleGanttEmptyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-gantt-task-bar='true']")) return;
    if (!target.closest("[data-gantt-empty-area='true']")) return;
    closeTaskEditor();
  };

  const handleDeleteTask = () => {
    if (selectedTaskId === null) return;
    setSchedule((prev) => {
      const updated = deleteTaskFromSchedule(prev, selectedTaskId);
      setScheduleRevision((rev) => rev + 1);
      return updated;
    });
    setIsCreateModalOpen(false);
    setSelectedTask(null);
    setSelectedTaskId(null);
    setStatusMessage("Feladat törölve");
  };


  const applyTaskBarChange = (
    taskId: number,
    mode: ScheduleBarInteractionMode,
    originalStartDate: string,
    originalEndDate: string,
    deltaDays: number
  ) => {
    setSchedule((prev) => {
      const updated = updateTaskInSchedule(prev, taskId, (task) => {
        const originalStart = toDate(originalStartDate);
        const originalEnd = toDate(originalEndDate);
        let nextStartDate = originalStart;
        let nextEndDate = originalEnd;

        if (mode === "move") {
          nextStartDate = addDays(originalStart, deltaDays);
          nextEndDate = addDays(originalEnd, deltaDays);
        } else if (mode === "resize-start") {
          const limitedStart = addDays(originalStart, deltaDays);
          nextStartDate = limitedStart >= originalEnd ? addDays(originalEnd, -1) : limitedStart;
        } else {
          const limitedEnd = addDays(originalEnd, deltaDays);
          nextEndDate = limitedEnd <= originalStart ? addDays(originalStart, 1) : limitedEnd;
        }

        const actualStartDate = formatLocalDate(nextStartDate);
        const actualEndDate = formatLocalDate(nextEndDate);
        const calculatedWeeks = getDurationWeeks(actualStartDate, actualEndDate);
        return {
          ...task,
          duration: calculatedWeeks,
          actualDuration: calculatedWeeks,
          actualStartDate,
          actualEndDate,
          startDate: actualStartDate,
          endDate: actualEndDate,
          contractStartDate: task.contractStartDate || actualStartDate,
          contractEndDate: task.contractEndDate || actualEndDate,
          actualStartWeek: getWeekOffsetFromDate(timelineStartDate, actualStartDate),
          startWeek: getWeekOffsetFromDate(timelineStartDate, actualStartDate),
        };
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scheduleName,
        schedule: updated,
        boundaries,
        versions,
        timelineStartDate: timelineStartIso,
        timelineEndDate: timelineEndIso,
        manualHolidays,
      }));
      setScheduleRevision((rev) => rev + 1);
      setStatusMessage(`${mode === "move" ? "Feladat mozgatva" : "Feladat dátuma módosítva"}: ${actualStartDateForStatus(updated, taskId)} – ${actualEndDateForStatus(updated, taskId)}`);
      return updated;
    });
  };

  const handleTaskBarInteractionStart = (mode: ScheduleBarInteractionMode) => {
    setStatusMessage(mode === "move" ? "Feladatsáv mozgatása aktív" : "Feladatsáv átméretezése aktív");
  };

  const handleTaskBarInteractionEnd = () => {
    // A pontos módosított dátumot az applyTaskBarChange állítja be.
  };


  const handleScheduleHeightSliderChange = (nextHeight: number) => {
    const next = Math.min(980, Math.max(420, Math.round(nextHeight)));
    setScheduleViewportHeight(next);
    window.localStorage.setItem(DIMPRO_GANTT_VIEWPORT_HEIGHT_KEY, String(next));
    setStatusMessage(`Ütemterv táblázat magassága: ${next}px`);
  };

  const cancelSchedulePan = () => {
    const wasActive = schedulePanStateRef.current?.active === true;
    if (schedulePanTimerRef.current !== null) {
      window.clearTimeout(schedulePanTimerRef.current);
      schedulePanTimerRef.current = null;
    }
    schedulePanStateRef.current = null;
    delete document.body.dataset.ganttPanning;
    if (wasActive) {
      document.body.dataset.ganttJustPanned = "true";
      window.setTimeout(() => { delete document.body.dataset.ganttJustPanned; }, 260);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const handleSchedulePanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a,[data-gantt-drag-handle],[data-gantt-resize-handle]")) return;

    const element = scheduleScrollRef.current;
    if (!element) return;

    schedulePanStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
      active: false,
    };

    if (schedulePanTimerRef.current !== null) window.clearTimeout(schedulePanTimerRef.current);
    schedulePanTimerRef.current = window.setTimeout(() => {
      const state = schedulePanStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      state.active = true;
      document.body.dataset.ganttPanning = "true";
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      try { element.setPointerCapture(event.pointerId); } catch {}
    }, 260);
  };

  const handleSchedulePanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = schedulePanStateRef.current;
    const element = scheduleScrollRef.current;
    if (!state || !element || state.pointerId !== event.pointerId) return;

    const movedEnough = Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) > 5;
    if (movedEnough && schedulePanTimerRef.current !== null && !state.active) {
      window.clearTimeout(schedulePanTimerRef.current);
      schedulePanTimerRef.current = null;
      schedulePanStateRef.current = null;
      return;
    }
    if (!state.active) return;

    event.preventDefault();
    element.scrollLeft = state.scrollLeft - (event.clientX - state.startX);
    element.scrollTop = state.scrollTop - (event.clientY - state.startY);
  };

  const handleSchedulePanPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = schedulePanStateRef.current;
    if (state?.pointerId === event.pointerId) cancelSchedulePan();
  };

  // Billentyűzetes ütemterv-magasság állítás letiltva: csak a csúszka használható.


  const changeZoom = (direction: "in" | "out") => {
    setZoomLevel((prev) => {
      const next = Math.min(10, Math.max(0.25, Number((direction === "in" ? prev + 0.5 : prev - 0.5).toFixed(2))));
      setStatusMessage(`Nagyítás: ${Math.round(next * 100)}%`);
      return next;
    });
  };
  const handleViewChange = (nextViewMode: ViewMode) => {
    setViewMode(nextViewMode);
    setCustomTimelineEndDate(null);
    setZoomLevel(1);
    setScrollLeft(0);
    setStatusMessage(`${getViewLabel(nextViewMode)} aktív`);
  };

  const buildSchedulePdfHtml = (paperSize: PdfPaperSize = "A3", orientation: PdfOrientation = "landscape", template = "Ütemterv (Gantt diagram)") => {
    const escapeHtml = (value: string | number | undefined | null) =>
      String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));

    const tasks = selectAllTasks(normalizedSchedule);
    const rangeDays = Math.max(1, differenceInDays(timelineStartIso, timelineEndIso) + 1);
    const pageBase = PDF_PAGE_MM[paperSize];
    const pageWidthMm = orientation === "landscape" ? pageBase.width : pageBase.height;
    const pageHeightMm = orientation === "landscape" ? pageBase.height : pageBase.width;
    const printableWidth = orientation === "landscape" ? pageBase.chart : Math.round(pageBase.chart * (pageHeightMm / pageWidthMm));
    const chartWidth = printableWidth - 390;
    const dayPx = chartWidth / rangeDays;
    const monthLabels: string[] = [];
    let monthCursor = new Date(timelineStartDate);
    monthCursor.setDate(1);
    while (monthCursor <= timelineEndDate) {
      const monthStart = new Date(Math.max(monthCursor.getTime(), timelineStartDate.getTime()));
      const nextMonth = addMonths(monthCursor, 1);
      const monthEnd = new Date(Math.min(addDays(nextMonth, -1).getTime(), timelineEndDate.getTime()));
      const left = Math.max(0, differenceInDays(timelineStartIso, formatLocalDate(monthStart)) * dayPx);
      const width = Math.max(24, (differenceInDays(formatLocalDate(monthStart), formatLocalDate(monthEnd)) + 1) * dayPx);
      monthLabels.push(`<div class="month" style="left:${left}px;width:${width}px">${escapeHtml(monthStart.toLocaleDateString("hu-HU", { year: "numeric", month: "long" }))}</div>`);
      monthCursor = nextMonth;
    }

    const weekLabels: string[] = [];
    let currentWeekKey = "";
    let weekStartIndex = 0;
    for (let index = 0; index < rangeDays; index += 1) {
      const current = addDays(timelineStartDate, index);
      const key = `${getIsoWeekYear(current)}-${getIsoWeekNumber(current)}`;
      if (!currentWeekKey) {
        currentWeekKey = key;
        weekStartIndex = index;
      }
      const isLast = index === rangeDays - 1;
      const next = !isLast ? addDays(timelineStartDate, index + 1) : null;
      const nextKey = next ? `${getIsoWeekYear(next)}-${getIsoWeekNumber(next)}` : "";
      if (isLast || nextKey !== currentWeekKey) {
        const weekNo = getIsoWeekNumber(addDays(timelineStartDate, weekStartIndex));
        const left = weekStartIndex * dayPx;
        const width = (index - weekStartIndex + 1) * dayPx;
        const label = `${weekNo}.`;
        weekLabels.push(`<div class="week" style="left:${left}px;width:${width}px">${label}</div>`);
        currentWeekKey = nextKey;
        weekStartIndex = index + 1;
      }
    }

    const weekendBands = Array.from({ length: rangeDays }, (_, index) => {
      const current = addDays(timelineStartDate, index);
      const day = current.getDay();
      if (day !== 0 && day !== 6) return "";
      return `<div class="weekend" style="left:${index * dayPx}px;width:${dayPx}px"></div>`;
    }).join("");

    const holidayBands = manualHolidays
      .filter((holiday) => holiday.date >= timelineStartIso && holiday.date <= timelineEndIso)
      .map((holiday) => {
        const left = Math.max(0, differenceInDays(timelineStartIso, holiday.date) * dayPx);
        return `<div class="holiday" style="left:${left}px;width:${dayPx}px"></div>`;
      })
      .join("");

    const pdfMarkers = [
      ...(features.showTodayLine && todayVisible ? [{ id: "today", title: "MA", date: todayIso, color: "#2563eb" }] : []),
      ...boundaries.filter((b) => b.date >= timelineStartIso && b.date <= timelineEndIso).map((b) => ({ id: b.id, title: b.title, date: b.date, color: b.color })),
    ];

    const markerLabels = pdfMarkers.map((marker, index) => {
      const left = Math.max(0, Math.min(chartWidth, differenceInDays(timelineStartIso, marker.date) * dayPx));
      const lane = index % 2;
      return `<div class="marker-label" style="left:${left}px;top:${4 + lane * 22}px;background:${marker.color}">${escapeHtml(marker.title)}</div>`;
    }).join("");

    const markerLines = pdfMarkers.map((marker) => {
      const left = Math.max(0, Math.min(chartWidth, differenceInDays(timelineStartIso, marker.date) * dayPx));
      return `<div class="marker-line" style="left:${left}px;border-color:${marker.color}"></div>`;
    }).join("");

    const dayLabels = Array.from({ length: rangeDays }, (_, index) => {
      const current = addDays(timelineStartDate, index);
      return `<div class="day" style="left:${index * dayPx}px;width:${dayPx}px"><b>${current.getDate()}</b><small>${current.toLocaleDateString("hu-HU", { weekday: "short" }).replace(".", "")}</small></div>`;
    }).join("");

    const chartBackground = `${weekendBands}${holidayBands}${markerLines}`;

    const pdfRows = visibleRowLayouts.map((row) => {
      if (row.rowType === "location") {
        return `<tr class="row-location"><td class="name level-0"><strong>⌄ ${escapeHtml(row.location.name)}</strong></td><td>Helyszín</td><td></td><td class="chart-cell"><div class="chart bg-only">${chartBackground}</div></td></tr>`;
      }
      if (row.rowType === "building") {
        return `<tr class="row-building"><td class="name level-1"><strong>⌄ ${escapeHtml(row.building.name)}</strong></td><td>Épület</td><td></td><td class="chart-cell"><div class="chart bg-only">${chartBackground}</div></td></tr>`;
      }
      if (row.rowType === "category") {
        return `<tr class="row-category"><td class="name level-2"><strong>⌄ ${escapeHtml(row.category.name)}</strong></td><td>Munkanem</td><td></td><td class="chart-cell"><div class="chart bg-only">${chartBackground}</div></td></tr>`;
      }

      const task = row.task;
      const start = getTaskActualStartDate(task);
      const end = getTaskActualEndDate(task);
      const left = Math.max(0, differenceInDays(timelineStartIso, start) * dayPx);
      const width = Math.max(12, (differenceInDays(start, end) + 1) * dayPx);
      const progress = Math.max(0, Math.min(100, task.progress ?? 0));
      const color = task.color?.replace("bg-", "") || "blue-600";
      const barColor = color.includes("orange") ? "#ea580c" : color.includes("green") ? "#059669" : color.includes("purple") ? "#9333ea" : color.includes("red") ? "#dc2626" : "#2563eb";
      return `
        <tr class="row-task">
          <td class="name level-3"><strong>${escapeHtml(task.name)}</strong><small>${escapeHtml(task.contractor)}</small></td>
          <td>${escapeHtml(task.taskType || "Feladat")}</td>
          <td>${escapeHtml(start)} – ${escapeHtml(end)}</td>
          <td class="chart-cell"><div class="chart">${chartBackground}<div class="contract-bar" style="left:${left}px;width:${width}px"></div><div class="bar" style="left:${left}px;width:${width}px;background:${barColor}"><i style="width:${progress}%"></i><span>${escapeHtml(task.name)}</span><b>${progress}%</b></div></div></td>
        </tr>`;
    }).join("");

    return `<!doctype html><html lang="hu"><head><meta charset="utf-8" /><title>${escapeHtml(scheduleName)} - PDF előnézet</title><style>
      @page{size:${paperSize} ${orientation};margin:10mm}*{box-sizing:border-box}body{margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a}.page{width:${pageWidthMm}mm;min-height:${pageHeightMm}mm;margin:20px auto;background:white;padding:14mm;box-shadow:0 18px 50px rgba(15,23,42,.18)}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:12px}h1{margin:0;font-size:22px}.meta{font-size:11px;color:#475569;line-height:1.7}.badge{display:inline-block;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:5px 10px;font-weight:700}.gantt{width:${390 + chartWidth}px}.marker-band{position:relative;height:52px;margin-left:390px;border:1px solid #e2e8f0;border-bottom:0;background:#fff}.marker-label{position:absolute;z-index:5;transform:translateX(-50%);color:white;border-radius:5px;padding:3px 7px;font-size:9px;font-weight:800;white-space:nowrap}.months{position:relative;height:30px;margin-left:390px;background:#e5e7eb;color:#0f172a;border-radius:0;overflow:hidden;border-top:1px solid #cbd5e1;border-left:1px solid #cbd5e1}.month{position:absolute;top:0;height:30px;display:flex;align-items:center;justify-content:center;border-right:1px solid #cbd5e1;font-size:11px;font-weight:800}.weeks{position:relative;height:22px;margin-left:390px;background:#f1f5f9;color:#1e3a8a;overflow:hidden;border-left:1px solid #cbd5e1}.week{position:absolute;top:0;height:22px;display:flex;align-items:center;justify-content:center;border-right:1px solid #cbd5e1;font-size:10px;font-weight:900;white-space:nowrap}.days{position:relative;height:34px;margin-left:390px;background:#f8fafc;color:#334155;overflow:hidden;border-left:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}.day{position:absolute;top:0;height:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid #dbe4ef;font-size:7px;line-height:1.05}.day b{font-size:8px;color:#0f172a}.day small{font-size:6px;color:#475569}table{width:${390 + chartWidth}px;border-collapse:collapse;font-size:10px}th{background:#e5e7eb;color:#0f172a;text-align:left;border:1px solid #cbd5e1;padding:8px}td{height:28px;border:1px solid #dbe4ef;padding:5px;vertical-align:middle}.name{width:250px}.name strong{font-weight:700}.name small{display:block;color:#64748b;font-size:9px;margin-top:2px}.level-0{padding-left:10px}.level-1{padding-left:26px}.level-2{padding-left:42px}.level-3{padding-left:58px}.row-location td{background:#cbd5e1;font-weight:700}.row-building td{background:#e2e8f0;font-weight:700}.row-category td{background:#f1f5f9;font-weight:700}.row-task td{background:#fff}.chart-cell{width:${chartWidth}px;padding:0}.chart{position:relative;height:100%;min-height:28px;overflow:hidden;background-color:#fff;background-image:linear-gradient(to right,#dbe4ef 1px,transparent 1px);background-size:${dayPx}px 100%}.bg-only{background-color:transparent}.weekend{position:absolute;top:0;bottom:0;background:rgba(248,113,113,.16)}.holiday{position:absolute;top:0;bottom:0;background:rgba(239,68,68,.20)}.marker-line{position:absolute;top:0;bottom:0;border-left:2px solid;z-index:3}.contract-bar{position:absolute;top:9px;height:10px;border-radius:3px;background:#cbd5e1;opacity:.55}.bar{position:absolute;top:5px;height:18px;border-radius:4px;color:white;overflow:visible;box-shadow:0 1px 2px rgba(15,23,42,.22);z-index:8}.bar i{position:absolute;left:0;top:0;bottom:0;background:rgba(16,185,129,.55);z-index:1}.bar span{position:relative;z-index:2;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:4px 6px;font-size:9px;font-weight:700}.bar b{position:absolute;right:4px;top:50%;transform:translateY(-50%);color:white;background:transparent;border:0;border-radius:0;padding:0;font-size:8px;font-weight:900;z-index:9;text-shadow:0 1px 2px rgba(15,23,42,.75)}footer{margin-top:18px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;color:#64748b;display:flex;justify-content:space-between}@media print{body{background:white}.page{margin:0;box-shadow:none;width:auto;min-height:auto}}
    </style></head><body><main class="page"><header><div><span class="badge">${escapeHtml(template)}</span><h1>${escapeHtml(scheduleName)}</h1><div class="meta">Dátumtartomány: ${escapeHtml(timelineStartIso)} – ${escapeHtml(timelineEndIso)} · Nézet: ${escapeHtml(getViewLabel(viewMode))}</div></div><div class="meta">DIMPROVER<br/>Készítés: ${escapeHtml(new Date().toLocaleString("hu-HU"))}<br/>Látható sorok: ${visibleRowLayouts.length}</div></header><section class="gantt"><div class="marker-band">${markerLabels}</div><div class="months">${monthLabels.join("")}</div><div class="weeks">${weekLabels.join("")}</div><div class="days">${dayLabels}</div><table><thead><tr><th>Feladat</th><th>Típus</th><th>Dátum</th><th>Gantt diagram</th></tr></thead><tbody>${pdfRows || '<tr><td colspan="4">Nincs megjeleníthető sor.</td></tr>'}</tbody></table></section><footer><span>DIMPROVER · Ütemterv PDF előnézet</span><span>${escapeHtml(statusMessage)}</span></footer></main></body></html>`;
  };

  const openPdfPreview = () => {
    saveWorkingSchedule("Ütemterv PDF előnézet");
    setPdfPreviewHtml(buildSchedulePdfHtml(pdfPaperSize, pdfOrientation, "Ütemterv (Gantt diagram)"));
    setIsPdfPreviewOpen(true);
    setStatusMessage("Ütemterv PDF előnézet megnyitva");
  };

  const handlePrint = (paperSize: PdfPaperSize, template: string) => {
    saveWorkingSchedule(template);
    const style = document.createElement("style");
    style.innerHTML = `@page { size: ${paperSize} landscape; margin: 10mm; } @media print { body { background: white !important; } .no-print { display: none !important; } }`;
    document.head.appendChild(style);
    setStatusMessage(`Nyomtatási kép: ${paperSize} fekvő · ${template}`);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => style.remove(), 500);
    }, 100);
    setIsPrintModalOpen(false);
  };

  const setProjectSource = (source: ScheduleSource) => {
    setSelectedSource(source);
    setSchedule(initialSchedule);
    setStatusMessage(source === "sample" ? "Minta ütemterv megjelenítve" : "Projektadat betöltés előkészítve; jelenleg mintaadat töltődik");
  };

  const getTimelineStep = (direction: "prev" | "next") => {
    const sign = direction === "next" ? 1 : -1;
    if (viewMode === "day") return { days: sign, months: 0 };
    if (viewMode === "week") return { days: sign * 7, months: 0 };
    if (viewMode === "month") return { days: 0, months: sign };
    if (viewMode === "year") return { days: 0, months: sign * 12 };
    return { days: 0, months: sign * 4 };
  };

  const moveDateByStep = (date: Date, direction: "prev" | "next") => {
    const step = getTimelineStep(direction);
    return step.months ? addMonths(date, step.months) : addDays(date, step.days);
  };

  const shiftTimeline = (direction: "prev" | "next") => {
    setTimelineStartDate((prev) => moveDateByStep(prev, direction));
    setCustomTimelineEndDate((prev) => (prev ? moveDateByStep(prev, direction) : prev));
    setScrollLeft(0);
    setStatusMessage(direction === "next" ? "Ütemterv előreléptetve" : "Ütemterv visszaléptetve");
  };


  // Globális Ctrl/Alt gyorsbillentyűk letiltva: létrehozás és navigáció csak gombbal működik.


  const handlePlaceholderAction = (message: string) => setStatusMessage(message);

  const handleCreateNewSchedule = (name: string, startDate: string, endDate: string, withSampleTask: boolean) => {
    const empty = createEmptySchedule();
    let nextSchedule = empty;
    if (withSampleTask) {
      const task: ScheduleTask = {
        id: Date.now(),
        order: 1,
        name: "Első próba feladat",
        contractor: "Vállalkozó neve",
        category: "Előkészítés",
        startWeek: 1,
        duration: getDurationWeeks(startDate, endDate),
        contractStartWeek: 1,
        contractDuration: getDurationWeeks(startDate, endDate),
        actualStartWeek: 1,
        actualDuration: getDurationWeeks(startDate, endDate),
        startDate,
        endDate,
        contractStartDate: startDate,
        contractEndDate: endDate,
        actualStartDate: startDate,
        actualEndDate: endDate,
        progress: 0,
        predecessors: [],
      };
      nextSchedule = addTaskToCategory(empty, task, "Előkészítés");
    }
    setScheduleName(name || "Új munkaközi ütemterv");
    setSchedule(nextSchedule);
    setTimelineStartDate(parseDateInput(startDate));
    setCustomTimelineEndDate(parseDateInput(endDate));
    setCollapsedRows(new Set());
    setVersions([]);
    setManualHolidays([]);
    setStatusMessage("Új ütemterv létrehozva");
    setIsNewScheduleOpen(false);
  };

  const zoomControls = (
    <div className="no-print flex shrink-0 rounded-lg border border-slate-700 bg-slate-900 shadow-sm">
      <button type="button" onClick={() => changeZoom("out")} className="border-r border-slate-700 p-1.5 text-slate-200 hover:bg-slate-800"><Minus size={13} /></button>
      <button type="button" onClick={() => setZoomLevel(1)} className="border-r border-slate-700 px-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-800">{Math.round(zoomLevel * 100)}%</button>
      <button type="button" onClick={() => changeZoom("in")} className="p-1.5 text-slate-200 hover:bg-slate-800"><Plus size={13} /></button>
    </div>
  );

  return (
    <AppLayout>
      <section className="relative mb-0 min-h-screen overflow-hidden px-8 pb-8 pt-7">
        <div className="relative z-[1]">
          <div className="no-print relative mb-5 overflow-hidden rounded-none border border-slate-300 bg-gradient-to-r from-slate-200 via-slate-100 to-blue-100 px-5 py-4 text-slate-900 shadow-sm ring-1 ring-blue-200/50">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-[0.28] [background-image:linear-gradient(to_right,rgba(37,99,235,0.30)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.22)_1px,transparent_1px)] [background-size:24px_24px]" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/35 via-white/55 to-blue-50/45" aria-hidden="true" />
            <div className="relative z-10">
            <div className="mb-3 text-sm font-medium text-blue-700">← Vissza a projekt áttekintéshez</div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 text-sm text-slate-500">Projektek / Ütemterv / Gantt diagram</div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950">Ütemterv (Gantt diagram)</h1>
                <p className="mt-2 text-sm text-emerald-700">Automatikus mentés aktív · {statusMessage}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="flex overflow-hidden rounded-none border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-600 shadow-sm">
                    <Link href="/utemezes" className="rounded-none bg-blue-600 px-4 py-1.5 text-white shadow-sm">Gantt diagram</Link>
                    <Link href="/utemezes/lista" className="rounded-none px-4 py-1.5 hover:bg-slate-50">Lista nézet</Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScheduleHelpOpen((open) => !open)}
                    className={`flex items-center gap-2 rounded-none border px-4 py-2.5 text-sm font-semibold shadow-sm ${isScheduleHelpOpen ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700" : "border-indigo-300 bg-indigo-100 text-indigo-800 hover:bg-indigo-200"}`}
                    aria-label={isScheduleHelpOpen ? "Ütemterv súgó bezárása" : "Ütemterv súgó megnyitása"}
                  >
                    <HelpCircle size={16} />
                    Súgó
                  </button>
                  <button
                    type="button"
                    onClick={() => saveWorkingSchedule("Kézi mentés")}
                    className="rounded-none border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Mentés
                  </button>
                  <button
                    type="button"
                    onClick={openPdfPreview}
                    className="rounded-none border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    PDF előnézet / export
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlaceholderAction("Ütemterv véglegesítése előkészítve")}
                    className="rounded-none bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    Véglegesítés
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => { setSelectedSource("sample"); setScheduleName("Minta ütemterv"); setSchedule(initialSchedule); setCollapsedRows(new Set()); setScheduleRevision((rev) => rev + 1); setStatusMessage("Minta ütemterv betöltve"); }} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100" title="Minta Gantt és lista ütemterv betöltése"><CalendarDays size={14} />Minta ütemterv</button>
                  <button type="button" onClick={() => setIsNewScheduleOpen(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"><Plus size={14} />Új ütemterv létrehozás</button>
                </div>
              </div>
            </div>
            </div>
          </div>
          {isScheduleHelpOpen && (
            <div className="no-print mb-5 overflow-hidden rounded-2xl border border-indigo-300 bg-indigo-50 shadow-2xl">
              <div className="flex items-start justify-between border-b border-indigo-300 bg-indigo-400/70 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="inline-flex min-h-[32px] w-[112px] items-center justify-center rounded-md border border-indigo-200 bg-white/90 px-2 text-center text-[12px] font-black uppercase leading-none tracking-[0.08em] text-indigo-800">Súgó</span>
                  <div>
                    <h2 className="text-base font-bold leading-tight text-slate-950">Ütemterv súgó</h2>
                    <p className="text-xs font-medium text-indigo-50 drop-shadow-sm">Gantt nézet, jelölések, szerkesztés, mentés és export rövid használati leírása.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsScheduleHelpOpen(false)} className="rounded-md p-1.5 text-indigo-100 hover:bg-white/25 hover:text-white" aria-label="Súgó bezárása"><X size={16} /></button>
              </div>
              <div className="grid gap-3 bg-gradient-to-b from-indigo-200 via-indigo-100 to-indigo-50 p-4 text-xs text-slate-700 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-1 font-bold text-slate-900">Nézetek</div><p>Gantt diagram és Lista nézet között válthatsz. Az időszak lehet éves, 4 havi, havi, heti vagy napi bontás.</p></div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-1 font-bold text-slate-900">Megjelenítés</div><p>A felső kapcsolókkal állíthatók a sávok, hétvégék, ünnepnapok, jelmagyarázat és mérföldkő rétegek.</p></div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-1 font-bold text-slate-900">Ütemterv sávok</div><p>A halvány sáv a szerződéses ütemet, a sötét sáv az aktuális ütemet, a zöld rész a készültséget mutatja.</p></div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-1 font-bold text-slate-900">Mérföldkövek</div><p>A rombusz dátumhoz kötött esemény. A szín a fontosságot jelzi: normál, fontos vagy kritikus.</p></div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-1 font-bold text-slate-900">Szerkesztés</div><p>Mérföldkőre kattintva szerkesztő nyílik. A kapcsolódó feladat alapján a marker a megfelelő Gantt sorhoz igazítható.</p></div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-1 font-bold text-slate-900">Mentés és export</div><p>A Mentés munkaközi állapotot rögzít. A PDF előnézet/export nyomtatási vagy megosztási előkészítéshez használható.</p></div>
              </div>
              <div className="flex items-center justify-between border-t border-indigo-300 bg-indigo-400/65 px-4 py-2 text-[11px] font-semibold text-white">
                <span>DIMPROVER ütemterv modul</span>
                <span>Bezárás: jobb felső X</span>
              </div>
            </div>
          )}

      <ModulePanel storageKey="utemezes:display-editor" title="Megjelenítés és szerkesztő" contentClassName="px-5 py-4" className="no-print mb-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Eye size={16} />Megjelenítés és szerkesztő</div>
        <div className="flex flex-wrap gap-2">
          <FeatureToggle label="Szerződéses sáv" checked={features.showContractBars} onChange={() => toggleFeature("showContractBars")} />
          <FeatureToggle label="Aktuális sáv" checked={features.showActualBars} onChange={() => toggleFeature("showActualBars")} />
          <FeatureToggle label="Készültség" checked={features.showProgressOverlay} onChange={() => toggleFeature("showProgressOverlay")} />
          <FeatureToggle label="Mai nap vonal" checked={features.showTodayLine} onChange={() => toggleFeature("showTodayLine")} />
          <FeatureToggle label="Hétvégék jelölése" checked={features.showWeekendHighlight} onChange={() => toggleFeature("showWeekendHighlight")} />
          <FeatureToggle label="Ünnepnapok jelölése" checked={features.showHolidayHighlight} onChange={() => toggleFeature("showHolidayHighlight")} />
          <FeatureToggle label="Összesítő sáv" checked={features.showCollapsedSummaryBars} onChange={() => toggleFeature("showCollapsedSummaryBars")} />
          <FeatureToggle label="Jelmagyarázat" checked={features.showLegend} onChange={() => toggleFeature("showLegend")} />
          <FeatureToggle label="Mérföldkő típus ikon" checked={features.showMilestoneTypeIcon} onChange={() => toggleFeature("showMilestoneTypeIcon")} />
          <FeatureToggle label="Mérföldkő státusz jel" checked={features.showMilestoneStatusIcon} onChange={() => toggleFeature("showMilestoneStatusIcon")} />
          <FeatureToggle label="Mérföldkő fontosság" checked={features.showMilestonePriorityMarker} onChange={() => toggleFeature("showMilestonePriorityMarker")} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => handlePlaceholderAction("Kezdőlapra rögzítés előkészítve")} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Pin size={14} />Kezdőlapra rögzítés</button>
          <button type="button" onClick={() => handlePlaceholderAction("Készültség a feladat szerkesztésében módosítható")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Percent size={14} />Készültség</button>
          <button type="button" onClick={() => handlePlaceholderAction("Időjárás overlay előkészítve")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CloudSun size={14} />Időjárás</button>
          <button type="button" onClick={openCreateMilestone} className="flex items-center gap-2 rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"><Diamond size={14} />Mérföldkő</button>
          <button type="button" onClick={() => { setSelectedTask(null); setSelectedTaskId(null); setIsCreateModalOpen(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"><Plus size={14} />Új feladat</button>
          <button type="button" onClick={() => setIsBoundaryModalOpen(true)} className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"><SplitSquareVertical size={14} />Szakaszhatároló</button>
          <button type="button" onClick={() => setIsHolidayModalOpen(true)} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"><CalendarDays size={14} />Mozgó ünnepnap</button>
          <button type="button" onClick={() => handlePlaceholderAction("Egyéb műveletek előkészítve")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><MoreHorizontal size={14} />Egyéb</button>
        </div>
      </ModulePanel>

      <ModulePanel storageKey="utemezes:period-view" title="Időszak és nézet" contentClassName="px-5 py-4" className="no-print mb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftTimeline("prev")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">←</button>
            <button type="button" onClick={() => shiftTimeline("next")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">→</button>
            <div className="ml-2"><h2 className="text-sm font-semibold text-slate-900">{getViewLabel(viewMode)}</h2><p className="text-xs text-slate-500">{timelineStartDate.toLocaleDateString("hu-HU")} – {timelineEndDate.toLocaleDateString("hu-HU")}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">Időszak:</span>
            <input type="date" value={timelineStartIso} onChange={(event) => { setTimelineStartDate(parseDateInput(event.target.value)); setScrollLeft(0); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500" />
            <span className="text-slate-400">–</span>
            <input type="date" value={timelineEndIso} min={timelineStartIso} onChange={(event) => { setCustomTimelineEndDate(parseDateInput(event.target.value)); setScrollLeft(0); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500" />
          </div>
          {features.showViewSwitcher && (
            <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-medium text-slate-600">
              {[
                { label: "Éves", value: "year" as ViewMode },
                { label: "4 havi", value: "fourMonth" as ViewMode },
                { label: "Havi", value: "month" as ViewMode },
                { label: "Heti", value: "week" as ViewMode },
                { label: "Napi", value: "day" as ViewMode },
              ].map((view) => <button type="button" key={view.value} onClick={() => handleViewChange(view.value)} className={`rounded-md px-3 py-1.5 ${viewMode === view.value ? "bg-blue-600 text-white shadow-sm" : "hover:bg-white"}`}>{view.label}</button>)}
            </div>
          )}
        </div>
      </ModulePanel>

      <div className="relative border border-blue-200/70 bg-white shadow-[0_10px_24px_rgba(37,99,235,0.10)]">
          {features.showLegend && (
            <div className="border-b border-slate-100 px-4 py-3 text-xs">
              <div className="mb-2 flex flex-wrap items-center gap-4">
                <span className="font-semibold text-slate-800">Munkanemek</span>
                {Array.from(new Set(allTasks.map((task) => task.category))).map((category) => <span key={category} className="flex items-center gap-1.5 text-slate-600"><span className={`h-2.5 w-2.5 rounded ${getCategoryColor(schedule, category)}`} />{category}</span>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-slate-800">Jelölések</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-slate-200" />Szerződéses ütem</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-blue-600" />Aktuális ütem</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-green-500/40" />Készültség</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-[2px] rounded bg-blue-500" />MA vonal</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-[2px] rounded bg-red-600" />Szakaszhatároló</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-3 w-3 rotate-45 rounded-sm border border-blue-300 bg-blue-500" />Mérföldkő normál</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-3 w-3 rotate-45 rounded-sm border border-orange-300 bg-orange-500" />Fontos</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="h-3 w-3 rotate-45 rounded-sm border border-red-300 bg-red-500" />Kritikus</span>
                  <span className="flex items-center gap-1.5 text-slate-600"><span className="inline-flex h-5 min-w-10 items-center justify-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-1"><Clock3 size={11} /><span className="h-2 w-2 rotate-45 rounded-sm bg-blue-500" /><Hammer size={11} /></span>Típus / státusz ikon</span>
                  {features.showWeekendHighlight && <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-red-100" />Hétvége</span>}
                  {features.showHolidayHighlight && <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-red-200/70" />Ünnepnap{manualHolidays.length ? ` (${manualHolidays.length} manuális)` : ""}</span>}
                </div>
                <div className="ml-auto" />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs">
            <span className="font-semibold text-slate-700">Ütemterv táblázat magassága: {scheduleViewportHeight}px</span>
            <input
              type="range"
              min={420}
              max={980}
              step={10}
              value={scheduleViewportHeight}
              onChange={(event) => handleScheduleHeightSliderChange(Number(event.target.value))}
              className="h-2 min-w-64 flex-1 cursor-pointer accent-blue-600"
              aria-label="Ütemterv táblázat magassága"
            />
            <div className="flex min-w-36 justify-between text-[11px] font-medium text-slate-500">
              <span>Alacsony</span>
              <span>Magas</span>
            </div>
          </div>

          <div
            ref={scheduleScrollRef}
            className="overflow-auto cursor-grab active:cursor-grabbing"
            style={{ height: `${scheduleViewportHeight}px`, minHeight: "420px" }}
            onPointerDown={handleSchedulePanPointerDown}
            onPointerMove={handleSchedulePanPointerMove}
            onPointerUp={handleSchedulePanPointerEnd}
            onPointerCancel={handleSchedulePanPointerEnd}
            onPointerLeave={handleSchedulePanPointerEnd}
            onScroll={(event) => { const target = event.currentTarget; setScrollTop(target.scrollTop); setScrollLeft(target.scrollLeft); setViewportWidth(target.clientWidth); setViewportHeight(target.clientHeight); }}
          >
            <div className="w-max min-w-full pb-10" style={{ minWidth: `${minTableWidth}px` }}>
              <TimelineHeader
                weekWidth={weekWidth}
                leftColWidth={LEFT_COL_WIDTH}
                typeColWidth={TYPE_COL_WIDTH}
                timelineStartDate={timelineStartDate}
                timelineEndDate={timelineEndDate}
                viewMode={viewMode}
                zoomControls={zoomControls}
                markers={[
                  ...(features.showTodayLine && todayVisible
                    ? [{ id: "today", left: getXFromDate(todayIso, timelineStartIso) * (dayWidth / 28), color: "#2563eb", label: "MA" }]
                    : []),
                  ...boundaries
                    .filter((boundary) => boundary.date >= timelineStartIso && boundary.date <= timelineEndIso)
                    .map((boundary) => ({
                      id: boundary.id,
                      left: getXFromDate(boundary.date, timelineStartIso) * (dayWidth / 28),
                      color: boundary.color,
                      label: boundary.title,
                    })),
                ]}
              />

              <div className="relative" onClick={handleGanttEmptyClick}>
                <DependencyLayer taskRows={dependencyTaskRows} weekWidth={weekWidth} offsetLeft={LEFT_COL_WIDTH + TYPE_COL_WIDTH} timelineStartDate={timelineStartDate} totalHeight={totalVirtualHeight} timelineWidth={timelineWidth} />

                <VirtualScheduleRenderer key={`gantt-${scheduleRevision}-${dayWidth}-${visibleViewportRows.map((row) => row.rowType === "task" ? `${row.id}-${row.task.actualStartDate}-${row.task.actualEndDate}-${row.task.progress}` : row.id).join("|")}`} rows={visibleViewportRows} totalHeight={totalVirtualHeight} features={features} weekWidth={weekWidth} timelineStartDate={timelineStartDate} stickyFirstCol={stickyFirstCol} stickySecondCol={stickySecondCol} leftColWidth={LEFT_COL_WIDTH} typeColWidth={TYPE_COL_WIDTH} collapsedRows={collapsedRows} onToggle={toggleRow} onTaskClick={handleSelectTask} onTaskBarChange={applyTaskBarChange} onInteractionStart={handleTaskBarInteractionStart} onInteractionEnd={handleTaskBarInteractionEnd} />

                <div className="pointer-events-none absolute bottom-0 top-0 z-[1]" style={{ left: `${LEFT_COL_WIDTH + TYPE_COL_WIDTH}px`, width: `${timelineWidth}px` }}>
                  <GridLines dayWidth={dayWidth} timelineStartDate={timelineStartDate} timelineEndDate={timelineEndDate} showWeekends={features.showWeekendHighlight} showHolidays={features.showHolidayHighlight} manualHolidayDates={manualHolidays.map((holiday) => holiday.date)} />
                </div>

                <div
                  className="pointer-events-none absolute top-0 z-[420] overflow-hidden"
                  style={{
                    left: `${LEFT_COL_WIDTH + TYPE_COL_WIDTH + scrollLeft}px`,
                    width: `${Math.max(0, viewportWidth - LEFT_COL_WIDTH - TYPE_COL_WIDTH)}px`,
                    height: `${totalVirtualHeight}px`,
                  }}
                >
                  {features.showTodayLine && todayVisible && (
                    <div className="absolute bottom-0 top-0" style={{ left: `${todayLeftPx - scrollLeft}px` }}>
                      <div className="absolute bottom-0 top-0 w-[4px] -translate-x-1/2 bg-blue-400/10" />
                      <div className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2 bg-blue-500" />
                    </div>
                  )}

                  {boundaries.map((boundary) => {
                    if (boundary.date < timelineStartIso || boundary.date > timelineEndIso) return null;
                    const left = getXFromDate(boundary.date, timelineStartIso) * (dayWidth / 28) - scrollLeft;
                    return (
                      <div key={boundary.id} className="absolute bottom-0 top-0" style={{ left: `${left}px` }}>
                        <div className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2" style={{ backgroundColor: boundary.color }} />
                      </div>
                    );
                  })}

                  {milestones.map((milestone, index) => {
                    if (milestone.date < timelineStartIso || milestone.date > timelineEndIso) return null;
                    const left = getXFromDate(milestone.date, timelineStartIso) * (dayWidth / 28) - scrollLeft;
                    const relatedTask = allTasks.find((task) => task.id === milestone.relatedTaskId);
                    const relatedTaskRow = milestone.relatedTaskId ? taskRowByTaskId.get(milestone.relatedTaskId) : undefined;
                    const baseTop = relatedTaskRow ? relatedTaskRow.top + relatedTaskRow.height / 2 - 14 : 28 + (index % 6) * 34;
                    const collision = milestoneCollisionSlots.get(milestone.id) ?? { slot: 0, count: 1 };
                    const centeredSlot = collision.slot - (collision.count - 1) / 2;
                    const markerIsAnchoredToTask = Boolean(relatedTaskRow);
                    const xOffset = collision.count > 1 ? centeredSlot * 18 : 0;
                    const yOffset = collision.count > 1 ? centeredSlot * (markerIsAnchoredToTask ? 10 : 28) : 0;
                    const top = baseTop + yOffset;
                    const markerLeft = left + xOffset;
                    const isActiveMilestone = isMilestoneModalOpen && selectedMilestoneId === milestone.id;
                    const MilestoneTypeIcon = milestoneTypeIcons[milestone.type];
                    const MilestoneStatusIcon = milestoneStatusIcons[milestone.status];
                    const showMarkerType = features.showMilestoneTypeIcon && milestone.showType !== false;
                    const showMarkerStatus = features.showMilestoneStatusIcon && milestone.showStatus !== false;
                    const showMarkerPriority = features.showMilestonePriorityMarker && milestone.showPriority !== false;
                    const visibleMarkerPartCount = [showMarkerStatus, showMarkerPriority, showMarkerType].filter(Boolean).length;
                    const compactMilestoneMarker = visibleMarkerPartCount <= 1;
                    const tooltipAlignmentClass = markerLeft < 170 ? "left-0 translate-x-0" : markerLeft > viewportWidth - 330 ? "right-0 translate-x-0" : "left-1/2 -translate-x-1/2";
                    return (
                      <div key={milestone.id} className={`absolute bottom-0 top-0 ${isActiveMilestone ? "z-[340]" : "z-[120]"}`} style={{ left: `${left}px` }}>
                        <div className={`pointer-events-none absolute bottom-0 top-0 w-0 -translate-x-1/2 border-l-2 border-dotted ${milestonePriorityLineClasses[milestone.priority]} ${isActiveMilestone ? "opacity-100" : "opacity-70"}`} />
                        {markerIsAnchoredToTask && !compactMilestoneMarker && (
                          <div
                            className={`pointer-events-none absolute h-8 w-20 -translate-x-1/2 rounded-full border border-dashed bg-white/35 ${milestonePriorityLineClasses[milestone.priority]} ${isActiveMilestone ? "scale-125 shadow-[0_0_0_5px_rgba(37,99,235,0.16)]" : ""}`}
                            style={{ left: `${xOffset}px`, top: `${top - 2}px` }}
                          />
                        )}
                        <button
                          type="button"
                          data-gantt-milestone-marker="true"
                          onClick={(event) => { event.stopPropagation(); openEditMilestone(milestone); }}
                          className={`group pointer-events-auto absolute flex -translate-x-1/2 items-center justify-center bg-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.16)] ring-1 ring-white/90 hover:bg-white ${compactMilestoneMarker ? "h-[22px] w-[22px] min-w-0 rounded-lg border border-dashed border-blue-400 bg-blue-50/80 p-0" : "h-7 min-w-12 rounded-full px-1.5"} ${isActiveMilestone ? "z-[360] scale-110 bg-white shadow-[0_0_0_4px_rgba(37,99,235,0.20),0_14px_26px_rgba(15,23,42,0.24)] ring-2 ring-blue-500" : "z-[260]"}` }
                          style={{ left: `${xOffset}px`, top: `${top}px` }}
                          aria-label={`Mérföldkő: ${milestone.name}`}
                        >
                          <span className={`flex items-center ${compactMilestoneMarker ? "gap-0" : "gap-1.5"}`}>
                            {showMarkerStatus && <span className={`${compactMilestoneMarker ? "h-4 w-4" : "h-4 w-4"} flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm`}><MilestoneStatusIcon size={compactMilestoneMarker ? 12 : 13} strokeWidth={2.1} /></span>}
                            {showMarkerPriority && <span className={`${compactMilestoneMarker ? "h-3 w-3" : "h-4 w-4"} rotate-45 rounded-sm border ${milestonePriorityClasses[milestone.priority]}`} />}
                            {showMarkerType && <span className={`${compactMilestoneMarker ? "h-4 w-4" : "h-4 w-4"} flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm`}><MilestoneTypeIcon size={compactMilestoneMarker ? 12 : 14} strokeWidth={2.1} /></span>}
                          </span>
                          <span className={`pointer-events-none absolute top-8 z-[700] hidden w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-medium text-slate-600 shadow-[0_18px_45px_rgba(15,23,42,0.22)] group-hover:block ${isActiveMilestone ? "block border-blue-200 ring-2 ring-blue-100" : ""} ${tooltipAlignmentClass}`}>
                            <span className="block text-sm font-black text-slate-900">{milestone.name}</span>
                            {isActiveMilestone && <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Aktív szerkesztés alatt</span>}
                            <span className="mt-2 block"><span className="font-bold text-slate-700">Dátum:</span> {milestone.date}</span>
                            <span className="mt-1 flex items-center gap-1.5"><MilestoneTypeIcon size={13} strokeWidth={2} /><span><span className="font-bold text-slate-700">Típus:</span> {milestoneTypeLabels[milestone.type]}</span></span>
                            <span className="mt-1 flex items-center gap-1.5"><MilestoneStatusIcon size={13} strokeWidth={2} /><span><span className="font-bold text-slate-700">Státusz:</span> {milestoneStatusLabels[milestone.status]}</span></span>
                            <span className="block"><span className="font-bold text-slate-700">Fontosság:</span> {milestonePriorityLabels[milestone.priority]}</span>
                            <span className="block"><span className="font-bold text-slate-700">Felelős:</span> {milestone.owner || "Nincs megadva"}</span>
                            <span className="block"><span className="font-bold text-slate-700">Kapcsolódó feladat:</span> {relatedTask?.name || "Nincs kapcsolódó feladat"}</span>
                            {markerIsAnchoredToTask && <span className="mt-1 block rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">A marker a kapcsolódó feladat sorához van igazítva.</span>}
                            {collision.count > 1 && <span className="mt-1 block rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Azonos nap/sor ütközés kezelve: {collision.slot + 1}/{collision.count}</span>}
                            {milestone.note && <span className="mt-2 block border-t border-slate-100 pt-2 text-slate-500">{milestone.note}</span>}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

      <CreateTaskModal isOpen={isCreateModalOpen} onClose={closeTaskEditor} onCreate={handleCreateTask} onDelete={handleDeleteTask} onStartCreateNew={() => { setSelectedTask(null); setSelectedTaskId(null); setStatusMessage("Új feladat létrehozása a szerkesztőből"); }} selectedTask={selectedTask} timelineStartDate={timelineStartIso} dependencyOptions={allTasks.filter((task) => task.id !== selectedTaskId).map((task) => ({ id: task.id, name: task.name, category: task.category }))} />
      <MilestoneModal isOpen={isMilestoneModalOpen} mode={selectedMilestoneId ? "edit" : "create"} form={milestoneForm} taskOptions={allTasks.map((task) => ({ id: task.id, name: task.name }))} onClose={closeMilestoneModal} onChange={setMilestoneForm} onSave={saveMilestone} onDelete={selectedMilestoneId ? deleteMilestone : undefined} />
      <NewScheduleModal isOpen={isNewScheduleOpen} onClose={() => setIsNewScheduleOpen(false)} onCreate={handleCreateNewSchedule} />
      <BoundaryModal isOpen={isBoundaryModalOpen} onClose={() => setIsBoundaryModalOpen(false)} boundaries={boundaries} onSave={(next) => { setBoundaries(next); setStatusMessage("Szakaszhatárolók frissítve"); }} />
      <HolidayModal isOpen={isHolidayModalOpen} onClose={() => setIsHolidayModalOpen(false)} holidays={manualHolidays} onSave={(next) => { setManualHolidays(next); setStatusMessage("Mozgó ünnepnapok frissítve"); }} />
      <PrintSettingsModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} onPrint={handlePrint} />
      <SchedulePdfPreviewModal isOpen={isPdfPreviewOpen} html={pdfPreviewHtml} paperSize={pdfPaperSize} orientation={pdfOrientation} onPaperSizeChange={(value) => { setPdfPaperSize(value); setPdfPreviewHtml(buildSchedulePdfHtml(value, pdfOrientation, "Ütemterv (Gantt diagram)")); }} onOrientationChange={(value) => { setPdfOrientation(value); setPdfPreviewHtml(buildSchedulePdfHtml(pdfPaperSize, value, "Ütemterv (Gantt diagram)")); }} onClose={() => setIsPdfPreviewOpen(false)} />
        </div>
      </section>
    </AppLayout>
  );
}
