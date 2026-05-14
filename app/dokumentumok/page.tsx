"use client";

import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  FileText,
  Upload,
  Search,
  Download,
  FolderOpen,
  CalendarDays,
  Building2,
  Eye,
  Trash2,
} from "lucide-react";

const documents = [
  {
    id: "DOC-001",
    name: "Műszaki ellenőri jegyzőkönyv.pdf",
    project: "Társasház homlokzati felújítás",
    type: "PDF",
    size: "2.4 MB",
    date: "2026.05.14",
  },
  {
    id: "DOC-002",
    name: "Kivitelezési terv.dwg",
    project: "Ipari csarnok bővítés",
    type: "DWG",
    size: "14.1 MB",
    date: "2026.05.12",
  },
  {
    id: "DOC-003",
    name: "Energetikai számítás.xlsx",
    project: "Energetikai korszerűsítés",
    type: "XLSX",
    size: "1.1 MB",
    date: "2026.05.10",
  },
];

export default function DokumentumokPage() {
  const [search, setSearch] = useState("");

  const filteredDocuments = documents.filter((document) =>
    document.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            DIMDOR Dokumentumtár
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Dokumentumok
          </h1>
        </div>

        <button className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
          <Upload size={18} />
          Dokumentum feltöltése
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Összes dokumentum</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {documents.length}
              </p>
            </div>

            <FolderOpen size={26} className="text-slate-400" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">PDF fájlok</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">1</p>
            </div>

            <FileText size={26} className="text-slate-400" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Feltöltött méret</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                17.6 MB
              </p>
            </div>

            <Upload size={26} className="text-slate-400" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Aktív projektek</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">3</p>
            </div>

            <Building2 size={26} className="text-slate-400" />
          </div>
        </div>
      </section>

      <section className="mt-7 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <label
            htmlFor="fileUpload"
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-slate-500 hover:bg-slate-100"
          >
            <Upload size={42} className="text-slate-400" />

            <p className="mt-4 text-lg font-medium text-slate-700">
              Húzd ide a dokumentumokat
            </p>

            <p className="mt-2 text-sm text-slate-500">
              vagy kattints a tallózáshoz
            </p>

            <p className="mt-4 text-xs text-slate-400">
              PDF, DOCX, XLSX, DWG, JPG, PNG
            </p>

            <input id="fileUpload" type="file" multiple className="hidden" />
          </label>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
          <Search size={18} className="text-slate-400" />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Keresés dokumentumra..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="space-y-4">
          {filteredDocuments.map((document) => (
            <div
              key={document.id}
              className="flex flex-col gap-4 rounded-2xl border border-slate-100 p-5 transition hover:bg-slate-50 xl:flex-row xl:items-center xl:justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-slate-100 p-4">
                  <FileText size={24} className="text-slate-500" />
                </div>

                <div>
                  <h2 className="font-semibold text-slate-900">
                    {document.name}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {document.project}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                    <span>{document.type}</span>
                    <span>{document.size}</span>

                    <span className="flex items-center gap-2">
                      <CalendarDays size={15} />
                      {document.date}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-slate-200 p-3 hover:bg-slate-100">
                  <Eye size={18} />
                </button>

                <button className="rounded-xl border border-slate-200 p-3 hover:bg-slate-100">
                  <Download size={18} />
                </button>

                <button className="rounded-xl border border-red-200 p-3 text-red-600 hover:bg-red-50">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}