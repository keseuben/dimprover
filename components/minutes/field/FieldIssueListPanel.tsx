import { useState } from "react"
import type { FieldPhoto } from "./FieldPhotosPanel"
import type { FieldIssue } from "./FieldIssueTypes"

type IssueListView = "compact" | "detail" | "list"

type IssuePlanLinkSummary = {
  id: string
  issueId: string
  planName: string
  planMarkers?: {
    id: string
    issueId?: string
    issueSerial?: string
    serial: string
    discipline?: string
  }[]
}

type FieldIssueListPanelProps = {
  issues: FieldIssue[]
  photos: FieldPhoto[]
  planLinks?: IssuePlanLinkSummary[]
  activeIssueId?: string
  issueListView: IssueListView
  selectedIssueIds: string[]
  allIssuesSelected: boolean
  onSetIssueListView: (view: IssueListView) => void
  onAddIssue: () => void
  onToggleAllIssueSelection: () => void
  onToggleIssueSelection: (issueId: string) => void
  onSelectIssue: (issueId: string) => void
  onRequestIssueDelete: (issueId: string) => void
  onDeleteSelectedIssues: () => void
}

function severityClass(severity: string) {
  if (severity === "Sürgős") return "bg-red-100 text-red-700 border-red-200"
  if (severity === "Magas") return "bg-orange-100 text-orange-700 border-orange-200"
  if (severity === "Közepes") return "bg-yellow-100 text-yellow-800 border-yellow-200"
  return "bg-cyan-100 text-cyan-800 border-cyan-200"
}

function statusClass(status: string) {
  if (status === "Lezárva") return "bg-slate-100 text-slate-600 border-slate-200"
  if (status === "Ellenőrizve") return "bg-blue-100 text-blue-700 border-blue-200"
  if (status === "Javítva") return "bg-cyan-100 text-cyan-800 border-cyan-200"
  if (status === "Folyamatban") return "bg-cyan-100 text-cyan-800 border-cyan-200"
  return "bg-white text-slate-700 border-slate-200"
}

function syncLabel(issue: FieldIssue) {
  if (issue.syncState === "SYNCING") return "HJ mentés…"
  if (issue.syncState === "DIRTY") return `${issue.coreSerial || "HJ"} · módosult`
  if (issue.syncState === "ERROR") return `${issue.coreSerial || "HJ"} · hiba`
  if (issue.coreSerial) return `${issue.coreSerial} · v${issue.coreVersion || 1}`
  return "Helyi vázlat"
}

function syncClass(issue: FieldIssue) {
  if (issue.syncState === "ERROR") return "border-rose-200 bg-rose-50 text-rose-700"
  if (issue.syncState === "DIRTY") return "border-amber-200 bg-amber-50 text-amber-800"
  if (issue.coreSerial) return "border-emerald-200 bg-emerald-50 text-emerald-800"
  return "border-slate-200 bg-slate-50 text-slate-500"
}

export default function FieldIssueListPanel({
  issues,
  photos,
  planLinks = [],
  activeIssueId,
  issueListView,
  selectedIssueIds,
  allIssuesSelected,
  onSetIssueListView,
  onAddIssue,
  onToggleAllIssueSelection,
  onToggleIssueSelection,
  onSelectIssue,
  onRequestIssueDelete,
  onDeleteSelectedIssues,
}: FieldIssueListPanelProps) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(activeIssueId ?? null)
  const issueListIsCompact = issueListView === "compact"
  const issueListIsList = issueListView === "list"
  const issueListModeLabel = issueListView === "detail" ? "részletes" : issueListView === "compact" ? "kompakt" : "lista"

  return (
    <div className="border border-slate-300 bg-white/95 shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.1em] text-slate-700">Felvett hibák</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{issues.length} db terepi tétel · {issueListModeLabel} nézet</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 border border-slate-200 bg-slate-50 p-0.5" aria-label="Hibalista nézetváltó">
              {(["detail", "compact", "list"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => onSetIssueListView(view)}
                  className={`grid h-8 w-8 place-items-center text-[15px] font-black leading-none transition ${issueListView === view ? "bg-white text-cyan-800 shadow-sm" : "text-slate-400 hover:bg-white/70 hover:text-slate-600"}`}
                  title={view === "detail" ? "Részletes nézet" : view === "compact" ? "Kompakt nézet" : "Lista nézet"}
                  aria-label={view === "detail" ? "Részletes nézet" : view === "compact" ? "Kompakt nézet" : "Lista nézet"}
                >
                  {view === "detail" ? "●" : view === "compact" ? "◐" : "○"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onAddIssue}
              className="grid h-10 w-10 place-items-center border border-cyan-700 bg-cyan-700 text-2xl font-black leading-none text-white hover:bg-cyan-800"
              aria-label="Új hibatétel"
              title="Új hibatétel"
            >
              +
            </button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
          <input type="checkbox" checked={allIssuesSelected} onChange={onToggleAllIssueSelection} className="h-4 w-4 accent-cyan-600" />
          Összes kijelölése
        </label>
      </div>

      <div className="max-h-[520px] overflow-auto">
        {issues.map((issue) => {
          const linkedPhotos = photos.filter((photo) => photo.issueId === issue.id)
          const issuePhotos = linkedPhotos.length
          const linkedPlanMarkers = planLinks.flatMap((link) =>
            (link.planMarkers ?? [])
              .filter((marker) => (marker.issueId || link.issueId) === issue.id)
              .map((marker) => ({ ...marker, planName: link.planName }))
          )
          const isSelected = selectedIssueIds.includes(issue.id)
          const isExpanded = expandedIssueId === issue.id
          return (
            <div
              key={issue.id}
              className={`mb-3 border border-slate-300 shadow-sm transition ${activeIssueId === issue.id ? "bg-cyan-50 ring-2 ring-cyan-100" : "bg-white"}`}
            >
              <div className="relative grid grid-cols-[34px_minmax(0,1fr)]">
                <label className="grid place-items-center border-r border-slate-100">
                  <input type="checkbox" checked={isSelected} onChange={() => onToggleIssueSelection(issue.id)} className="h-4 w-4 accent-cyan-600" aria-label={`${issue.serial} kijelölése`} />
                </label>
                <button
                  type="button"
                  onClick={() => onSelectIssue(issue.id)}
                  className={`w-full text-left transition active:bg-cyan-100 hover:bg-cyan-50 ${issueListIsCompact ? "px-3 py-2 pr-20" : issueListIsList ? "px-3 py-0.5 pr-16" : "px-4 py-4 pr-20"}`}
                >
                  {issueListIsList ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-sm font-black text-slate-900">{issue.serial}</span>
                      <span className={`shrink-0 border px-1.5 py-0.5 text-[8px] font-black uppercase ${syncClass(issue)}`}>{syncLabel(issue)}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{issue.title}</span>
                      <span className={`shrink-0 border px-1.5 py-0.5 text-[9px] font-black uppercase ${severityClass(issue.severity)}`}>{issue.severity}</span>
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.06em] text-slate-400">📸 {issuePhotos} · HJ {linkedPlanMarkers.length}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2"><span className="text-base font-black text-slate-900">{issue.serial}</span><span className={`border px-1.5 py-0.5 text-[8px] font-black uppercase ${syncClass(issue)}`}>{syncLabel(issue)}</span></div>
                        <span className={`border px-2 py-1 text-[11px] font-black uppercase ${severityClass(issue.severity)}`}>
                          {issue.severity}
                        </span>
                      </div>
                      <div className={`${issueListIsCompact ? "mt-1 truncate text-xs leading-4" : "mt-2 line-clamp-2 text-sm leading-5"} font-bold text-slate-800`}>{issue.title}</div>
                      {!issueListIsCompact && <div className="mt-2 truncate text-xs font-semibold text-slate-500">📍 {issue.location || "Helyszín nincs megadva"}</div>}
                      <div className={`${issueListIsCompact ? "mt-1" : "mt-3"} flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.08em]`}>
                        <span className={`border px-2 py-1 ${statusClass(issue.status)}`}>{issue.status}</span>
                        <span className="text-slate-400">📸 {issuePhotos} · HJ {linkedPlanMarkers.length}</span>
                      </div>
                    </>
                  )}
                </button>
                <div className={`absolute right-2 flex gap-1 ${issueListIsList ? "top-0" : "top-1/2 -translate-y-1/2"}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                    className={`grid place-items-center border border-slate-200 bg-white font-black text-cyan-800 transition hover:bg-cyan-50 ${issueListIsList ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm"}`}
                    aria-label={`${issue.serial} részletek`}
                    title="Fotók és HJ kapcsolatok"
                  >
                    {isExpanded ? "−" : "▾"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestIssueDelete(issue.id)}
                    className={`grid place-items-center font-black text-red-500 transition hover:bg-red-50 hover:text-red-700 ${issueListIsList ? "h-6 w-6 text-base" : "h-8 w-8 text-lg"}`}
                    aria-label={`${issue.serial} törlése`}
                    title="Hibatétel törlése"
                  >
                    ×
                  </button>
                </div>
              </div>
              {isExpanded ? (
                <div className="border-t border-cyan-100 bg-cyan-50/55 px-4 py-3">
                  <div className="grid gap-2 text-xs font-semibold text-slate-700">
                    <div className="border border-cyan-200 bg-white px-3 py-2">
                      <b className="block text-[10px] uppercase tracking-[0.1em] text-cyan-800">Központi HJ kapcsolat</b>
                      <div className="mt-1 flex flex-wrap items-center gap-2"><span className={`border px-2 py-1 text-[9px] font-black uppercase ${syncClass(issue)}`}>{syncLabel(issue)}</span><span className="text-[10px] font-semibold text-slate-500">Helyi azonosító: {issue.localSerial || issue.id}</span></div>
                      {issue.syncError ? <span className="mt-1 block text-[10px] font-bold text-rose-700">{issue.syncError}</span> : null}
                    </div>
                    <div className="border border-cyan-200 bg-white px-3 py-2">
                      <b className="block text-[10px] uppercase tracking-[0.1em] text-cyan-800">Hangjegyzetek</b>
                      <span className="mt-1 block text-slate-500">Még nincs hangjegyzet ehhez a hibához.</span>
                    </div>

                    <div className="border border-cyan-200 bg-white px-3 py-2">
                      <b className="block text-[10px] uppercase tracking-[0.1em] text-cyan-800">Feltöltött fotók</b>
                      {linkedPhotos.length ? (
                        <div className="mt-2 grid gap-1">
                          {linkedPhotos.slice(0, 5).map((photo, photoIndex) => (
                            <div key={photo.id} className="grid grid-cols-[58px_minmax(0,1fr)_72px] items-center gap-2 border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
                              <span className="font-black text-cyan-800">{photo.edited ? `FJ-${String(photoIndex + 1).padStart(3, "0")}` : photo.serial}</span>
                              <span className="truncate font-bold text-slate-700">{photo.name || (photo.edited ? "Szerkesztett fotó" : "Fotó")}</span>
                              <span className="truncate text-right font-black uppercase tracking-[0.06em] text-slate-500">{photo.edited ? "Szerk." : photo.category || "Fotó"}</span>
                            </div>
                          ))}
                          {linkedPhotos.length > 5 ? <div className="text-[11px] font-black uppercase tracking-[0.08em] text-cyan-800">+ {linkedPhotos.length - 5} további fotó</div> : null}
                        </div>
                      ) : <span className="mt-1 block text-slate-500">Még nincs fotó ehhez a hibához.</span>}
                    </div>

                    <div className="border border-cyan-200 bg-white px-3 py-2">
                      <b className="block text-[10px] uppercase tracking-[0.1em] text-cyan-800">Tervjelölések</b>
                      {linkedPlanMarkers.length ? (
                        <div className="mt-2 grid gap-1">
                          {linkedPlanMarkers.slice(0, 5).map((marker) => (
                            <div key={`${marker.id}-${marker.serial}`} className="grid grid-cols-[58px_minmax(0,1fr)_72px] items-center gap-2 border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
                              <span className="font-black text-cyan-800">{marker.serial}</span>
                              <span className="truncate font-bold text-slate-700">{marker.planName}</span>
                              <span className="truncate text-right font-black uppercase tracking-[0.06em] text-slate-500">{marker.discipline || issue.severity || "Szakág"}</span>
                            </div>
                          ))}
                          {linkedPlanMarkers.length > 5 ? <div className="text-[11px] font-black uppercase tracking-[0.08em] text-cyan-800">+ {linkedPlanMarkers.length - 5} további HJ</div> : null}
                        </div>
                      ) : <span className="mt-1 block text-slate-500">Még nincs tervjelölés ehhez a hibához.</span>}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
        {!issues.length && (
          <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
            Nincs rögzített hibatétel. Új hiba felvételéhez használd a + gombot.
          </div>
        )}
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">{selectedIssueIds.length} kijelölt hibatétel</div>
        <button
          type="button"
          onClick={onDeleteSelectedIssues}
          disabled={!selectedIssueIds.length}
          className="mt-2 w-full border border-slate-200 bg-slate-100 px-3 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Kijelöltek törlése
        </button>
      </div>
    </div>
  )
}
