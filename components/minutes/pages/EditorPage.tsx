"use client"

import { useState } from "react"

import EditorToolbar from "@/components/minutes/editor/EditorToolbar"

import KooperaciosTemplate from "@/components/minutes/templates/KooperaciosTemplate"
import HibajegyzekTemplate from "@/components/minutes/templates/HibajegyzekTemplate"
import EmlekeztetoTemplate from "@/components/minutes/templates/EmlekeztetoTemplate"

import DocumentsPanel from "@/components/minutes/sidebar/DocumentsPanel"
import PhotoAttachmentsPanel from "@/components/minutes/sidebar/PhotoAttachmentsPanel"
import PhotoEditModal from "@/components/minutes/sidebar/PhotoEditModal"

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
              Projektek / Metrodom Park / Jegyzőkönyvek / Helyszíni jegyzőkönyv
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
              <Field label="Sablon" value="FMV kooperáció" />
              <Field label="Dátum" value="2026.05.10." />
              <Field label="Projekt helyszíne" value="Metrodom Park – 3. épület" />
              <Field label="Jegyzőkönyv készítés helyszíne" value="Projekt iroda / tárgyaló" />
              <Field label="Projekt kapcsolat" value="Metrodom Park" />
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <EditorToolbar />

            <div className="overflow-x-auto bg-slate-100 p-4 sm:p-8 xl:p-10">
              <div className="mx-auto min-w-[760px] max-w-[900px] rounded-sm bg-white px-8 py-10 shadow-2xl sm:px-16 xl:px-20 xl:py-16">
                <div className="text-center text-3xl font-bold tracking-tight text-slate-900">
                  {selectedMinuteType.toUpperCase()}
                </div>

                <div className="mt-12 grid grid-cols-[180px_1fr] gap-y-4 text-sm">
                  <div className="font-semibold text-slate-700">Projekt neve:</div>
                  <div>Metrodom Park – 3. épület</div>

                  <div className="font-semibold text-slate-700">Projekt helyszíne:</div>
                  <div>Metrodom Park – 3. épület</div>

                  <div className="font-semibold text-slate-700">
                    Jegyzőkönyv készítés helyszíne:
                  </div>
                  <div>Projekt iroda / tárgyaló</div>

                  <div className="font-semibold text-slate-700">Dátum:</div>
                  <div>2026.05.10.</div>

                  <div className="font-semibold text-slate-700">Résztvevők:</div>
                  <div>Lásd résztvevő lista</div>
                </div>

                <div className="mt-12 space-y-9 text-[15px] leading-8 text-slate-800">
                  {selectedMinuteType === "Kooperációs jegyzőkönyv" && (
                    <KooperaciosTemplate />
                  )}

                  {selectedMinuteType === "Hibajegyzék" && (
                    <HibajegyzekTemplate />
                  )}

                  {selectedMinuteType === "Emlékeztető" && (
                    <EmlekeztetoTemplate />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-bold text-slate-900">
                Mellékletek
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Az adott jegyzőkönyvhöz csatolt fotók és dokumentumok.
              </p>
            </div>

            {selectedMinuteType !== "Emlékeztető" && (
              <PhotoAttachmentsPanel
                photos={photoAttachments}
                onEdit={(photo) => setSelectedPhoto(photo)}
              />
            )}

            {selectedMinuteType !== "Fotós melléklet" && (
              <DocumentsPanel />
            )}
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