"use client"

import { minuteTypeCards, type MinuteTypeCard } from "@/components/minutes/data/minuteTypes"

type NewMinutePageProps = {
  onBack: () => void
  onSelect: (type: string) => void
}

type MinuteGroup = {
  id: string
  title: string
  eyebrow: string
  description: string
  accent: string
  softAccent: string
  titleClass: string
  navClass: string
  headerLabel: string
  counterLabel: string
  items: MinuteTypeCard[]
}

const officeTypes = new Set([
  "Tervezői / megrendelői egyeztetés",
  "Beruházói jegyzőkönyv",
  "Kooperációs jegyzőkönyv",
])

const fieldTypes = new Set([
  "Terepi állapotrögzítés",
  "Terepi hibafelvétel",
])

function getCardAccent(card: MinuteTypeCard) {
  if (officeTypes.has(card.title)) return "bg-cyan-500"
  if (fieldTypes.has(card.title)) return "bg-emerald-500"
  if (card.title === "Hibajegyzék") return "bg-rose-500"
  return "bg-slate-500"
}

function getCardBackground(card: MinuteTypeCard) {
  if (officeTypes.has(card.title)) return "bg-cyan-50/55 hover:bg-cyan-50"
  if (fieldTypes.has(card.title)) return "bg-emerald-50/55 hover:bg-emerald-50"
  if (card.title === "Hibajegyzék") return "bg-rose-50/55 hover:bg-rose-50"
  return "bg-slate-50/70 hover:bg-slate-100/70"
}

function getCardHover(card: MinuteTypeCard) {
  if (officeTypes.has(card.title)) return "hover:border-cyan-500 hover:shadow-[0_10px_24px_rgba(6,182,212,0.11)]"
  if (fieldTypes.has(card.title)) return "hover:border-emerald-500 hover:shadow-[0_10px_24px_rgba(16,185,129,0.11)]"
  if (card.title === "Hibajegyzék") return "hover:border-rose-500 hover:shadow-[0_10px_24px_rgba(244,63,94,0.10)]"
  return "hover:border-slate-500 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
}

function getActionLabel(card: MinuteTypeCard) {
  if (card.actionLabel) return card.actionLabel
  if (card.title === "Terepi hibafelvétel") return "Gyors rögzítés"
  if (card.title === "Terepi állapotrögzítés") return "Állapot rögzítése"
  return "Indítás"
}

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

function DiamondMark({ children = "D", className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-grid h-8 w-8 shrink-0 place-items-center ${className}`}>
      <span className="absolute inset-1 rotate-45 border border-slate-300 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)]" />
      <span className="relative text-[10px] font-black uppercase tracking-tight text-slate-700">{children}</span>
    </span>
  )
}

function MinuteCard({ card, onSelect }: { card: MinuteTypeCard; onSelect: (type: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(card.title)}
      className={`group relative grid min-h-[100px] grid-rows-[auto_1fr_auto] overflow-hidden border border-slate-300 p-3 text-left shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition ${getCardBackground(card)} ${getCardHover(card)}`}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 h-14 w-14 rotate-45 border border-slate-200 bg-slate-50/90" />
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className={`h-1 w-16 rounded-full ${getCardAccent(card)}`} />
        <div className="relative z-10 grid h-7 w-7 place-items-center border border-slate-200 bg-white text-sm shadow-sm rotate-45">
          <span className="-rotate-45">{card.icon}</span>
        </div>
      </div>

      <div>
        <div className="flex items-start gap-2">
          {card.moduleOnly ? (
            <span className="mt-0.5 border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-600">
              Modul
            </span>
          ) : null}
          <h3 className="line-clamp-1 text-[15px] font-black leading-tight text-slate-950">{card.title}</h3>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-600">{card.description}</p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
        <div className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.11em] text-slate-500">
          {card.count} minta · {card.open} nyitott
        </div>
        <div className="whitespace-nowrap border border-slate-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-slate-700 transition group-hover:border-cyan-500 group-hover:text-cyan-800">
          {getActionLabel(card)} →
        </div>
      </div>
    </button>
  )
}

function MinuteGroupSection({ group, onSelect }: { group: MinuteGroup; onSelect: (type: string) => void }) {
  return (
    <section className={`relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:content-[''] ${group.softAccent}`}>
      <div className="grid gap-2 border-b border-slate-200 bg-white px-3 py-2 pl-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center gap-2">
          <DiamondMark />
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{group.eyebrow}</div>
            <h2 className={`mt-0.5 whitespace-nowrap text-base font-black tracking-tight ${group.titleClass}`}>{group.headerLabel}</h2>
          </div>
        </div>
        <p className="max-w-4xl text-[11px] font-semibold leading-4 text-slate-600">{group.description}</p>
      </div>

      <div
        className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-2 xl:grid-cols-3"
        style={{
          backgroundColor: "#ffffff",
          backgroundImage:
            "linear-gradient(rgba(15,23,42,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.028) 1px, transparent 1px), linear-gradient(rgba(14,165,233,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px, 40px 40px, 160px 160px, 160px 160px",
        }}
      >
        {group.items.map((card) => (
          <MinuteCard key={card.title} card={card} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

export default function NewMinutePage({ onBack, onSelect }: NewMinutePageProps) {
  const groups: MinuteGroup[] = [
    {
      id: "office",
      title: "Irodai jegyzőkönyvek",
      eyebrow: "Office workflow",
      description: "Egyeztetés, beruházói döntés, kooperáció.",
      accent: "bg-cyan-500",
      softAccent: "before:bg-cyan-500",
      titleClass: "text-cyan-800",
      navClass: "border-cyan-300 text-cyan-800 hover:bg-cyan-50",
      headerLabel: "Irodai jegyzőkönyvek",
      counterLabel: "Irodai",
      items: minuteTypeCards.filter((card) => officeTypes.has(card.title)),
    },
    {
      id: "field",
      title: "Terepi rögzítések",
      eyebrow: "Field capture",
      description: "Állapot, fotó, hiba, tervjelölés.",
      accent: "bg-emerald-500",
      softAccent: "before:bg-emerald-500",
      titleClass: "text-emerald-800",
      navClass: "border-emerald-300 text-emerald-800 hover:bg-emerald-50",
      headerLabel: "Terepi rögzítések",
      counterLabel: "Terepi",
      items: minuteTypeCards.filter((card) => fieldTypes.has(card.title)),
    },
    {
      id: "other",
      title: "Hibakövetés és egyéb",
      eyebrow: "Control modules",
      description: "Hibajegyzék és gyors projektfeljegyzés.",
      accent: "bg-rose-500",
      softAccent: "before:bg-rose-500",
      titleClass: "text-rose-800",
      navClass: "border-rose-300 text-rose-800 hover:bg-rose-50",
      headerLabel: "Hibakövetés",
      counterLabel: "Hiba",
      items: minuteTypeCards.filter((card) => !officeTypes.has(card.title) && !fieldTypes.has(card.title)),
    },
  ]

  return (
    <div className="min-w-0 overflow-hidden bg-[#f3f7fa] pb-5 text-slate-800">
      <section className="border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)]">
        <div className="relative overflow-hidden border-b border-cyan-500 bg-gradient-to-r from-[#0f2f46] via-[#0e7490] to-[#0891b2] px-3 py-4 text-white shadow-[0_6px_16px_rgba(8,145,178,0.18)] sm:px-5">
          <HeaderHexPattern />
          <div className="relative z-10 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col items-start gap-1 pl-4 sm:pl-8 xl:pl-10">
              <button
                type="button"
                onClick={onBack}
                className="border-0 bg-transparent p-0 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100 hover:text-white"
              >
                ← Áttekintés
              </button>
              <h1 className="text-2xl font-black tracking-[0.015em] text-cyan-100 drop-shadow-[0_0_12px_rgba(103,232,249,0.28)] sm:text-[30px]">
                Új jegyzőkönyv
              </h1>
              <p className="mt-1.5 max-w-4xl text-[13px] font-semibold leading-5 text-white/90 drop-shadow-[0_1px_4px_rgba(15,23,42,0.22)]">
                Sablon vagy élő modul kiválasztása irodai, terepi és hibakövetési munkafolyamatokhoz.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {groups.map((group) => (
                <div key={group.id} className="flex min-w-0 items-center gap-2 border border-white/30 bg-white/12 px-2.5 py-1.5 shadow-sm backdrop-blur">
                  <DiamondMark />
                  <div>
                    <div className="text-base font-black leading-none text-white">{group.items.length}</div>
                    <div className="mt-0.5 truncate text-[9px] font-black uppercase tracking-[0.09em] text-cyan-50/85">{group.counterLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white/58 px-3 py-2 sm:px-5">
          <div className="mx-auto grid max-w-[1500px] gap-2 md:grid-cols-3">
            {groups.map((group) => (
              <a key={group.id} href={`#${group.id}`} className={`border bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] ${group.navClass}`}>
                ◇ {group.headerLabel}
              </a>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-[1500px] space-y-2.5 p-3 sm:p-4">
          {groups.map((group) => (
            <div key={group.id} id={group.id}>
              <MinuteGroupSection group={group} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
