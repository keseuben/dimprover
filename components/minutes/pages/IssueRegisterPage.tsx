"use client"

type IssueRegisterPageProps = {
  onBack: () => void
}

type IssueStatus = "Új" | "Folyamatban" | "Javítva" | "Ellenőrizve" | "Lezárva" | "Újranyitva"

type IssueRegisterItem = {
  id: string
  source: string
  title: string
  location: string
  responsible: string
  discipline: string
  deadline: string
  severity: string
  status: IssueStatus
  lastNotification: string
}

const issueStatuses: IssueStatus[] = ["Új", "Folyamatban", "Javítva", "Ellenőrizve", "Lezárva", "Újranyitva"]

const issueRegisterItems: IssueRegisterItem[] = [
  {
    id: "HJ-001",
    source: "Terepi hibafelvétel",
    title: "Sérült burkolati él a főbejáratnál",
    location: "A épület / földszint / főbejárat",
    responsible: "Burkoló Partner Kft.",
    discipline: "Építészet",
    deadline: "2026.05.24.",
    severity: "Magas",
    status: "Új",
    lastNotification: "Első rendszerüzenet kiküldve",
  },
  {
    id: "HJ-002",
    source: "Terepi hibafelvétel",
    title: "Hiányzó gépészeti áttörés jelölés",
    location: "B épület / 2. emelet / gépészeti strang",
    responsible: "Gépész Szerelő Kft.",
    discipline: "Gépészet",
    deadline: "2026.05.22.",
    severity: "Közepes",
    status: "Folyamatban",
    lastNotification: "Felelős emlékeztető előkészítve",
  },
  {
    id: "HJ-003",
    source: "Terepi hibafelvétel",
    title: "Javított festési hiba ellenőrzésre vár",
    location: "C épület / lépcsőház",
    responsible: "Festő Team Bt.",
    discipline: "Befejező munkák",
    deadline: "2026.05.18.",
    severity: "Alacsony",
    status: "Javítva",
    lastNotification: "Ellenőrzési feladat létrehozva",
  },
  {
    id: "HJ-004",
    source: "Terepi hibafelvétel",
    title: "Újranyitott ajtóbeállítási hiba",
    location: "A épület / I. emelet / 1.05 iroda",
    responsible: "Asztalos Műhely Kft.",
    discipline: "Nyílászáró",
    deadline: "2026.05.20.",
    severity: "Közepes",
    status: "Újranyitva",
    lastNotification: "Újranyitási értesítés előkészítve",
  },
]

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

function statusBadgeClass(status: IssueStatus) {
  if (status === "Új") return "border-blue-200 bg-blue-50 text-blue-800"
  if (status === "Folyamatban") return "border-amber-200 bg-amber-50 text-amber-800"
  if (status === "Javítva") return "border-cyan-200 bg-cyan-50 text-cyan-800"
  if (status === "Ellenőrizve") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "Lezárva") return "border-slate-200 bg-slate-100 text-slate-600"
  return "border-rose-200 bg-rose-50 text-rose-800"
}

function severityClass(severity: string) {
  if (severity === "Magas") return "border-orange-200 bg-orange-50 text-orange-800"
  if (severity === "Közepes") return "border-amber-200 bg-amber-50 text-amber-800"
  if (severity === "Sürgős") return "border-red-200 bg-red-50 text-red-800"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function StatCard({ value, label, tone }: { value: number | string; label: string; tone: "cyan" | "rose" | "amber" | "slate" }) {
  const toneClass = {
    cyan: "border-cyan-200 bg-cyan-50/80 text-cyan-900",
    rose: "border-rose-200 bg-rose-50/80 text-rose-900",
    amber: "border-amber-200 bg-amber-50/80 text-amber-900",
    slate: "border-slate-300 bg-white text-slate-950",
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

export default function IssueRegisterPage({ onBack }: IssueRegisterPageProps) {
  const openIssues = issueRegisterItems.filter((issue) => issue.status !== "Lezárva")
  const fixedIssues = issueRegisterItems.filter((issue) => issue.status === "Javítva" || issue.status === "Ellenőrizve")
  const overdueCount = issueRegisterItems.filter((issue) => ["HJ-002", "HJ-003"].includes(issue.id)).length

  return (
    <div className="min-w-0 overflow-hidden bg-[#f3f7fa] pb-5 text-slate-800">
      <section className="border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)]">
        <div className="relative overflow-hidden border-b border-cyan-500 bg-gradient-to-r from-[#0f2f46] via-[#0e7490] to-[#0891b2] px-3 py-2.5 text-white shadow-[0_6px_16px_rgba(8,145,178,0.18)] sm:px-5">
          <HeaderHexPattern />
          <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col items-start gap-1 pl-4 sm:pl-8 xl:pl-10">
              <button
                type="button"
                onClick={onBack}
                className="border-0 bg-transparent p-0 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100 hover:text-white"
              >
                ← Jegyzőkönyvek
              </button>
              <h1 className="text-2xl font-black tracking-[0.015em] text-cyan-100 drop-shadow-[0_0_12px_rgba(103,232,249,0.28)] sm:text-[30px]">
                Hibajegyzék
              </h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-5 text-cyan-50/85">
                Élő hibakövető felület: státuszok, határidők, felelősök, ismételt értesítések és PDF jelentések kezelése.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-4 xl:w-[620px]">
              <StatCard value={issueRegisterItems.length} label="Összes" tone="slate" />
              <StatCard value={openIssues.length} label="Nyitott" tone="rose" />
              <StatCard value={overdueCount} label="Lejárt" tone="amber" />
              <StatCard value={fixedIssues.length} label="Javítás" tone="cyan" />
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
          <div className="mx-auto grid max-w-[1500px] gap-2 md:grid-cols-4">
            <a href="#tabla" className="border border-cyan-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-cyan-800 hover:bg-cyan-50">◇ Hibalista</a>
            <a href="#statusz" className="border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-slate-700 hover:bg-slate-50">◇ Státuszok</a>
            <a href="#ertesites" className="border border-amber-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-amber-800 hover:bg-amber-50">◇ Értesítések</a>
            <a href="#export" className="border border-rose-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-rose-800 hover:bg-rose-50">◇ PDF jelentések</a>
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
          <section id="statusz" className="relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-rose-500 before:content-['']">
            <div className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
              <div className="flex items-center gap-2">
                <DiamondMark />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Issue control</div>
                  <h2 className="mt-0.5 whitespace-nowrap text-base font-black tracking-tight text-rose-800">Hibakövetés</h2>
                </div>
              </div>
              <p className="max-w-4xl text-[11px] font-semibold leading-4 text-slate-600">
                A terepi hibafelvételből érkező hibák itt központi listában, felelősönként és státusz szerint követhetők.
              </p>
            </div>

            <div className="grid gap-2 p-3 md:grid-cols-3 xl:grid-cols-6">
              {issueStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`border px-3 py-2 text-left text-xs font-black uppercase tracking-[0.08em] transition hover:shadow-sm ${statusBadgeClass(status)}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </section>

          <section id="tabla" className="relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-cyan-500 before:content-['']">
            <div className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:grid-cols-[260px_minmax(0,1fr)_auto] lg:items-center">
              <div className="flex items-center gap-2">
                <DiamondMark />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Live register</div>
                  <h2 className="mt-0.5 whitespace-nowrap text-base font-black tracking-tight text-cyan-800">Hibalista</h2>
                </div>
              </div>
              <input
                type="search"
                placeholder="Keresés HJ azonosítóra, felelősre, szakágra vagy helyszínre"
                className="h-10 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-500"
              />
              <div className="flex gap-2">
                <button type="button" className="h-10 border border-cyan-700 bg-cyan-700 px-4 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">PDF</button>
                <button type="button" className="h-10 border border-slate-700 bg-slate-800 px-4 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-slate-900">Értesítés</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="grid min-w-[1180px] grid-cols-[110px_minmax(280px,1fr)_220px_190px_150px_130px_150px_190px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                <div>HJ</div>
                <div>Hiba</div>
                <div>Helyszín</div>
                <div>Felelős</div>
                <div>Szakág</div>
                <div>Határidő</div>
                <div>Státusz</div>
                <div>Értesítés</div>
              </div>

              {issueRegisterItems.map((issue, index) => (
                <div
                  key={issue.id}
                  className={`grid min-w-[1180px] grid-cols-[110px_minmax(280px,1fr)_220px_190px_150px_130px_150px_190px] items-center border-b border-slate-100 px-4 py-3 text-sm transition hover:bg-cyan-50/70 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50/70"
                  }`}
                >
                  <div className="font-black text-rose-700">{issue.id}</div>
                  <div>
                    <div className="font-bold text-slate-950">{issue.title}</div>
                    <div className="text-xs font-semibold text-slate-500">Forrás: {issue.source}</div>
                  </div>
                  <div className="truncate text-slate-600">{issue.location}</div>
                  <div className="truncate font-semibold text-slate-700">{issue.responsible}</div>
                  <div className="truncate text-slate-600">{issue.discipline}</div>
                  <div className="font-bold text-slate-700">{issue.deadline}</div>
                  <div>
                    <span className={`inline-flex border px-2.5 py-1 text-xs font-black ${statusBadgeClass(issue.status)}`}>
                      {issue.status}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500">{issue.lastNotification}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-2">
            <section id="ertesites" className="relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-amber-500 before:content-['']">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Notification workflow</div>
                <h2 className="mt-0.5 text-base font-black text-amber-800">Ismételt értesítések</h2>
              </div>
              <div className="grid gap-2 p-4 text-sm font-semibold text-slate-600">
                <div className="border border-amber-200 bg-amber-50/70 p-3">Lejárt vagy közelgő határidejű hibák felelősönkénti újraküldése.</div>
                <div className="border border-slate-200 bg-white p-3">Következő fejlesztési lépés: értesítési napló és címzettlista bekötése.</div>
              </div>
            </section>

            <section id="export" className="relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-cyan-500 before:content-['']">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">PDF reports</div>
                <h2 className="mt-0.5 text-base font-black text-cyan-800">Hibajegyzék PDF-ek</h2>
              </div>
              <div className="grid gap-2 p-4 text-sm font-semibold text-slate-600">
                <button type="button" className="border border-cyan-700 bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">Heti hibajegyzék PDF</button>
                <button type="button" className="border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50">Felelősönkénti bontás</button>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}
