"use client"

import { minuteTypeCards } from "@/components/minutes/data/minuteTypes"

function typeCardClass(type: string) {
  if (type === "Beruházói jegyzőkönyv")
    return "border-violet-300 bg-violet-100 hover:bg-violet-200"

  if (type === "Kooperációs jegyzőkönyv")
    return "border-blue-300 bg-blue-100 hover:bg-blue-200"

  if (type === "Tervezői jegyzőkönyv")
    return "border-cyan-300 bg-cyan-100 hover:bg-cyan-200"

  if (type === "Helyszíni jegyzőkönyv")
    return "border-orange-300 bg-orange-100 hover:bg-orange-200"

  if (type === "Egyéb feljegyzések")
    return "border-slate-300 bg-slate-200 hover:bg-slate-300"

  if (type === "Hibajegyzék")
    return "border-red-300 bg-red-100 hover:bg-red-200"

  if (type === "Emlékeztető")
    return "border-yellow-300 bg-yellow-100 hover:bg-yellow-200"

  if (type === "Fotós melléklet")
    return "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"

  return "border-slate-200 bg-slate-50 hover:bg-slate-100"
}

function typeStripClass(type: string) {
  if (type === "Beruházói jegyzőkönyv") return "bg-violet-600"
  if (type === "Kooperációs jegyzőkönyv") return "bg-blue-600"
  if (type === "Tervezői jegyzőkönyv") return "bg-cyan-600"
  if (type === "Helyszíni jegyzőkönyv") return "bg-orange-600"
  if (type === "Egyéb feljegyzések") return "bg-slate-600"
  if (type === "Hibajegyzék") return "bg-red-600"
  if (type === "Emlékeztető") return "bg-yellow-600"
  if (type === "Fotós melléklet") return "bg-emerald-600"

  return "bg-slate-500"
}

type Props = {
  onClose: () => void
  onSelect: (type: string) => void
}

export default function MinuteTypeSelectorModal({
  onClose,
  onSelect,
}: Props) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-6">
      <div className="w-full max-w-6xl rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">
              Új jegyzőkönyv létrehozása
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Válaszd ki, milyen típusú jegyzőkönyvet szeretnél indítani.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Bezárás
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {minuteTypeCards.map((type) => (
            <button
              key={type.title}
              onClick={() => onSelect(type.title)}
              className={`relative z-0 rounded-2xl border p-5 text-left transition hover:z-10 hover:-translate-y-1 hover:shadow-lg ${typeCardClass(
                type.title
              )}`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`h-2 w-20 rounded-full ${typeStripClass(
                    type.title
                  )}`}
                />

                <div className="text-3xl">{type.icon}</div>
              </div>

              <h3 className="text-lg font-bold text-slate-900">
                {type.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {type.description}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sablon indítása
                </div>

                <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  Megnyitás →
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}