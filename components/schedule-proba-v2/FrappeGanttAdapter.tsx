"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, PackageCheck, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { probaV2Tasks } from "@/app/lib/schedule-proba-v2/sampleData";
import { ProbaV2Task } from "@/app/lib/schedule-proba-v2/types";
import { formatCurrency, summarizeTasks, updateTaskProgress } from "@/app/lib/schedule-proba-v2/ganttEngine";
import { mapProbaTasksToFrappe } from "@/app/lib/schedule-proba-v2/frappeMapper";
import "@/app/styles/frappe-gantt.css";

type FrappeGanttInstance = {
  change_view_mode?: (mode: string) => void;
  refresh?: (tasks: unknown[]) => void;
};

type FrappeGanttConstructor = new (
  element: HTMLElement,
  tasks: unknown[],
  options?: Record<string, unknown>,
) => FrappeGanttInstance;

const viewModes = ["Day", "Week", "Month"];

export default function FrappeGanttAdapter() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<FrappeGanttInstance | null>(null);
  const [tasks, setTasks] = useState<ProbaV2Task[]>(probaV2Tasks);
  const [viewMode, setViewMode] = useState("Week");
  const [selectedTaskId, setSelectedTaskId] = useState(probaV2Tasks[0]?.id || "");
  const [eventLog, setEventLog] = useState<string[]>([]);

  const frappeTasks = useMemo(() => mapProbaTasksToFrappe(tasks), [tasks]);
  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0];

  useEffect(() => {
    let mounted = true;

    async function bootGantt() {
      if (!containerRef.current) return;

      const frappeGanttModule = await import("frappe-gantt");
      const Gantt = frappeGanttModule.default as unknown as FrappeGanttConstructor;

      if (!mounted || !containerRef.current) return;

      containerRef.current.innerHTML = "";
      ganttRef.current = new Gantt(containerRef.current, frappeTasks, {
        view_mode: viewMode,
        date_format: "YYYY-MM-DD",
        language: "hu",
        readonly: false,
        on_click: (task: { id?: string; name?: string }) => {
          if (task.id) setSelectedTaskId(task.id);
          setEventLog((current) => [`Kijelölve: ${task.name || task.id}`, ...current].slice(0, 5));
        },
        on_date_change: (task: { id: string; start: Date; end: Date }) => {
          const start = task.start.toISOString().slice(0, 10);
          const end = task.end.toISOString().slice(0, 10);
          setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, start, end } : item)));
          setEventLog((current) => [`Dátum módosítva: ${task.id} · ${start} - ${end}`, ...current].slice(0, 5));
        },
        on_progress_change: (task: { id: string; progress: number }) => {
          setTasks((current) => updateTaskProgress(current, task.id, task.progress));
          setEventLog((current) => [`Készültség módosítva: ${task.id} · ${Math.round(task.progress)}%`, ...current].slice(0, 5));
        },
      });
    }

    bootGantt();

    return () => {
      mounted = false;
    };
  }, [frappeTasks, viewMode]);

  function handleReset() {
    setTasks(probaV2Tasks);
    setSelectedTaskId(probaV2Tasks[0]?.id || "");
    setEventLog(["Próbaadatok visszaállítva"]);
  }

  function handleSaveDraft() {
    window.localStorage.setItem("dimprover_proba_v2_frappe_tasks", JSON.stringify(tasks));
    setEventLog((current) => ["Helyi próba mentés elkészült localStorage-be", ...current].slice(0, 5));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.25),transparent_32%),linear-gradient(135deg,#120305,#0f172a_55%,#020617)] px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/utemezes/proba-v2" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/12">
            <ArrowLeft className="h-4 w-4" />
            Vissza a Próba V2 saját nézethez
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-100">
                <PackageCheck className="h-4 w-4" />
                Próba V2 · Frappe Gantt integráció
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                Open-source Gantt könyvtár adapterrel bekötve
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                A DIMPROVER saját adatmodellje megmarad, a Frappe Gantt csak renderelő és interaktív Gantt rétegként működik.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Feladat" value={summary.taskCount.toString()} />
                <Stat label="Átlag" value={`${summary.averageProgress}%`} />
                <Stat label="Költség" value={formatCurrency(summary.totalCostPlan)} />
                <Stat label="Nézet" value={viewMode} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">Frappe Gantt próba</h2>
            <p className="mt-1 text-sm text-slate-400">Sáv húzás, dátum módosítás és készültség módosítás a könyvtár saját interakcióival.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={mode === viewMode ? "rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white" : "rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-red-400"}
              >
                {mode}
              </button>
            ))}
            <button type="button" onClick={handleSaveDraft} className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-red-400">
              <Save className="h-4 w-4" />
              Próba mentés
            </button>
            <button type="button" onClick={handleReset} className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-red-400">
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="overflow-hidden rounded-[2rem] border border-slate-700 bg-white p-4 text-slate-950 shadow-2xl">
            <div ref={containerRef} className="min-h-[520px] overflow-auto rounded-2xl" />
          </div>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-red-200">
                <SlidersHorizontal className="h-4 w-4" />
                Kijelölt feladat
              </div>
              {selectedTask ? (
                <div>
                  <h3 className="text-xl font-semibold text-white">{selectedTask.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{selectedTask.id} · {selectedTask.owner}</p>
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                      <span>Készültség</span>
                      <span className="font-semibold text-red-200">{selectedTask.progress}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={selectedTask.progress}
                      onChange={(event) => setTasks((current) => updateTaskProgress(current, selectedTask.id, Number(event.target.value)))}
                      className="w-full accent-red-500"
                    />
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                    <CalendarDays className="h-4 w-4 text-red-200" />
                    {selectedTask.start} - {selectedTask.end}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-slate-800 bg-slate-900 p-5">
              <h3 className="font-semibold text-white">Eseménynapló</h3>
              <div className="mt-3 space-y-2">
                {eventLog.length ? eventLog.map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                    {item}
                  </div>
                )) : <p className="text-sm text-slate-500">Még nincs interakció.</p>}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
