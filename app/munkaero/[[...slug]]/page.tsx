"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  CalendarCheck2,
  Clock3,
  FileCheck2,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

const workforceItems = [
  { label: "Dolgozók", description: "Munkavállalói és alvállalkozói személyi törzsadatok.", Icon: Users },
  { label: "Munkaszerződések", description: "Szerződések, kezdési adatok és kapcsolódó dokumentumok.", Icon: FileCheck2 },
  { label: "Jelenléti ív", description: "Napi jelenlét és munkahelyi részvétel rögzítése.", Icon: UserCheck },
  { label: "Munkaidő nyilvántartás", description: "Ledolgozott idő, beosztás és műszakadatok követése.", Icon: Clock3 },
  { label: "Szabadságok", description: "Szabadságkeretek, igénylések és jóváhagyások.", Icon: CalendarCheck2 },
  { label: "Távollétek", description: "Betegség, igazolt és egyéb távollétek kezelése.", Icon: CalendarCheck2 },
  { label: "Munkabér adatok", description: "Bérhez és elszámoláshoz szükséges előkészítő adatok.", Icon: FileCheck2 },
  { label: "Jogosultságok", description: "Munkaerő modulhoz kapcsolódó hozzáférési szintek.", Icon: ShieldCheck },
  { label: "Munkaidő keretek", description: "Keretes munkaidő és időszaki elszámolási alapok.", Icon: Clock3 },
];

export default function WorkforcePage() {
  return (
    <AppLayout>
      <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">DIMPROVER modul</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Munkaerő</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Munkaerő nyilvántartás, jelenlét, munkaidő, szabadság, távollét és kapcsolódó jogosultsági adatok előkészítő modulja.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Munkaerő menüpontok</h2>
            <p className="mt-1 text-sm text-slate-500">A bal oldali menüben megjelenő új modul első struktúrája.</p>
          </div>
          <Users className="text-teal-700" size={24} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workforceItems.map((item, index) => {
            const Icon = item.Icon;

            return (
              <div
                key={item.label}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-500 shadow-sm">
                    {index + 1}
                  </span>
                  <Icon size={17} className="text-teal-700" />
                  <h3 className="text-sm font-semibold text-slate-800">{item.label}</h3>
                </div>
                <p className="text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>
    </AppLayout>
  );
}
