"use client";

import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import DashboardHeaderBlock from "@/components/layout/DashboardHeaderBlock";
import ModulePanel from "@/components/layout/ModulePanel";

import {
  ClipboardList,
  FileText,
  CalendarDays,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

const templates = [
  {
    title: "Napi jelentés rögzítő",
    description:
      "Meteorológiai adatok, munkavégzés, műszak, létszám és bejegyzések napi rögzítése.",
    href: "/enaplo/napi-jelentes",
    icon: ClipboardList,
    status: "Elérhető",
  },
  {
    title: "Offline e-napló sablon kitöltő",
    description:
      "Későbbi funkció: offline napi jelentés sablonhoz előkészített adatkitöltés.",
    href: "#",
    icon: FileText,
    status: "Tervezett",
  },
  {
    title: "Heti / havi összesítő",
    description:
      "Későbbi funkció: napi jelentésekből heti vagy havi összesítő export készítése.",
    href: "#",
    icon: CalendarDays,
    status: "Tervezett",
  },
];

export default function ENaploDashboardPage() {
  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-100 px-8 pb-8 pt-6 text-slate-900">
        <div className="w-full">
          <DashboardHeaderBlock />

          <ModulePanel storageKey="enaplo:intro" title="DIMPROVER Építési napló" contentClassName="p-4" className="mt-0">
            <h1 className="text-xl font-black text-slate-950">Építési napló rögzítő</h1>
            <p className="mt-1 text-sm text-slate-500">Központi felület napi jelentések, építési napló segédrögzítések, offline sablonok és későbbi exportok kezeléséhez.</p>
            <div className="mt-4 max-w-3xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-900">
              <div className="flex gap-2">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p><strong>Fontos:</strong> Ez a modul nem helyettesíti a kötelező állami e-építési naplót. A felület segéd napi rögzítésre, előkészítésre, belső dokumentálásra és export készítésre szolgál.</p>
              </div>
            </div>
          </ModulePanel>

          <ModulePanel storageKey="enaplo:modules" title="Építési napló modulok" contentClassName="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((item) => {
              const Icon = item.icon;
              const disabled = item.href === "#";

              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`border border-blue-200/50 bg-white/75 p-5 shadow-[0_8px_18px_rgba(37,99,235,0.08)] transition ${
                    disabled
                      ? "pointer-events-none opacity-60"
                      : "hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(37,99,235,0.12)]"
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="bg-blue-50 p-3 text-blue-700">
                      <Icon size={22} />
                    </div>

                    <span
                      className={`px-3 py-1 text-xs font-bold ${
                        item.status === "Elérhető"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold">
                    {item.title}
                  </h2>

                  <p className="mt-2 min-h-16 text-sm text-slate-500">
                    {item.description}
                  </p>

                  <div className="mt-5 flex items-center justify-between text-sm font-bold text-blue-700">
                    <span>Megnyitás</span>
                    <ChevronRight size={18} />
                  </div>
                </Link>
              );
            })}
          </ModulePanel>
        </div>
      </main>
    </AppLayout>
  );
}