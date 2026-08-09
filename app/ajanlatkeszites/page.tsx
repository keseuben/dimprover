"use client";

import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  ArrowRight,
  CheckCircle2,
  FileSignature,
  FileText,
  Layers3,
  Plus,
} from "lucide-react";

const offerSteps = [
  "Új ajánlat készítése",
  "Ajánlat sablonok",
  "Költségvetési tételek",
  "Anyag / díj bontás",
  "Ajánlat verziók",
  "Ajánlat export PDF-be",
  "Elfogadott ajánlat projektbe emelése",
];

const offerCards = [
  {
    title: "Ajánlati munkafolyamat",
    description:
      "Az ajánlatból később projekt, ütemterv, költségvetés és pénzügyi nyilvántartás indulhat.",
    Icon: FileSignature,
  },
  {
    title: "Tételes költségvetés",
    description:
      "Anyag- és díjbontásra előkészített struktúra a későbbi projektköltségekhez.",
    Icon: Layers3,
  },
  {
    title: "PDF export és projektbe emelés",
    description:
      "Elfogadás után az ajánlat projektindító adattá alakítható.",
    Icon: FileText,
  },
];

export default function OffersPage() {
  return (
    <AppLayout>
      <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">DIMPROVER modul</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Ajánlatkészítés
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Ajánlatok létrehozása, sablonozása, költségvetési tételezése, verziózása és elfogadás utáni projektbe emelése.
          </p>
        </div>

        <button className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} />
          Új ajánlat készítése
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {offerCards.map((card) => {
          const Icon = card.Icon;

          return (
            <section
              key={card.title}
              className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon size={22} />
              </div>
              <h2 className="text-lg font-semibold text-slate-950">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Ajánlatkészítési menüpontok</h2>
            <p className="mt-1 text-sm text-slate-500">A végleges modulstruktúra első navigációs alapja.</p>
          </div>
          <FileSignature className="text-sky-700" size={24} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {offerSteps.map((step, index) => (
            <div
              key={step}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-500 shadow-sm">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-slate-700">{step}</span>
              </div>
              <CheckCircle2 size={16} className="shrink-0 text-sky-600" />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/80 p-6">
        <h2 className="text-lg font-semibold text-slate-950">Kapcsolódási logika</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
          <span>Ajánlat</span>
          <ArrowRight size={16} className="text-sky-700" />
          <span>Projekt</span>
          <ArrowRight size={16} className="text-sky-700" />
          <span>Ütemterv</span>
          <ArrowRight size={16} className="text-sky-700" />
          <span>Költségvetés</span>
          <ArrowRight size={16} className="text-sky-700" />
          <span>Pénzügyi nyilvántartás</span>
        </div>
      </section>
    </AppLayout>
  );
}
