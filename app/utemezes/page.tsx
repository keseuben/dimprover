"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  CalendarDays,
  CloudSun,
  Diamond,
  Download,
  Eye,
  Minus,
  MoreHorizontal,
  Percent,
  Pin,
  Plus,
  Printer,
  Save,
  SlidersHorizontal,
  SplitSquareVertical,
  X,
} from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
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
import { selectAllTasks, selectTasksInDateRange } from "@/app/lib/schedule/selectors";
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
  formatDate,
} from "@/app/lib/schedule/timeline";
import {
  ResizeState,
  ScheduleFeatureState,
  ScheduleLocation,
  ScheduleSource,
  ScheduleTask,
  ViewMode,
} from "@/app/lib/schedule/types";

const STORAGE_KEY = "dimprover.practice.schedule.v1";

const stickyFirstCol =
  "sticky left-0 z-30 flex items-center gap-2 border-r border-slate-300 bg-white px-4 text-left shadow-[3px_0_0_rgba(226,232,240,0.9)]";

const stickySecondCol = "sticky z-30 border-r border-slate-200 bg-slate-50";

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

type PersistedSchedule = {
  scheduleName: string;
  schedule: ScheduleLocation[];
  boundaries: ScheduleBoundary[];
  versions: SavedVersion[];
  timelineStartDate: string;
  timelineEndDate: string;
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Új ütemterv létrehozása</h2>
            <p className="text-sm text-slate-500">Gyakorló ütemterv, dátumtartomány és kezdő sáv beállítása.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
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
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
          <button onClick={() => onCreate(name, startDate, endDate, withSampleTask)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Létrehozás</button>
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
    if (isOpen) setItems(boundaries);
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Szakaszhatárolók</h2>
            <p className="text-sm text-slate-500">Projekt kezdés, szakaszhatárok és befejező vonalak beállítása.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
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
              <button onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))} className="rounded-lg border border-red-200 text-red-600 hover:bg-red-50">×</button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button onClick={addBoundary} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">+ Új vonal</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
            <button onClick={() => { onSave(items); onClose(); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Mentés</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nyomtatási kép / PDF export</h2>
            <p className="text-sm text-slate-500">A munkaközi mentés külön történik, ez csak kiadási/export nézet.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
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
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
          <button onClick={() => onPrint(paperSize, template)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Nyomtatási kép</button>
        </div>
      </div>
    </div>
  );
}

export default function UtemezesPage() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [scheduleName, setScheduleName] = useState("DIMPROVER gyakorló ütemterv");
  const [schedule, setSchedule] = useState<ScheduleLocation[]>(initialSchedule);
  const [features, setFeatures] = useState<ScheduleFeatureState>(initialFeatures);
  const [selectedSource, setSelectedSource] = useState<ScheduleSource>("sample");
  const [viewMode, setViewMode] = useState<ViewMode>("fourMonth");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNewScheduleOpen, setIsNewScheduleOpen] = useState(false);
  const [isBoundaryModalOpen, setIsBoundaryModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1400);
  const [viewportHeight, setViewportHeight] = useState(900);
  const [timelineStartDate, setTimelineStartDate] = useState(new Date(2026, 4, 1));
  const [customTimelineEndDate, setCustomTimelineEndDate] = useState<Date | null>(null);
  const [statusMessage, setStatusMessage] = useState("Minta ütemterv megjelenítve");
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [boundaries, setBoundaries] = useState<ScheduleBoundary[]>([
    { id: "start", title: "Projekt kezdés", date: "2026-05-05", color: "#2563eb" },
    { id: "phase-1", title: "I. szakasz", date: "2026-07-01", color: "#ea580c" },
    { id: "finish", title: "Projekt befejezés", date: "2026-10-19", color: "#dc2626" },
  ]);

  const timelineEndDate = useMemo(
    () => customTimelineEndDate ?? getTimelineEndDate(timelineStartDate, viewMode),
    [customTimelineEndDate, timelineStartDate, viewMode]
  );

  const timelineStartIso = toIsoDate(timelineStartDate);
  const timelineEndIso = toIsoDate(timelineEndDate);
  const totalDays = Math.max(1, differenceInDays(timelineStartIso, timelineEndIso) + 1);
  const visibleTimelineWidth = Math.max(720, viewportWidth - LEFT_COL_WIDTH - TYPE_COL_WIDTH - 24);
  const dayWidth = Math.max(2.4, (visibleTimelineWidth / totalDays) * zoomLevel);
  const weekWidth = dayWidth * 7;
  const timelineWidth = Math.max(totalDays * dayWidth, visibleTimelineWidth);
  const minTableWidth = LEFT_COL_WIDTH + TYPE_COL_WIDTH + timelineWidth;

  const normalizedSchedule = useMemo(() => normalizeSchedule(schedule), [schedule]);
  const allTasks = useMemo(() => selectAllTasks(normalizedSchedule), [normalizedSchedule]);

  const visibleDateRange = useMemo(
    () => getVisibleDateRange(timelineStartDate, { scrollLeft, viewportWidth, dayWidth, overscanDays: 14 }),
    [scrollLeft, viewportWidth, timelineStartDate, dayWidth]
  );

  const visibleTasks = useMemo(
    () => selectTasksInDateRange(normalizedSchedule, visibleDateRange.visibleStartDate, visibleDateRange.visibleEndDate),
    [normalizedSchedule, visibleDateRange]
  );

  const visibleRows = useMemo(() => buildVisibleRows(schedule, collapsedRows), [schedule, collapsedRows]);
  const visibleRowLayouts = useMemo(() => calculateVisibleRowLayout(visibleRows), [visibleRows]);
  const visibleViewportRows = useMemo(
    () => getVisibleRowRange(visibleRowLayouts, scrollTop, viewportHeight, 300),
    [visibleRowLayouts, scrollTop, viewportHeight]
  );
  const totalVirtualHeight = useMemo(() => visibleRowLayouts.at(-1)?.bottom ?? 0, [visibleRowLayouts]);

  const todayIso = toIsoDate(new Date());
  const todayVisible = todayIso >= timelineStartIso && todayIso <= timelineEndIso;
  const todayLeftPx = LEFT_COL_WIDTH + TYPE_COL_WIDTH + getXFromDate(todayIso, timelineStartIso) * (dayWidth / 28);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedSchedule;
      setScheduleName(saved.scheduleName || "DIMPROVER gyakorló ütemterv");
      setSchedule(saved.schedule || initialSchedule);
      setBoundaries(saved.boundaries || []);
      setVersions(saved.versions || []);
      if (saved.timelineStartDate) setTimelineStartDate(parseDateInput(saved.timelineStartDate));
      if (saved.timelineEndDate) setCustomTimelineEndDate(parseDateInput(saved.timelineEndDate));
      setStatusMessage("Korábbi munkaközi mentés betöltve");
    } catch {
      setStatusMessage("A korábbi mentés nem volt betölthető, mintaadat indult");
    }
  }, []);

  useEffect(() => {
    if (!resizeState) return;
    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizeState.startX;
      const deltaDays = Math.round(deltaX / dayWidth);

      setSchedule((prev) =>
        updateTaskInSchedule(prev, resizeState.taskId, (task) => {
          const actualStartDate = getTaskActualStartDate(task);
          const startDate = toDate(actualStartDate);
          const endDate = toDate(resizeState.originalEndDate);
          endDate.setDate(endDate.getDate() + deltaDays);
          const actualEndDate = formatDate(endDate);
          const calculatedWeeks = getDurationWeeks(actualStartDate, actualEndDate);
          return {
            ...task,
            duration: calculatedWeeks,
            actualDuration: calculatedWeeks,
            actualStartDate,
            actualEndDate,
            endDate: actualEndDate,
          };
        })
      );
    };
    const handleMouseUp = () => setResizeState(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizeState, dayWidth]);

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
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setVersions(nextVersions);
    setStatusMessage(`Mentve: ${nextVersion.name}`);
  };

  const toggleFeature = (featureKey: keyof ScheduleFeatureState) => setFeatures((prev) => ({ ...prev, [featureKey]: !prev[featureKey] }));
  const toggleRow = (id: string) => setCollapsedRows((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const handleCreateTask = (task: ScheduleTaskInput) => {
    const actualStart = task.startDate || timelineStartIso;
    const actualEnd = task.endDate || addDays(toDate(actualStart), task.duration * 7 - 1).toISOString().split("T")[0];
    const contractStart = task.contractStartDate || actualStart;
    const contractEnd = task.contractEndDate || actualEnd;

    if (selectedTask) {
      setSchedule((prev) =>
        updateTaskInSchedule(prev, selectedTask.id, (item) => ({
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
        }))
      );
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
        predecessors: [],
      };
      setSchedule((prev) => addTaskToCategory(prev, nextTask, task.category));
    }
    setSelectedTask(null);
    setStatusMessage("Feladat mentve az ütemtervben");
  };

  const handleSelectTask = (task: ScheduleTask) => {
    if (resizeState) return;
    setSelectedTask(task);
    setIsCreateModalOpen(true);
  };

  const handleDeleteTask = () => {
    if (!selectedTask) return;
    setSchedule((prev) => deleteTaskFromSchedule(prev, selectedTask.id));
    setIsCreateModalOpen(false);
    setSelectedTask(null);
    setStatusMessage("Feladat törölve");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (resizeState) return;
    const { active, delta } = event;
    const taskId = Number(active.id);
    const movedDays = Math.round(delta.x / dayWidth);
    if (movedDays === 0) return;

    setSchedule((prev) =>
      updateTaskInSchedule(prev, taskId, (task) => {
        const actualStartDate = getTaskActualStartDate(task);
        const actualEndDate = getTaskActualEndDate(task);
        const nextStartDate = addDays(toDate(actualStartDate), movedDays);
        const nextEndDate = addDays(toDate(actualEndDate), movedDays);
        const nextStart = formatDate(nextStartDate);
        const nextEnd = formatDate(nextEndDate);
        return {
          ...task,
          actualStartDate: nextStart,
          actualEndDate: nextEnd,
          startDate: nextStart,
          endDate: nextEnd,
          actualStartWeek: getWeekOffsetFromDate(timelineStartDate, nextStart),
          startWeek: getWeekOffsetFromDate(timelineStartDate, nextStart),
          actualDuration: getDurationWeeks(nextStart, nextEnd),
          duration: getDurationWeeks(nextStart, nextEnd),
        };
      })
    );
  };

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>, task: ScheduleTask) => {
    event.preventDefault();
    event.stopPropagation();
    setResizeState({ taskId: task.id, startX: event.clientX, originalEndDate: getTaskActualEndDate(task) });
  };

  const changeZoom = (direction: "in" | "out") => setZoomLevel((prev) => Math.min(6, Math.max(0.35, Number((direction === "in" ? prev + 0.25 : prev - 0.25).toFixed(2)))));
  const handleViewChange = (nextViewMode: ViewMode) => {
    setViewMode(nextViewMode);
    setCustomTimelineEndDate(null);
    setZoomLevel(1);
    setScrollLeft(0);
    setStatusMessage(`${getViewLabel(nextViewMode)} aktív`);
  };

  const handlePrint = (paperSize: "A4" | "A3", template: string) => {
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

  const shiftTimeline = (direction: "prev" | "next") => setTimelineStartDate((prev) => {
    if (viewMode === "day") return addDays(prev, direction === "next" ? 1 : -1);
    if (viewMode === "week") return addDays(prev, direction === "next" ? 7 : -7);
    if (viewMode === "month") return addMonths(prev, direction === "next" ? 1 : -1);
    if (viewMode === "year") return addMonths(prev, direction === "next" ? 12 : -12);
    return addMonths(prev, direction === "next" ? 4 : -4);
  });

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
    setStatusMessage("Új ütemterv létrehozva");
    setIsNewScheduleOpen(false);
  };

  const zoomControls = (
    <div className="no-print flex shrink-0 rounded-lg border border-slate-700 bg-slate-900 shadow-sm">
      <button onClick={() => changeZoom("out")} className="border-r border-slate-700 p-1.5 text-slate-200 hover:bg-slate-800"><Minus size={13} /></button>
      <button onClick={() => setZoomLevel(1)} className="border-r border-slate-700 px-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-800">{Math.round(zoomLevel * 100)}%</button>
      <button onClick={() => changeZoom("in")} className="p-1.5 text-slate-200 hover:bg-slate-800"><Plus size={13} /></button>
    </div>
  );

  return (
    <AppLayout>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">DIMPROVER Ütemterv</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{scheduleName}</h1>
          <p className="mt-1 text-xs text-slate-500">{statusMessage} · {getViewLabel(viewMode)} · {allTasks.length} feladat · {versions.length} mentett verzió</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={() => setIsNewScheduleOpen(true)} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Plus size={14} />Új ütemterv</button>
          <button onClick={() => saveWorkingSchedule("Munkaközi ütemterv")} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Save size={14} />Mentés</button>
          <button onClick={() => setIsPrintModalOpen(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Printer size={14} />PDF / nyomtatás</button>
          {features.showFilters && <button onClick={() => handlePlaceholderAction("Szűrők panel előkészítve")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><SlidersHorizontal size={14} />Szűrők</button>}
        </div>
      </div>

      <div className="no-print mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Projekt kiválasztása és mentett verziók</h2>
            <p className="text-xs text-slate-500">A munkaközi ütemterv JSON-adatként mentődik a böngészőbe. A PDF külön export.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Minta ütemterv", value: "sample" as ScheduleSource },
              { label: "Társasház beruházás", value: "project-1" as ScheduleSource },
              { label: "Ipari csarnok", value: "project-2" as ScheduleSource },
            ].map((source) => (
              <button key={source.value} onClick={() => setProjectSource(source.value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedSource === source.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{source.label}</button>
            ))}
          </div>
        </div>
        {versions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {versions.slice(0, 5).map((version) => <span key={version.id} className="rounded-full bg-slate-100 px-3 py-1">{version.name}</span>)}
          </div>
        )}
      </div>

      <div className="no-print mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Eye size={16} />Megjelenítés és szerkesztő</div>
        <div className="flex flex-wrap gap-2">
          <FeatureToggle label="Szerződéses sáv" checked={features.showContractBars} onChange={() => toggleFeature("showContractBars")} />
          <FeatureToggle label="Aktuális sáv" checked={features.showActualBars} onChange={() => toggleFeature("showActualBars")} />
          <FeatureToggle label="Készültség" checked={features.showProgressOverlay} onChange={() => toggleFeature("showProgressOverlay")} />
          <FeatureToggle label="Mai nap vonal" checked={features.showTodayLine} onChange={() => toggleFeature("showTodayLine")} />
          <FeatureToggle label="Összesítő sáv" checked={features.showCollapsedSummaryBars} onChange={() => toggleFeature("showCollapsedSummaryBars")} />
          <FeatureToggle label="Jelmagyarázat" checked={features.showLegend} onChange={() => toggleFeature("showLegend")} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button onClick={() => { setSelectedTask(null); setIsCreateModalOpen(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Plus size={14} />Új feladat</button>
          <button onClick={() => setIsBoundaryModalOpen(true)} className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"><SplitSquareVertical size={14} />Szakaszhatároló</button>
          <button onClick={() => handlePlaceholderAction("Kezdőlapra rögzítés előkészítve")} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Pin size={14} />Kezdőlapra rögzítés</button>
          <button onClick={() => handlePlaceholderAction("Készültség a feladat szerkesztésében módosítható")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Percent size={14} />Készültség</button>
          <button onClick={() => handlePlaceholderAction("Időjárás overlay előkészítve")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CloudSun size={14} />Időjárás</button>
          <button onClick={() => handlePlaceholderAction("Mérföldkő később külön layerbe kerül")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Diamond size={14} />Mérföldkő</button>
          <button onClick={() => handlePlaceholderAction("Egyéb műveletek előkészítve")} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><MoreHorizontal size={14} />Egyéb</button>
        </div>
      </div>

      <div className="no-print mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftTimeline("prev")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">←</button>
            <button onClick={() => shiftTimeline("next")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">→</button>
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
              ].map((view) => <button key={view.value} onClick={() => handleViewChange(view.value)} className={`rounded-md px-3 py-1.5 ${viewMode === view.value ? "bg-blue-600 text-white shadow-sm" : "hover:bg-white"}`}>{view.label}</button>)}
            </div>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="relative rounded-xl border border-slate-200 bg-white shadow-sm">
          {features.showLegend && (
            <div className="border-b border-slate-100 px-4 py-3 text-xs">
              <div className="mb-2 flex flex-wrap items-center gap-4">
                <span className="font-semibold text-slate-800">Munkanemek</span>
                {Array.from(new Set(allTasks.map((task) => task.category))).map((category) => <span key={category} className="flex items-center gap-1.5 text-slate-600"><span className={`h-2.5 w-2.5 rounded ${getCategoryColor(schedule, category)}`} />{category}</span>)}
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-2">
                <span className="font-semibold text-slate-800">Jelölések</span>
                <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-slate-200" />Szerződéses ütem</span>
                <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-blue-600" />Aktuális ütem</span>
                <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-8 rounded bg-green-500/40" />Készültség</span>
                <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-[2px] rounded bg-blue-500" />MA vonal</span>
                <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-[2px] rounded bg-red-600" />Szakaszhatároló</span>
              </div>
            </div>
          )}

          <div className="max-h-[calc(100vh-190px)] overflow-auto" onScroll={(event) => { const target = event.currentTarget; setScrollTop(target.scrollTop); setScrollLeft(target.scrollLeft); setViewportWidth(target.clientWidth); setViewportHeight(target.clientHeight); }}>
            <div className="w-max min-w-full pb-10" style={{ minWidth: `${minTableWidth}px` }}>
              <TimelineHeader weekWidth={weekWidth} leftColWidth={LEFT_COL_WIDTH} typeColWidth={TYPE_COL_WIDTH} timelineStartDate={timelineStartDate} timelineEndDate={timelineEndDate} viewMode={viewMode} zoomControls={zoomControls} />

              <div className="relative">
                <DependencyLayer tasks={visibleTasks} weekWidth={weekWidth} offsetLeft={LEFT_COL_WIDTH + TYPE_COL_WIDTH} visibleLeft={scrollLeft} visibleRight={scrollLeft + viewportWidth} timelineStartDate={timelineStartDate} />

                <div className="pointer-events-none absolute bottom-0 top-0 z-0" style={{ left: `${LEFT_COL_WIDTH + TYPE_COL_WIDTH}px`, width: `${timelineWidth}px` }}>
                  <GridLines dayWidth={dayWidth} timelineStartDate={timelineStartDate} timelineEndDate={timelineEndDate} />
                </div>

                {features.showTodayLine && todayVisible && (
                  <div className="pointer-events-none absolute bottom-0 z-30" style={{ top: "-80px", left: `${todayLeftPx}px` }}>
                    <div className="absolute bottom-0 top-0 w-[10px] -translate-x-1/2 bg-blue-400/10 blur-md" />
                    <div className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2 bg-blue-500" />
                    <div className="absolute -top-7 -translate-x-1/2 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg">MA</div>
                  </div>
                )}

                {boundaries.map((boundary) => {
                  if (boundary.date < timelineStartIso || boundary.date > timelineEndIso) return null;
                  const left = LEFT_COL_WIDTH + TYPE_COL_WIDTH + getXFromDate(boundary.date, timelineStartIso) * (dayWidth / 28);
                  return (
                    <div key={boundary.id} className="pointer-events-none absolute bottom-0 z-30" style={{ top: "-80px", left: `${left}px` }}>
                      <div className="absolute bottom-0 top-0 w-[3px] -translate-x-1/2" style={{ backgroundColor: boundary.color }} />
                      <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold text-white shadow-lg" style={{ backgroundColor: boundary.color }}>{boundary.title}</div>
                    </div>
                  );
                })}

                <VirtualScheduleRenderer rows={visibleViewportRows} totalHeight={totalVirtualHeight} features={features} weekWidth={weekWidth} timelineStartDate={timelineStartDate} stickyFirstCol={stickyFirstCol} stickySecondCol={stickySecondCol} leftColWidth={LEFT_COL_WIDTH} typeColWidth={TYPE_COL_WIDTH} collapsedRows={collapsedRows} onToggle={toggleRow} onTaskClick={handleSelectTask} onResizeMouseDown={handleResizeStart} />
              </div>
            </div>
          </div>
        </div>
      </DndContext>

      <CreateTaskModal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setSelectedTask(null); }} onCreate={handleCreateTask} onDelete={handleDeleteTask} selectedTask={selectedTask} timelineStartDate={timelineStartIso} />
      <NewScheduleModal isOpen={isNewScheduleOpen} onClose={() => setIsNewScheduleOpen(false)} onCreate={handleCreateNewSchedule} />
      <BoundaryModal isOpen={isBoundaryModalOpen} onClose={() => setIsBoundaryModalOpen(false)} boundaries={boundaries} onSave={(next) => { setBoundaries(next); setStatusMessage("Szakaszhatárolók frissítve"); }} />
      <PrintSettingsModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} onPrint={handlePrint} />
    </AppLayout>
  );
}
