"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Archive, FileCheck2, FileInput, FileOutput, ScrollText } from "lucide-react";

const registryItems = [
  { title: "Bejövő projektiratok", Icon: FileInput },
  { title: "Kimenő projektiratok", Icon: FileOutput },
  { title: "Szerződések", Icon: ScrollText },
  { title: "Teljesítésigazolások", Icon: FileCheck2 },
  { title: "Határozatok / engedélyek", Icon: Archive },
];

export default function ProjectRegistryPage() {
  return (
    <AppLayout>
      <div className="mb-7">
        <p className="text-sm font-medium text-slate-500">DIMPROVER modul</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Projektiktató</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Projektiratok, szerződések, teljesítésigazolások, határozatok és engedélyek rendezett iktatási felülete.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {registryItems.map((item) => {
          const Icon = item.Icon;
          return (
            <section key={item.title} className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon size={22} />
              </div>
              <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Előkészített modulhely a későbbi iktatási funkciókhoz.</p>
            </section>
          );
        })}
      </div>
    </AppLayout>
  );
}
