"use client"

import { useState } from "react"

import DimproRichTextEditor from "@/components/minutes/editor/DimproRichTextEditor"

import DocumentsPanel from "@/components/minutes/sidebar/DocumentsPanel"
import PhotoAttachmentsPanel from "@/components/minutes/sidebar/PhotoAttachmentsPanel"
import PhotoEditModal from "@/components/minutes/sidebar/PhotoEditModal"
import RecentMinutesPanel from "@/components/minutes/sidebar/RecentMinutesPanel"

import {
  photoAttachments,
  type PhotoAttachment,
} from "@/components/minutes/data/photoAttachments"

type Props = {
  onBack: () => void
  selectedMinuteType: string
}

function Field({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800">
        {value}
      </div>
    </div>
  )
}

export default function EditorPage({
  onBack,
  selectedMinuteType,
}: Props) {
  const [selectedPhoto, setSelectedPhoto] =
    useState<PhotoAttachment | null>(null)

  return (
    <div className="min-w-0 space-y-6 overflow-hidden text-slate-800">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <button
              onClick={onBack}
              className="mb-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Vissza a jegyzőkönyv listához
            </button>

            <div className="text-sm text-slate-500">
              Projektek / Metrodom Park / Jegyzőkönyvek / {selectedMinuteType}
            </div>

            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
              {selectedMinuteType} szerkesztése
            </h1>

            <p className="mt-2 text-sm text-emerald-600">
              Automatikus mentés aktív · Vázlat
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-slate-50">
              Mentés
            </button>

            <button className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-slate-50">
              PDF előnézet / export
            </button>

            <button className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-slate-50">
              Email küldés
            </button>

            <button className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
              Véglegesítés
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Típus" value={selectedMinuteType} />
              <Field label="Sablon" value={selectedMinuteType} />
              <Field label="Dátum" value="2026.05.10." />
              <Field label="Projekt helyszíne" value="Metrodom Park – 3. épület" />
              <Field label="Jegyzőkönyv készítés helyszíne" value="Projekt iroda / tárgyaló" />
              <Field label="Projekt kapcsolat" value="Metrodom Park" />
            </div>
          </div>

          <DimproRichTextEditor selectedMinuteType={selectedMinuteType} />
        </section>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
          <RecentMinutesPanel />

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-bold text-slate-900">
                Mellékletek
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Az adott jegyzőkönyvhöz csatolt fotók és dokumentumok.
              </p>
            </div>

            <PhotoAttachmentsPanel
              photos={photoAttachments}
              onEdit={(photo) => setSelectedPhoto(photo)}
            />

            <DocumentsPanel />
          </div>
        </aside>
      </div>

      {selectedPhoto && (
        <PhotoEditModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  )
}
