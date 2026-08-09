"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Settings2, Trash2, X } from "lucide-react";

export type ScheduleTaskInput = {
  name: string;
  contractor: string;
  category: string;
  startWeek: number;
  duration: number;
  startDate?: string;
  endDate?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  color?: string;
  taskType?: string;
  workType?: string;
  progress?: number;
  predecessors?: number[];
};

type SelectedTask = ScheduleTaskInput & {
  id: number;
};

type DependencyTaskOption = {
  id: number;
  name: string;
  category: string;
};

type CreateTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (task: ScheduleTaskInput) => void;
  onDelete?: () => void;
  onStartCreateNew?: () => void;
  selectedTask?: SelectedTask | null;
  timelineStartDate?: string;
  dependencyOptions?: DependencyTaskOption[];
};

const colorOptions = [
  { name: "Kék", value: "bg-blue-600" },
  { name: "Zöld", value: "bg-emerald-600" },
  { name: "Narancs", value: "bg-orange-500" },
  { name: "Piros", value: "bg-red-600" },
  { name: "Lila", value: "bg-purple-600" },
  { name: "Szürke", value: "bg-slate-600" },
  { name: "Cián", value: "bg-cyan-600" },
  { name: "Borostyán", value: "bg-amber-500" },
  { name: "Pink", value: "bg-pink-600" },
  { name: "Indigó", value: "bg-indigo-600" },
  { name: "Lime", value: "bg-lime-600" },
  { name: "Türkiz", value: "bg-teal-600" },
];

const categoryOptions = [
  { name: "Előkészítés", color: "bg-slate-500" },
  { name: "Kivitelezés", color: "bg-blue-600" },
  { name: "Földmunka", color: "bg-amber-600" },
  { name: "Szerkezetépítés", color: "bg-orange-600" },
  { name: "Közmű", color: "bg-emerald-600" },
  { name: "Átadás", color: "bg-purple-600" },
];

const taskTypeOptions = ["Feladat", "Mérföldkő", "Ellenőrzési pont", "Adminisztratív feladat"];
const workTypeOptions = ["Előkészítés", "Földmunka", "Alapozás", "Szerkezetépítés", "Közmű", "Szakipar", "Átadás"];
const taskNameOptions = [
  "Felvonulás és ideiglenes közművek",
  "Munkaterület átadás-átvétel",
  "Organizációs terv véglegesítése",
  "Humuszleszedés és tereprendezés",
  "Alapkiemelés",
  "Sávalap és alaplemez betonozás",
  "Földszinti teherhordó falak",
  "Födémszerkezet készítése",
  "B épület alapozás",
  "B épület szerkezetépítés",
  "Csapadékvíz elvezetés",
  "Ideiglenes út és depónia rendezés",
  "Műszaki ellenőri bejárás",
  "I. ütem részátadás",
];
const contractorOptions = [
  "Beruházó / Műszaki ellenőr",
  "Generálkivitelező Kft.",
  "Beton-Projekt Kft.",
  "Földgép 2000 Kft.",
  "Falazó Bau Kft.",
  "Szerkezet Plusz Kft.",
  "Közmű Generál Kft.",
  "Útépítő Kft.",
  "Műszaki ellenőr",
  "Projektvezetés",
];
const weekOptions = Array.from({ length: 53 }, (_, index) => index + 1);

function addDaysToIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function getIsoWeek(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstThursdayDayNumber = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayNumber + 3);
  return {
    year: target.getFullYear(),
    week: 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000),
  };
}

function getDateOfIsoWeek(week: number, year: number) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const isoWeekStart = new Date(simple);
  if (dayOfWeek <= 4) isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return isoWeekStart.toISOString().split("T")[0];
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onCreate,
  onDelete,
  onStartCreateNew,
  selectedTask,
  timelineStartDate = "2026-05-01",
  dependencyOptions = [],
}: CreateTaskModalProps) {
  const [name, setName] = useState("");
  const [contractor, setContractor] = useState("");
  const [category, setCategory] = useState("Kivitelezés");
  const [color, setColor] = useState("");
  const [taskType, setTaskType] = useState("Feladat");
  const [workType, setWorkType] = useState("Kivitelezés");
  const [startDate, setStartDate] = useState(timelineStartDate);
  const [endDate, setEndDate] = useState(addDaysToIso(timelineStartDate, 6));
  const [contractStartDate, setContractStartDate] = useState(timelineStartDate);
  const [contractEndDate, setContractEndDate] = useState(addDaysToIso(timelineStartDate, 6));
  const [progress, setProgress] = useState(0);
  const [predecessors, setPredecessors] = useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editorHeightVh, setEditorHeightVh] = useState(48);

  const yearOptions = useMemo(() => {
    const baseYear = Number(startDate.slice(0, 4)) || new Date().getFullYear();
    return Array.from({ length: 9 }, (_, index) => baseYear - 3 + index);
  }, [startDate]);

  const startWeekState = useMemo(() => getIsoWeek(startDate), [startDate]);
  const endWeekState = useMemo(() => getIsoWeek(endDate), [endDate]);
  const contractStartWeekState = useMemo(() => getIsoWeek(contractStartDate), [contractStartDate]);
  const contractEndWeekState = useMemo(() => getIsoWeek(contractEndDate), [contractEndDate]);


  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = window.setTimeout(() => {
      if (selectedTask) {
        setName(selectedTask.name);
        setContractor(selectedTask.contractor);
        setCategory(selectedTask.category);
        setColor(selectedTask.color || "");
        setTaskType(selectedTask.taskType || "Feladat");
        setWorkType(selectedTask.workType || selectedTask.category || "Kivitelezés");
        setStartDate(selectedTask.startDate || timelineStartDate);
        setEndDate(selectedTask.endDate || addDaysToIso(timelineStartDate, 6));
        setContractStartDate(selectedTask.contractStartDate || selectedTask.startDate || timelineStartDate);
        setContractEndDate(selectedTask.contractEndDate || selectedTask.endDate || addDaysToIso(timelineStartDate, 6));
        setProgress(Math.max(0, Math.min(100, selectedTask.progress ?? 0)));
        setPredecessors(selectedTask.predecessors || []);
        setShowAdvanced(false);
      } else {
        setName("");
        setContractor("");
        setCategory("Kivitelezés");
        setColor("");
        setTaskType("Feladat");
        setWorkType("Kivitelezés");
        setStartDate(timelineStartDate);
        setEndDate(addDaysToIso(timelineStartDate, 6));
        setContractStartDate(timelineStartDate);
        setContractEndDate(addDaysToIso(timelineStartDate, 6));
        setProgress(0);
        setPredecessors([]);
        setShowAdvanced(false);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [selectedTask, isOpen, timelineStartDate]);

  if (!isOpen || typeof document === "undefined") return null;

  const calculatedDurationDays = Math.max(
    1,
    Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000) + 1
  );
  const calculatedDurationWeeks = Math.max(1, Math.ceil(calculatedDurationDays / 7));

  const setWeekDate = (type: "start" | "end", year: number, week: number) => {
    const nextDate = getDateOfIsoWeek(week, year);
    if (type === "start") {
      setStartDate(nextDate);
      if (new Date(`${nextDate}T00:00:00`) > new Date(`${endDate}T00:00:00`)) setEndDate(addDaysToIso(nextDate, 6));
    } else {
      setEndDate(nextDate);
      if (new Date(`${nextDate}T00:00:00`) < new Date(`${startDate}T00:00:00`)) setStartDate(addDaysToIso(nextDate, -6));
    }
  };

  const setContractWeekDate = (type: "start" | "end", year: number, week: number) => {
    const nextDate = getDateOfIsoWeek(week, year);
    if (type === "start") {
      setContractStartDate(nextDate);
      if (new Date(`${nextDate}T00:00:00`) > new Date(`${contractEndDate}T00:00:00`)) setContractEndDate(addDaysToIso(nextDate, 6));
    } else {
      setContractEndDate(nextDate);
      if (new Date(`${nextDate}T00:00:00`) < new Date(`${contractStartDate}T00:00:00`)) setContractStartDate(addDaysToIso(nextDate, -6));
    }
  };

  const togglePredecessor = (taskId: number) => {
    setPredecessors((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const normalizedPredecessors = Array.from(
      new Set(predecessors.filter((id) => Number.isFinite(id) && id !== selectedTask?.id))
    );

    onCreate({
      name: name.trim(),
      contractor: contractor.trim() || "Vállalkozó neve",
      category,
      color: color || undefined,
      taskType,
      workType,
      startWeek: 1,
      duration: calculatedDurationWeeks,
      startDate,
      endDate,
      contractStartDate,
      contractEndDate,
      progress: Math.max(0, Math.min(100, progress)),
      predecessors: normalizedPredecessors,
    });

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden bg-slate-950/5">
      <div className="absolute left-3 right-3 top-0 pointer-events-auto">
        <div className="flex max-h-[88vh] min-h-[28vh] w-full flex-col overflow-hidden rounded-b-xl border border-t-0 border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/5" style={{ height: `${editorHeightVh}vh` }}>
          <div className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-1.5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{selectedTask ? "Feladat szerkesztése" : "Új ütemterv feladat"}</h2>
              <p className="text-xs text-slate-500">Aktuális sáv, szerződéses háttérsáv, munkanem és készültség beállítása.</p>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setEditorHeightVh((v) => Math.max(28, v - 8))} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Alacsonyabb</button><button type="button" onClick={() => setEditorHeightVh((v) => Math.min(88, v + 8))} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Magasabb</button><button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
            </div>
          </div>

          <form id="schedule-task-editor-form" onSubmit={handleSubmit} className="grid min-h-0 flex-1 overflow-y-auto gap-3 bg-slate-50 px-4 py-3 text-xs lg:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr_0.85fr_1fr] 2xl:grid-cols-[1.2fr_0.85fr_0.85fr_1.1fr]">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Feladat neve</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="pl. Alapkiemelés" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
                <select value="" onChange={(e) => e.target.value && setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-500">
                  <option value="">Feladatnév választása adatbázisból...</option>
                  {taskNameOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Vállalkozó</label>
                <input value={contractor} onChange={(e) => setContractor(e.target.value)} placeholder="pl. Beton-Mix Kft." className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
                <select value="" onChange={(e) => e.target.value && setContractor(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-500">
                  <option value="">Vállalkozó választása adatbázisból...</option>
                  {contractorOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Típus</label>
                <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500">
                  {taskTypeOptions.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Munkanem</label>
                <select value={workType} onChange={(e) => setWorkType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500">
                  {workTypeOptions.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Kategória / jelmagyarázat</label>
              <div className="grid grid-cols-2 gap-2">
                {categoryOptions.map((item) => (
                  <button key={item.name} type="button" onClick={() => { setCategory(item.name); setWorkType(item.name); }} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition ${category === item.name ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <span className={`h-3 w-3 rounded-full ${item.color}`} />
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-white p-3">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Egyedi sáv színe</label>
              <button type="button" onClick={() => setColor("")} className={`mb-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${color === "" ? "border-slate-900 bg-slate-100 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Kategória színe használata</button>
              <div className="grid grid-cols-8 gap-2">
                {colorOptions.map((item) => (
                  <button key={item.value} type="button" title={item.name} onClick={() => setColor(item.value)} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${color === item.value ? "scale-110 border-slate-900" : "border-slate-200"}`}>
                    <span className={`h-6 w-6 rounded-full ${item.value}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <h3 className="mb-1.5 text-xs font-semibold text-slate-900">Aktuális ütemtervi sáv</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Kezdés</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Befejezés</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Kezdés hét szerint</label>
                    <div className="grid grid-cols-2 gap-1">
                      <select value={startWeekState.year} onChange={(e) => setWeekDate("start", Number(e.target.value), startWeekState.week)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select>
                      <select value={startWeekState.week} onChange={(e) => setWeekDate("start", startWeekState.year, Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{weekOptions.map((week) => <option key={week} value={week}>{week}.</option>)}</select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Befejezés hét szerint</label>
                    <div className="grid grid-cols-2 gap-1">
                      <select value={endWeekState.year} onChange={(e) => setWeekDate("end", Number(e.target.value), endWeekState.week)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select>
                      <select value={endWeekState.week} onChange={(e) => setWeekDate("end", endWeekState.year, Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{weekOptions.map((week) => <option key={week} value={week}>{week}.</option>)}</select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-1.5 text-xs font-semibold text-slate-900">Szerződéses háttérsáv</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Kezdés</label>
                    <input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Befejezés</label>
                    <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Kezdés hét szerint</label>
                    <div className="grid grid-cols-2 gap-1">
                      <select value={contractStartWeekState.year} onChange={(e) => setContractWeekDate("start", Number(e.target.value), contractStartWeekState.week)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select>
                      <select value={contractStartWeekState.week} onChange={(e) => setContractWeekDate("start", contractStartWeekState.year, Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{weekOptions.map((week) => <option key={week} value={week}>{week}.</option>)}</select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Befejezés hét szerint</label>
                    <div className="grid grid-cols-2 gap-1">
                      <select value={contractEndWeekState.year} onChange={(e) => setContractWeekDate("end", Number(e.target.value), contractEndWeekState.week)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select>
                      <select value={contractEndWeekState.week} onChange={(e) => setContractWeekDate("end", contractEndWeekState.year, Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500">{weekOptions.map((week) => <option key={week} value={week}>{week}.</option>)}</select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Időtartam</label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{calculatedDurationDays} nap / {calculatedDurationWeeks} hét</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Készültség %</label>
                <input type="number" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-white p-4">
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800">Függőségi kapcsolatok</label>
                  <p className="mt-1 text-xs text-slate-500">Válaszd ki, mely feladatok után indulhat ez a munka.</p>
                </div>
                {predecessors.length > 0 && <button type="button" onClick={() => setPredecessors([])} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Kapcsolatok törlése</button>}
              </div>
              <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
                {dependencyOptions.length === 0 && (
                  <div className="px-2 py-2 text-xs text-slate-400">Nincs választható előzmény feladat.</div>
                )}
                {dependencyOptions.map((task) => {
                  const checked = predecessors.includes(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => togglePredecessor(task.id)}
                      className={`mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition last:mb-0 ${
                        checked ? "border-blue-300 bg-blue-50 text-blue-900" : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${checked ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent"}`}>OK</span>
                      <span className="min-w-0 flex-1 truncate">{task.category} — {task.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">Kattintással be/ki kapcsolható. Mentés után a nyíl akkor látszik, ha mindkét érintett feladat sora látható.</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <button type="button" onClick={() => setShowAdvanced((prev) => !prev)} className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Settings2 size={13} /> Beállítások</button>
              {showAdvanced && <p className="mt-2 text-xs leading-relaxed text-slate-500">A szerződéses háttérsáv külön mentődik, az aktuális sáv pedig drag/resize művelettel módosítható.</p>}
            </div>

          </form>
          <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-white px-4 py-2 shadow-[0_-10px_24px_rgba(15,23,42,0.12)]">
            <div>{selectedTask && onDelete && <button type="button" onClick={onDelete} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 size={13} /> Feladat törlése</button>}</div>
            <div className="flex gap-3">
              {selectedTask && onStartCreateNew && <button type="button" onClick={onStartCreateNew} className="inline-flex items-center gap-1 rounded-lg border border-blue-400/60 bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"><Plus size={13} /> Új feladat</button>}
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Mégse</button>
              <button type="submit" form="schedule-task-editor-form" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">{selectedTask ? "Módosítás mentése" : "Feladat létrehozása"}</button>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
