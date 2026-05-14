"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import Link from "next/link";
import {
  Building2,
  Search,
  Plus,
  ChevronRight,
} from "lucide-react";

const projects = [
  {
    id: 1,
    name: "Társasház homlokzati felújítás",
    location: "Debrecen",
    status: "Folyamatban",
    progress: 68,
  },
  {
    id: 2,
    name: "Ipari csarnok bővítés",
    location: "Püspökladány",
    status: "Ellenőrzés alatt",
    progress: 42,
  },
  {
    id: 3,
    name: "Lakóépület energetikai korszerűsítés",
    location: "Balmazújváros",
    status: "Előkészítés",
    progress: 21,
  },
];

export default function ProjectsPage() {
  return (
    <AppLayout>

      {/* HEADER */}

      <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

        <div>
          <p className="text-sm font-medium text-slate-500">
            DIMPRO Projektek
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Projektlista
          </h1>
        </div>

        <div className="flex flex-col gap-3 md:flex-row">

          <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <Search size={18} className="text-slate-400" />

            <input
              placeholder="Projekt keresése..."
              className="w-full bg-transparent text-sm outline-none md:w-72"
            />
          </div>

          <button className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
            <Plus size={16} />
            Új projekt
          </button>

        </div>

      </div>

      {/* PROJECT GRID */}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

        {projects.map((project) => (
          <div
            key={project.id}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md"
          >

            <div className="flex items-start justify-between gap-4">

              <div>

                <div className="mb-4 rounded-2xl bg-slate-100 p-4 w-fit">
                  <Building2
                    size={24}
                    className="text-slate-700"
                  />
                </div>

                <h2 className="text-xl font-semibold text-slate-950">
                  {project.name}
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  {project.location}
                </p>

              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {project.status}
              </span>

            </div>

            <div className="mt-6">

              <div className="mb-2 flex justify-between text-sm">

                <span className="text-slate-500">
                  Előrehaladás
                </span>

                <span className="font-medium text-slate-800">
                  {project.progress}%
                </span>

              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-100">

                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: `${project.progress}%`,
                  }}
                />

              </div>

            </div>

            <Link
              href={`/projektek/${project.id}`}
              className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >

              Projekt megnyitása

              <ChevronRight size={16} />

            </Link>

          </div>
        ))}

      </div>

    </AppLayout>
  );
}