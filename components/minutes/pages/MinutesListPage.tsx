"use client"

import { useMemo, useRef, useState } from "react"

import { projectMinuteGroups } from "@/components/minutes/data/minuteTypes"

import {
  statusClass,
  rowTypeClass,
  typeStripClass,
  groupHeaderClass,
} from "@/components/minutes/utils/minuteStyles"

import {
  recentMinutes,
  projectMinutes,
} from "@/components/minutes/data/minutes"

const FILTER_PAGE_SIZE = 30

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
}

type Props = {
  onOpenEditor: () => void
  onOpenTypeSelector: () => void
}

type OverviewSectionTone = "cyan" | "slate" | "rose"

function HeaderHexPattern() {
  const bands = [
    "left-[23%] -top-[170px] h-[340px] w-[340px] border-cyan-100/18",
    "left-[47%] -top-[205px] h-[410px] w-[410px] border-white/14",
    "right-[-60px] -top-[180px] h-[360px] w-[360px] border-cyan-200/16",
  ]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
      {bands.map((band) => (
        <div key={band} className={`absolute rotate-45 border ${band}`} />
      ))}
      <div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(115deg,transparent,rgba(103,232,249,0.11),transparent)]" />
    </div>
  )
}

function DiamondMark({ children = "D" }: { children?: React.ReactNode }) {
  return (
    <span className="relative inline-grid h-8 w-8 shrink-0 place-items-center">
      <span className="absolute inset-1 rotate-45 border border-cyan-100/55 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)]" />
      <span className="relative text-[10px] font-black uppercase tracking-tight text-slate-700">{children}</span>
    </span>
  )
}

function StatCard({ value, label, tone }: { value: number | string; label: string; tone: OverviewSectionTone }) {
  const toneClass = {
    cyan: "border-cyan-200 bg-cyan-50/80 text-cyan-900",
    slate: "border-slate-300 bg-white text-slate-950",
    rose: "border-rose-200 bg-rose-50/80 text-rose-900",
  }[tone]

  return (
    <div className={`flex items-center gap-3 border px-3 py-2 shadow-sm ${toneClass}`}>
      <DiamondMark />
      <div>
        <div className="text-2xl font-black leading-none">{value}</div>
        <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-75">{label}</div>
      </div>
    </div>
  )
}

function SectionShell({
  id,
  title,
  eyebrow,
  description,
  tone = "cyan",
  children,
}: {
  id?: string
  title: string
  eyebrow: string
  description?: string
  tone?: OverviewSectionTone
  children: React.ReactNode
}) {
  const toneClass = {
    cyan: "before:bg-cyan-500 text-cyan-800",
    slate: "before:bg-slate-500 text-slate-800",
    rose: "before:bg-rose-500 text-rose-800",
  }[tone]

  return (
    <section id={id} className={`relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:content-[''] ${toneClass}`}>
      <div className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center gap-2">
          <DiamondMark />
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{eyebrow}</div>
            <h2 className="mt-0.5 whitespace-nowrap text-base font-black tracking-tight">{title}</h2>
          </div>
        </div>
        {description ? <p className="max-w-4xl text-[11px] font-semibold leading-4 text-slate-600">{description}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function MinutesListPage({
  onOpenEditor,
  onOpenTypeSelector,
}: Props) {
  const [filterPage, setFilterPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [qrMessage, setQrMessage] = useState("")
  const qrFileInputRef = useRef<HTMLInputElement | null>(null)
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredMinutes = useMemo(() => {
    if (!normalizedSearchQuery) return projectMinutes

    return projectMinutes.filter((item) =>
      [item.id, item.title, item.type, item.creator, item.project ?? "Metrodom Park"]
        .join(" \u001f " )
        .toLowerCase()
        .includes(normalizedSearchQuery),
    )
  }, [normalizedSearchQuery])
  const totalFilterPages = Math.max(1, Math.ceil(filteredMinutes.length / FILTER_PAGE_SIZE))
  const visibleFilterMinutes = filteredMinutes.slice(
    (filterPage - 1) * FILTER_PAGE_SIZE,
    filterPage * FILTER_PAGE_SIZE,
  )
  const openMinutes = projectMinutes.filter((item) => item.status !== "Lezárva").length
  const closedMinutes = projectMinutes.filter((item) => item.status === "Lezárva").length

  async function handleQrFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) return

    const barcodeDetector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector

    if (!barcodeDetector) {
      setQrMessage("A böngésző nem támogatja a QR-kód képi beolvasását. Később kamera-alapú QR modul köthető rá.")
      return
    }

    try {
      const detector = new barcodeDetector({ formats: ["qr_code"] })
      const imageBitmap = await createImageBitmap(file)
      const codes = await detector.detect(imageBitmap)
      imageBitmap.close()

      const value = codes[0]?.rawValue?.trim()
      if (!value) {
        setQrMessage("Nem található QR-kód a kiválasztott képen.")
        return
      }

      setSearchQuery(value)
      setFilterPage(1)
      setQrMessage(`QR-kódból beolvasva: ${value}`)
    } catch {
      setQrMessage("A QR-kód beolvasása nem sikerült.")
    }
  }

  return (
    <div className="min-w-0 overflow-hidden bg-[#f3f7fa] pb-5 text-slate-800">
      <section className="border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)]">
        <div className="relative overflow-hidden border-b border-cyan-500 bg-gradient-to-r from-[#0f2f46] via-[#0e7490] to-[#0891b2] px-3 py-2.5 text-white shadow-[0_6px_16px_rgba(8,145,178,0.18)] sm:px-5">
          <HeaderHexPattern />
          <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col items-start gap-1 pl-4 sm:pl-8 xl:pl-10">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100">Jegyzőkönyvek</div>
              <h1 className="text-2xl font-black tracking-[0.015em] text-cyan-100 drop-shadow-[0_0_12px_rgba(103,232,249,0.28)] sm:text-[30px]">
                Áttekintés
              </h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-5 text-cyan-50/85">
                Jegyzőkönyvek, terepi rögzítések és hibakövetési anyagok gyors keresése, megnyitása és indítása.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:w-[560px]">
              <StatCard value={projectMinutes.length} label="Összes" tone="slate" />
              <StatCard value={openMinutes} label="Nyitott" tone="cyan" />
              <StatCard value={closedMinutes} label="Lezárt" tone="rose" />
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
          <div className="mx-auto grid max-w-[1500px] gap-2 md:grid-cols-4">
            <a href="#kereso" className="border border-cyan-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-cyan-800 hover:bg-cyan-50">◇ Kereső</a>
            <a href="#legutobbi" className="border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-slate-700 hover:bg-slate-50">◇ Legutóbbi</a>
            <a href="#lista" className="border border-cyan-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-cyan-800 hover:bg-cyan-50">◇ Jegyzőkönyvek</a>
            <button type="button" onClick={onOpenTypeSelector} className="border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-left text-[10px] font-black uppercase tracking-[0.11em] text-white hover:bg-cyan-800">+ Új jegyzőkönyv</button>
          </div>
        </div>

        <div
          className="mx-auto max-w-[1500px] space-y-3 p-3 sm:p-4"
          style={{
            backgroundColor: "#ffffff",
            backgroundImage:
              "linear-gradient(rgba(15,23,42,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.025) 1px, transparent 1px), linear-gradient(rgba(14,165,233,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.035) 1px, transparent 1px)",
            backgroundSize: "40px 40px, 40px 40px, 160px 160px, 160px 160px",
          }}
        >
          <SectionShell id="kereso" title="Jegyzőkönyv kereső" eyebrow="Search / filter" description="Gyorskeresés szövegből, QR-kódból vagy projektadatok alapján." tone="cyan">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onOpenTypeSelector} className="border border-cyan-700 bg-cyan-700 px-5 py-2 text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm hover:bg-cyan-800">
                    + Új jegyzőkönyv
                  </button>
                  <button className="border border-slate-300 bg-white px-5 py-2 text-sm font-black uppercase tracking-[0.08em] text-slate-700 shadow-sm hover:bg-slate-50">
                    Projekt nélküli feljegyzés
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {["Képviselt cég", "Év", "Projekt", "Jegyzőkönyv típus"].map((label) => (
                  <label key={label} className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
                    <select className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus:border-cyan-500">
                      <option>{label} választása</option>
                    </select>
                  </label>
                ))}
              </div>

              <div className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Projektszám</span>
                  <select className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus:border-cyan-500">
                    <option>Projektszám választása</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Jegyzőkönyv szám</span>
                  <select className="h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus:border-cyan-500">
                    <option>Jegyzőkönyv szám választása</option>
                  </select>
                </label>
                <button type="button" className="h-10 border border-cyan-700 bg-cyan-700 px-6 text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm hover:bg-cyan-800">
                  Szűrő
                </button>
              </div>

              <div className="grid items-center gap-3 border border-cyan-200 bg-cyan-50/60 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-cyan-800">Gyorskereső</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value)
                      setFilterPage(1)
                    }}
                    placeholder="Keresés jegyzőkönyv számra, címre, projektre vagy készítőre"
                    className="h-10 w-full border border-cyan-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none placeholder:text-slate-400 hover:bg-slate-50 focus:border-cyan-500"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:mt-5">
                  <button type="button" className="h-10 border border-cyan-700 bg-cyan-700 px-6 text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm hover:bg-cyan-800">
                    Keresés
                  </button>
                  <button
                    type="button"
                    onClick={() => qrFileInputRef.current?.click()}
                    className="h-10 border border-slate-700 bg-slate-800 px-6 text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm hover:bg-slate-900"
                  >
                    QR beolvasás
                  </button>
                </div>
                <input ref={qrFileInputRef} type="file" accept="image/*" onChange={handleQrFileChange} className="hidden" />
                {qrMessage && (
                  <div className="lg:col-span-2 border border-cyan-200 bg-white/80 px-3 py-2 text-xs font-semibold text-cyan-800">
                    {qrMessage}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-300 bg-white">
                <div className="grid min-w-[1060px] grid-cols-[10px_140px_160px_minmax(250px,1fr)_220px_150px_140px_130px] border-b border-slate-200 bg-slate-50 pr-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                  <div />
                  <div>Dátum</div>
                  <div>Jegyzőkönyv szám</div>
                  <div>Projekt / cím</div>
                  <div>Típus</div>
                  <div>Készítő</div>
                  <div>Státusz</div>
                  <div className="text-right">Művelet</div>
                </div>

                {visibleFilterMinutes.map((item, index) => (
                  <button
                    key={`filter-${item.id}-${index}`}
                    type="button"
                    onClick={onOpenEditor}
                    className={`grid w-full min-w-[1060px] grid-cols-[10px_140px_160px_minmax(250px,1fr)_220px_150px_140px_130px] items-center border-b border-slate-100 pr-4 py-2 text-left text-sm transition hover:bg-cyan-50 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/80"
                    }`}
                  >
                    <div className={`h-full min-h-10 ${typeStripClass(item.type)}`} />
                    <div className="truncate pl-4 text-slate-500">{item.date}</div>
                    <div className="truncate font-semibold text-slate-800">{item.id}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{item.project ?? "Metrodom Park"}</div>
                      <div className="truncate text-xs text-slate-500">{item.title}</div>
                    </div>
                    <div className="truncate text-slate-600">{item.type}</div>
                    <div className="truncate text-slate-500">{item.creator}</div>
                    <div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-right font-semibold text-cyan-700">Megnyitás</div>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="font-bold text-slate-800">{FILTER_PAGE_SIZE} db / oldal</span>
                  <span className="ml-2">Találatok: {filteredMinutes.length} db</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterPage((page) => Math.max(1, page - 1))}
                    disabled={filterPage === 1}
                    className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Előző
                  </button>
                  <span className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    {filterPage} / {totalFilterPages} oldal
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterPage((page) => Math.min(totalFilterPages, page + 1))}
                    disabled={filterPage === totalFilterPages}
                    className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Következő
                  </button>
                </div>
              </div>
            </div>
          </SectionShell>

          <SectionShell id="legutobbi" title="Legutóbbi jegyzőkönyvek" eyebrow="Recent minutes" description="A projekten belüli legfrissebb jegyzőkönyvek gyors megnyitása." tone="slate">
            <div className="overflow-x-auto border border-slate-300 bg-white">
              <div className="grid w-full min-w-[1130px] grid-cols-[10px_140px_minmax(420px,1fr)_260px_140px_140px] border-b border-slate-200 bg-slate-50 pr-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                <div />
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
                  className={`grid w-full min-w-[1130px] grid-cols-[10px_140px_minmax(420px,1fr)_260px_140px_140px] items-center border-b border-slate-100 pr-4 py-2 text-left text-sm transition hover:bg-cyan-50 ${rowTypeClass(item.type)}`}
                >
                  <div className={`h-full min-h-10 ${typeStripClass(item.type)}`} />
                  <div className="truncate pl-4 text-slate-600">{item.date}</div>
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
                  <div className="text-right font-semibold text-cyan-700">Megnyitás</div>
                </button>
              ))}
            </div>
          </SectionShell>

          <SectionShell id="lista" title="Jegyzőkönyv csoportok" eyebrow="Grouped archive" description="Típusonként csoportosított projektjegyzőkönyvek." tone="cyan">
            <div className="space-y-4">
              {projectMinuteGroups.map((type) => {
                const items = projectMinutes.filter((item) => item.type === type).slice(0, 10)

                return (
                  <div key={type} className="overflow-x-auto border border-slate-300 bg-white">
                    <div className={`flex w-full min-w-[980px] items-center justify-between border-b border-slate-200 px-4 py-2 ${groupHeaderClass(type)}`}>
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
                        className={`grid w-full min-w-[990px] grid-cols-[10px_130px_minmax(360px,1fr)_180px_140px_140px] items-center border-b border-slate-100 pr-4 py-1.5 text-left text-sm transition hover:bg-cyan-50 ${
                          index % 2 === 0 ? "bg-slate-50" : "bg-white"
                        }`}
                      >
                        <div className={`h-full min-h-9 ${typeStripClass(item.type)}`} />
                        <div className="truncate pl-4 text-slate-500">{item.date}</div>
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
                        <div className="text-right font-semibold text-cyan-700">Megnyitás</div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </SectionShell>
        </div>
      </section>
    </div>
  )
}