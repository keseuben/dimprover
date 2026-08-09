"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Diamond,
  GitBranch,
  Layers3,
  Milestone,
  PackageCheck,
  Percent,
  RotateCcw,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { probaV2Tasks } from "@/app/lib/schedule-proba-v2/sampleData";
import { ProbaV2Task } from "@/app/lib/schedule-proba-v2/types";
import {
  buildTimelineItems,
  buildTimelineTicks,
  formatCurrency,
  formatHuDate,
  shiftTaskDays,
  summarizeTasks,
  updateTaskDates,
  updateTaskProgress,
} from "@/app/lib/schedule-proba-v2/ganttEngine";

const statusClass = {
  Tervezett: "border-sky-200 bg-sky-50 text-sky-700",
  Folyamatban: "border-amber-200 bg-amber-50 text-amber-700",
  Kész: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Késik: "border-red-200 bg-red-50 text-red-700",
};

export default function ProbaV2GanttPreview() {
  const [tasks, setTasks] = useState<ProbaV2Task[]>(probaV2Tasks);
  const timelineItems = useMemo(() => buildTimelineItems(tasks), [tasks]);
  const ticks = useMemo(() => buildTimelineTicks(tasks), [tasks]);
  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);

  function handleProgressChange(taskId: string, progress: number) {
    setTasks((current) => updateTaskProgress(current, taskId, progress));
  }

  function handleDateChange(taskId: string, field: "start" | "end", value: string) {
    setTasks((current) => {
      const target = current.find((task) => task.id === taskId);
      if (!target) return current;

      return updateTaskDates(
        current,
        taskId,
        field === "start" ? value : target.start,
        field === "end" ? value : target.end,
      );
    });
  }

  function handleShift(taskId: string, days: number) {
    setTasks((current) => shiftTaskDays(current, taskId, days));
  }

  function handleReset() {
    setTasks(probaV2Tasks);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.25),transparent_32%),linear-gradient(135deg,#120305,#0f172a_55%,#020617)] px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/utemezes" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/12">
            <ArrowLeft className="h-4 w-4" />
            Vissza az ütemtervhez
          </Link>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-100">
                <PackageCheck className="h-4 w-4" />
                Próba V2 · interaktív Gantt kísérlet
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                Húzható csúszka, dátumvezérlés, külön Gantt motor
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Ez már nem statikus kép: a készültség csúszkával állítható, a kezdés és befejezés dátuma szerkeszthető, a feladatok pedig napokkal mozgathatók.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={<CalendarDays className="h-5 w-5" />} label="Feladat" value={summary.taskCount.toString()} />
                <Stat icon={<Milestone className="h-5 w-5" />} label="Mérföldkő" value={summary.milestoneCount.toString()} />
                <Stat icon={<Percent className="h-5 w-5" />} label="Átlag készültség" value={`${summary.averageProgress}%`} />
                <Stat icon={<WalletCards className="h-5 w-5" />} label="Tervköltség" value={formatCurrency(summary.totalCostPlan)} />
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/12"
              >
                <RotateCcw className="h-4 w-4" />
                Próbaadatok visszaállítása
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">Interaktív Gantt előnézet</h2>
            <p className="mt-1 text-sm text-slate-400">A sávok a csúszkák és dátummezők módosítására azonnal újraszámolódnak.</p>
            <Link href="/utemezes/proba-v2/frappe" className="mt-3 inline-flex items-center rounded-full border border-red-300/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20">
              Open-source Frappe Gantt próba megnyitása
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            <Pill icon={<Layers3 className="h-4 w-4" />} text="Szegmentált" />
            <Pill icon={<GitBranch className="h-4 w-4" />} text="Függőségek" />
            <Pill icon={<SlidersHorizontal className="h-4 w-4" />} text="Csúszka" />
            <Pill icon={<BadgeCheck className="h-4 w-4" />} text="Próba modul" />
          </div>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="grid grid-cols-[430px_1fr] border-b border-slate-700 bg-slate-950/80 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
            <div className="border-r border-slate-700 px-5 py-4">Feladatlista és vezérlés</div>
            <div className="relative px-5 py-4">
              <div className="relative h-5">
                {ticks.map((tick) => (
                  <span key={tick.id} className="absolute -translate-x-1/2" style={{ left: `${tick.leftPercent}%` }}>
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            {timelineItems.map((task) => (
              <div key={task.id} className="grid min-h-28 grid-cols-[430px_1fr] border-b border-slate-800 last:border-b-0">
                <div className="border-r border-slate-800 bg-slate-950/35 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-white">
                        {task.milestone ? <Diamond className="h-4 w-4 text-red-300" /> : null}
                        {task.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{task.id} · {task.owner}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass[task.status]}`}>
                      {task.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs text-slate-400">
                      Kezdés
                      <input
                        type="date"
                        value={task.start}
                        onChange={(event) => handleDateChange(task.id, "start", event.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-red-400"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-slate-400">
                      Befejezés
                      <input
                        type="date"
                        value={task.end}
                        onChange={(event) => handleDateChange(task.id, "end", event.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-red-400"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" onClick={() => handleShift(task.id, -1)} className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-200 hover:border-red-400">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={task.progress}
                      onChange={(event) => handleProgressChange(task.id, Number(event.target.value))}
                      className="h-2 flex-1 cursor-pointer accent-red-500"
                      aria-label={`${task.name} készültség`}
                    />
                    <button type="button" onClick={() => handleShift(task.id, 1)} className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-200 hover:border-red-400">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <span className="w-12 text-right text-sm font-semibold text-red-200">{task.progress}%</span>
                  </div>

                  <div className="mt-3 text-xs text-slate-400">
                    {formatHuDate(task.start)} - {formatHuDate(task.end)}
                    {task.dependencies.length ? ` · függ: ${task.dependencies.join(", ")}` : ""}
                  </div>
                </div>

                <div className="relative bg-slate-900 px-5 py-5">
                  <div className="absolute inset-y-0 left-5 right-5 bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:12.5%_100%]" />
                  <div className="relative h-16">
                    <div
                      className={task.milestone ? "absolute top-1/2 h-7 w-7 -translate-y-1/2 rotate-45 rounded-md border border-red-200 bg-red-500 shadow-[0_0_28px_rgba(239,68,68,0.55)]" : "absolute top-1/2 h-9 -translate-y-1/2 rounded-full border border-red-200/40 bg-gradient-to-r from-red-800 to-red-500 shadow-[0_12px_34px_rgba(239,68,68,0.25)] transition-all"}
                      style={{ left: `${task.leftPercent}%`, width: task.milestone ? undefined : `${Math.max(task.widthPercent, 4)}%` }}
                    >
                      {!task.milestone ? (
                        <span className="absolute inset-y-0 left-0 rounded-full bg-white/25 transition-all" style={{ width: `${task.progress}%` }} />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Info title="Már van csúszka" text="A készültség százaléka range inputtal húzható, a Gantt sáv töltöttsége élőben frissül." />
          <Info title="Van dátumvezérlés" text="A kezdés és befejezés dátummezővel módosítható, a sáv helye és szélessége újraszámolódik." />
          <Info title="Van mozgatás" text="A bal/jobb nyilak egy nappal mozgatják a feladatot. Következő körben jöhet a közvetlen sáv-drag." />
        </div>
      </section>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 inline-flex rounded-2xl bg-red-500/15 p-2 text-red-200">{icon}</div>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2">
      {icon}
      {text}
    </span>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}
