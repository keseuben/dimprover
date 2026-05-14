"use client"

import { useState } from "react"
import {
  minuteTypeCards,
  projectMinuteGroups,
} from "@/components/minutes/data/minuteTypes"

import {
  statusClass,
  rowTypeClass,
  typeCardClass,
  typeStripClass,
  typeBorderClass,
  groupHeaderClass,
} from "@/components/minutes/utils/minuteStyles"

import {
  recentMinutes,
  projectMinutes,
} from "@/components/minutes/data/minutes"

type Props = {
  onOpenEditor: () => void
  onOpenTypeSelector: () => void
}

export default function MinutesListPage({
  onOpenEditor,
  onOpenTypeSelector,
}: Props) {
  const [selectedType, setSelectedType] = useState<string | null>(null)

  return (
    <div className="min-w-0 space-y-6 overflow-hidden text-slate-800">
      <div className="relative z-[9999] rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm text-slate-500">
              Projektek / Metrodom Park / Jegyzőkönyvek
            </div>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
              Jegyzőkönyvek
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Projekt alapú jegyzőkönyvek és projekt nélküli gyors feljegyzések kezelése.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              Projekt nélküli feljegyzés
            </button>

            <button
              id="new-minute-button"
              type="button"
              onClick={onOpenTypeSelector}
              className="relative z-[99999] rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + Új jegyzőkönyv
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Jegyzőkönyv típusok
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Kattintásra később az adott típushoz tartozó sávos lista nyílik meg alatta.
            </p>
          </div>

          <button
            onClick={() => setSelectedType(null)}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Összes típus megjelenítése
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {minuteTypeCards.map((type) => (
            <button
              key={type.title}
              onClick={() => setSelectedType(type.title)}
              className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                selectedType === type.title
                  ? "ring-2 ring-slate-800 " + typeCardClass(type.title)
                  : typeCardClass(type.title)
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div className={`h-2 w-16 rounded-full ${typeStripClass(type.title)}`} />
                <div className="text-2xl">{type.icon}</div>
              </div>

              <div className="text-base font-bold text-slate-900">{type.title}</div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{type.description}</p>

              <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">{type.count} db</div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Összes jegyzőkönyv
                  </div>
                </div>

                <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {type.open} nyitott
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">
          Projekten belüli legutóbbi jegyzőkönyvek
        </h2>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="grid w-full min-w-[1120px] grid-cols-[140px_minmax(420px,1fr)_260px_140px_140px] bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div>Dátum</div>
            <div>Cím</div>
            <div>Típus</div>
            <div>Státusz</div>
            <div className="text-right">Művelet</div>
          </div>

          {recentMinutes.map((item) => (
            <button
              key={item.id}
              onClick={onOpenEditor}
              className={`grid w-full min-w-[1120px] grid-cols-[140px_minmax(420px,1fr)_260px_140px_140px] items-center border-l-8 px-4 py-2 text-left text-sm transition hover:brightness-95 ${rowTypeClass(item.type)} ${typeBorderClass(item.type)}`}
            >
              <div className="truncate text-slate-600">{item.date}</div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{item.title}</div>
                <div className="truncate text-xs text-slate-500">{item.id}</div>
              </div>
              <div className="truncate text-slate-700">{item.type}</div>
              <div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                  {item.status}
                </span>
              </div>
              <div className="text-right font-semibold text-blue-600">Megnyitás</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">
          Projekten belüli jegyzőkönyvek
        </h2>

        <div className="mt-4 space-y-5">
          {projectMinuteGroups.map((type) => {
            const items = projectMinutes.filter((item) => item.type === type).slice(0, 10)

            return (
              <div key={type} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <div className={`flex w-full min-w-[980px] items-center justify-between px-4 py-2 ${groupHeaderClass(type)}`}>
                  <div className="flex items-center gap-3">
                    <span className={`h-5 w-1.5 rounded-full ${typeStripClass(type)}`} />
                    <h3 className="text-sm font-bold text-slate-800">{type}</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {items.length} db / max. 10
                  </span>
                </div>

                {items.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={onOpenEditor}
                    className={`grid w-full min-w-[980px] grid-cols-[130px_minmax(360px,1fr)_180px_140px_140px] items-center px-4 py-1.5 text-left text-sm transition hover:bg-blue-50 ${
                      index % 2 === 0 ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <div className="truncate text-slate-500">{item.date}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{item.title}</div>
                      <div className="truncate text-xs text-slate-400">{item.id}</div>
                    </div>
                    <div className="truncate text-slate-600">{item.creator}</div>
                    <div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-right font-semibold text-blue-600">Megnyitás</div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}