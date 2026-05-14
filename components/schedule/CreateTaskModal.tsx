"use client";

import React, { useEffect, useState } from "react";
import { Settings2, Trash2, X } from "lucide-react";

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
};

type SelectedTask = ScheduleTaskInput & {
  id: number;
};

type CreateTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (task: ScheduleTaskInput) => void;
  onDelete?: () => void;
  selectedTask?: SelectedTask | null;
  timelineStartDate?: string;
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

function addDaysToIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onCreate,
  onDelete,
  selectedTask,
  timelineStartDate = "2026-05-01",
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

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
      setProgress(selectedTask.progress ?? 0);
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
      setShowAdvanced(false);
    }
  }, [selectedTask, isOpen, timelineStartDate]);

  if (!isOpen) return null;

  const calculatedDurationDays = Math.max(
    1,
    Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000) + 1
  );
  const calculatedDurationWeeks = Math.max(1, Math.ceil(calculatedDurationDays / 7));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedTask ? "Feladat szerkesztése" : "Új ütemterv feladat"}
            </h2>
            <p className="text-sm text-slate-500">
              Aktuális sáv, szerződéses háttérsáv, munkanem és készültség beállítása.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5 pb-24">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Feladat neve</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="pl. Alapkiemelés"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Vállalkozó</label>
              <input
                value={contractor}
                onChange={(e) => setContractor(e.target.value)}
                placeholder="pl. Beton-Mix Kft."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Típus</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              >
                {taskTypeOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Munkanem</label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              >
                {workTypeOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Kategória / jelmagyarázat</label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {categoryOptions.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setCategory(item.name);
                    setWorkType(item.name);
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    category === item.name
                      ? "border-slate-900 bg-slate-50 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${item.color}`} />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Egyedi sáv színe</label>
            <button
              type="button"
              onClick={() => setColor("")}
              className={`mb-3 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                color === ""
                  ? "border-slate-900 bg-slate-100 text-slate-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Kategória színe használata
            </button>

            <div className="grid grid-cols-8 gap-3 md:grid-cols-12">
              {colorOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  title={item.name}
                  onClick={() => setColor(item.value)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                    color === item.value ? "scale-110 border-slate-900" : "border-slate-200"
                  }`}
                >
                  <span className={`h-6 w-6 rounded-full ${item.value}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Aktuális ütemtervi sáv</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Kezdés</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Befejezés</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Szerződéses háttérsáv</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Szerződéses kezdés</label>
                  <input
                    type="date"
                    value={contractStartDate}
                    onChange={(e) => setContractStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Szerződéses befejezés</label>
                  <input
                    type="date"
                    value={contractEndDate}
                    onChange={(e) => setContractEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Időtartam</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                {calculatedDurationDays} nap / {calculatedDurationWeeks} hét
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Készültség %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700"
            >
              <Settings2 size={15} />
              Beállítások
            </button>

            {showAdvanced && (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                A szerződéses háttérsáv külön mentődik, az aktuális sáv pedig drag/resize művelettel módosítható. Később a szerződésmodulból automatikusan generálható.
              </p>
            )}
          </div>

          <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
            <div>
              {selectedTask && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} />
                  Feladat törlése
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Mégse
              </button>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {selectedTask ? "Módosítás mentése" : "Feladat létrehozása"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
