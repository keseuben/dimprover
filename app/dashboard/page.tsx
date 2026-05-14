"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import StatCard from "@/components/dashboard/StatCard";
import ProjectCard from "@/components/dashboard/ProjectCard";
import {
  ClipboardList,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Bell,
} from "lucide-react";

const projects = [
  {
    name: "Társasház homlokzati felújítás",
    location: "Debrecen",
    status: "Folyamatban",
    progress: 68,
  },
  {
    name: "Ipari csarnok bővítés",
    location: "Püspökladány",
    status: "Ellenőrzés alatt",
    progress: 42,
  },
  {
    name: "Lakóépület energetikai korszerűsítés",
    location: "Balmazújváros",
    status: "Előkészítés",
    progress: 21,
  },
];

export default function Dashboard() {
  return (
    <AppLayout>
      <header className="mb-7 flex items-center justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-slate-500">
            DIMDOR Dashboard
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Projekt áttekintés
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <Search size={18} className="text-slate-400" />
            <input
              placeholder="Keresés..."
              className="w-64 bg-transparent text-sm outline-none"
            />
          </div>

          <button className="rounded-xl bg-slate-950 p-3 text-white shadow-sm hover:bg-slate-800">
            <Bell size={18} />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Aktív projektek" value="12" />
        <StatCard icon={ClipboardList} label="Jegyzőkönyvek" value="46" />
        <StatCard icon={CheckCircle2} label="Lezárt feladatok" value="128" />
        <StatCard icon={AlertTriangle} label="Nyitott eltérések" value="5" />
      </section>

      <section className="mt-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-950">
            Aktív projektek
          </h2>

          <button className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800">
            <Plus size={16} />
            Új projekt
          </button>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {projects.map((project) => (
            <ProjectCard key={project.name} project={project} />
          ))}
        </div>
      </section>

      <section className="mt-7 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Negyedéves ütemterv
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              JAN FEB MÁRC | ÁPR MÁJ JÚN | JÚL AUG SZEPT
            </p>
          </div>

          <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            PDF export
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[220px_repeat(16,1fr)] bg-slate-50 text-xs font-medium text-slate-500">
            <div className="border-r border-slate-200 p-3">Munkafázis</div>

            {[19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34].map(
              (week) => (
                <div
                  key={week}
                  className="border-r border-slate-200 p-3 text-center"
                >
                  {week}
                </div>
              )
            )}
          </div>

          {[
            { name: "Felvonulás", start: 1, width: 2 },
            { name: "Alapozás", start: 3, width: 3 },
            { name: "Falazás", start: 6, width: 4 },
          ].map((task) => (
            <div
              key={task.name}
              className="grid grid-cols-[220px_repeat(16,1fr)] border-t border-slate-200"
            >
              <div className="border-r border-slate-200 p-4 text-sm font-medium text-slate-700">
                {task.name}
              </div>

              <div className="relative col-span-16 h-16">
                <div
                  className="absolute top-3 h-10 rounded-xl bg-slate-900"
                  style={{
                    left: `${task.start * 6}%`,
                    width: `${task.width * 6}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}