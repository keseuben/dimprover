"use client"

import { useMemo, useState } from "react"

const recentMinutes = [
  { id: "KOOP-2026-0019-A", title: "Kooperációs jegyzőkönyv", date: "2026.05.10.", file: "/demo/minutes/KOOP-2026-0019-A.pdf" },
  { id: "KOOP-2026-0018-A", title: "Kooperációs jegyzőkönyv", date: "2026.05.03.", file: "/demo/minutes/KOOP-2026-0018-A.pdf" },
  { id: "KOOP-2026-0017-A", title: "Kooperációs jegyzőkönyv", date: "2026.04.26.", file: "/demo/minutes/KOOP-2026-0017-A.pdf" },
  { id: "HJ-2026-0042-A", title: "Helyszíni jegyzőkönyv", date: "2026.04.22.", file: "/demo/minutes/HJ-2026-0042-A.pdf" },
  { id: "KOOP-2026-0016-A", title: "Kooperációs jegyzőkönyv", date: "2026.04.19.", file: "/demo/minutes/KOOP-2026-0016-A.pdf" },
  { id: "MUSZ-2026-0007-A", title: "Műszaki jegyzőkönyv", date: "2026.04.17.", file: "/demo/minutes/MUSZ-2026-0007-A.pdf" },
  { id: "KOOP-2026-0015-A", title: "Kooperációs jegyzőkönyv", date: "2026.04.12.", file: "/demo/minutes/KOOP-2026-0015-A.pdf" },
  { id: "ATAD-2026-0004-A", title: "Átadás-átvételi jegyzőkönyv", date: "2026.04.09.", file: "/demo/minutes/ATAD-2026-0004-A.pdf" },
  { id: "KOOP-2026-0014-A", title: "Kooperációs jegyzőkönyv", date: "2026.04.05.", file: "/demo/minutes/KOOP-2026-0014-A.pdf" },
  { id: "TELJ-2026-0003-A", title: "Teljesítésigazolás", date: "2026.04.01.", file: "/demo/minutes/TELJ-2026-0003-A.pdf" },
  { id: "KOOP-2026-0013-A", title: "Kooperációs jegyzőkönyv", date: "2026.03.29.", file: "/demo/minutes/KOOP-2026-0013-A.pdf" },
  { id: "HJ-2026-0039-A", title: "Helyszíni jegyzőkönyv", date: "2026.03.25.", file: "/demo/minutes/HJ-2026-0039-A.pdf" },
]

export default function RecentMinutesPanel() {
  const [page, setPage] = useState(0)
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(recentMinutes.length / pageSize))
  const items = useMemo(() => recentMinutes.slice(page * pageSize, page * pageSize + pageSize), [page])

  function openPdf(file: string) {
    window.open(file, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-bold text-slate-900">Legutóbbi jegyzőkönyvek</h2>
        <p className="mt-1 text-xs text-slate-500">PDF előnézet új ablakban.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <button key={item.id} onClick={() => openPdf(item.file)} className="block w-full px-5 py-2 text-left hover:bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-slate-900">{item.id}</div>
              <div className="shrink-0 text-xs font-semibold text-blue-600">{item.date}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 text-sm">
        <button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1 font-semibold disabled:opacity-40">Előző</button>
        <span className="font-semibold text-slate-500">{page + 1} / {pageCount}</span>
        <button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1 font-semibold disabled:opacity-40">Következő</button>
      </div>
    </div>
  )
}
