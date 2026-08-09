"use client"

import { minuteTypeCards } from "@/components/minutes/data/minuteTypes"

function typeCardClass(type: string) {
  if (type === "Tervezői / megrendelői egyeztetés")
    return "border-cyan-300 bg-cyan-100 hover:bg-cyan-200"

  if (type === "Beruházói jegyzőkönyv")
    return "border-violet-300 bg-violet-100 hover:bg-violet-200"

  if (type === "Kooperációs jegyzőkönyv")
    return "border-blue-300 bg-blue-100 hover:bg-blue-200"

  if (type === "Terepi állapotrögzítés")
    return "border-teal-500 border-dashed border-2 bg-teal-100 hover:bg-teal-200"

  if (type === "Terepi hibafelvétel")
    return "border-emerald-500 border-dashed border-2 bg-emerald-100 hover:bg-emerald-200"

  if (type === "Hibajegyzék")
    return "border-red-500 border-2 bg-red-100 hover:bg-red-200"

  if (type === "Egyéb feljegyzés")
    return "border-slate-300 bg-slate-200 hover:bg-slate-300"

  return "border-slate-200 bg-slate-50 hover:bg-slate-100"
}

function typeStripClass(type: string) {
  if (type === "Tervezői / megrendelői egyeztetés") return "bg-cyan-600"
  if (type === "Beruházói jegyzőkönyv") return "bg-violet-600"
  if (type === "Kooperációs jegyzőkönyv") return "bg-blue-600"
  if (type === "Terepi állapotrögzítés") return "bg-teal-600"
  if (type === "Terepi hibafelvétel") return "bg-emerald-600"
  if (type === "Hibajegyzék") return "bg-red-600"
  if (type === "Egyéb feljegyzés") return "bg-slate-600"

  return "bg-slate-500"
}

function typeActionLabel(type: string, customLabel?: string) {
  if (customLabel) return customLabel
  if (type === "Terepi hibafelvétel") return "Gyors terepi rögzítés"
  if (type === "Terepi állapotrögzítés") return "Állapot rögzítése"
  return "Sablon indítása"
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
    <section className="relative z-[120] border border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100 shadow-[0_22px_52px_rgba(15,23,42,0.16)]">
      <div className="border-b border-slate-300 bg-slate-100/95 px-4 py-3 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-md border border-slate-300 bg-white/85 px-4 py-1 text-center text-[11px] font-black uppercase leading-3 tracking-[0.14em] text-slate-700 shadow-sm">
              Választó
              <br />
              mód
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Új jegyzőkönyv létrehozása
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 sm:text-sm">
                A terepi hibafelvétel gyors rögzítés, a Hibajegyzék élő hibakövető modul.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center border border-slate-300 bg-white/90 text-lg leading-none text-slate-500 shadow-sm hover:bg-white hover:text-slate-900"
            aria-label="Jegyzőkönyv választó bezárása"
          >
            ×
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {minuteTypeCards.map((type) => (
            <button
              key={type.title}
              type="button"
              onClick={() => onSelect(type.title)}
              className={`relative z-0 min-h-[190px] border p-5 text-left transition hover:z-10 hover:-translate-y-0.5 hover:shadow-lg ${typeCardClass(
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

              <h3 className="text-lg font-black text-slate-950">
                {type.title}
              </h3>

              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                {type.description}
              </p>

              {type.moduleOnly && (
                <p className="mt-3 border border-red-200 bg-white/70 px-3 py-2 text-xs font-bold leading-5 text-red-800">
                  Élő hibakövető / jelentéskészítő felület, nem klasszikus jegyzőkönyv sablon.
                </p>
              )}

              <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4">
                <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                  {typeActionLabel(type.title, type.actionLabel)}
                </div>

                <div className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-slate-700 shadow-sm">
                  {type.moduleOnly ? "Megnyitás →" : "Indítás →"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
