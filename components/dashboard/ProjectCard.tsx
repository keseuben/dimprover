"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

type ProjectCardData = {
  name: string;
  location: string;
  status: string;
  progress: number;
};

type ProjectCardProps = {
  project: ProjectCardData;
};

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{project.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{project.location}</p>
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {project.status}
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-slate-500">Előrehaladás</span>
          <span className="font-medium text-slate-800">{project.progress}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-900" style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      <button className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Projekt megnyitása
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
