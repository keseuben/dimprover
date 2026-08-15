"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCcw } from "lucide-react"

type IssueRegisterPageProps = { onBack: () => void }
type IssueStatus = "NEW" | "IN_PROGRESS" | "FIXED" | "VERIFIED" | "CLOSED" | "REOPENED"
type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

type ProjectOption = {
  id: string
  code: string
  name: string
  status: string
  permissions: string[]
}

type ProjectMember = {
  userId: string
  displayName: string
  role: string
  status: string
}

type ProjectIssue = {
  id: string
  projectId: string
  serial: string
  sourceType: string
  sourceId: string
  title: string
  description: string
  location: string
  discipline: string
  severity: IssueSeverity
  status: IssueStatus
  responsibleUserId: string | null
  responsibleName: string
  dueAt: string | null
  note: string
  metadata: Record<string, unknown>
  version: number
  createdByName: string
  updatedByName: string
  createdAt: string
  updatedAt: string
}

type IssueDraft = Pick<ProjectIssue, "title" | "description" | "location" | "discipline" | "note">

const statuses: Array<{ value: IssueStatus; label: string }> = [
  { value: "NEW", label: "Új" },
  { value: "IN_PROGRESS", label: "Folyamatban" },
  { value: "FIXED", label: "Javítva" },
  { value: "VERIFIED", label: "Ellenőrizve" },
  { value: "CLOSED", label: "Lezárva" },
  { value: "REOPENED", label: "Újranyitva" },
]

const severities: Array<{ value: IssueSeverity; label: string }> = [
  { value: "LOW", label: "Alacsony" },
  { value: "MEDIUM", label: "Közepes" },
  { value: "HIGH", label: "Magas" },
  { value: "URGENT", label: "Sürgős" },
]

const sourceLabels: Record<string, string> = {
  COMPARE_FINDING: "Drive Compare",
  FIELD_CAPTURE: "Terepi hibafelvétel",
  MANUAL: "Kézi hibajegy",
  MEETING: "Értekezlet",
  IMPORT: "Import",
}

function HeaderHexPattern() {
  const bands = [
    "left-[23%] -top-[170px] h-[340px] w-[340px] border-cyan-100/18",
    "left-[47%] -top-[205px] h-[410px] w-[410px] border-white/14",
    "right-[-60px] -top-[180px] h-[360px] w-[360px] border-cyan-200/16",
  ]
  return <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">{bands.map((band) => <div key={band} className={`absolute rotate-45 border ${band}`} />)}<div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(115deg,transparent,rgba(103,232,249,0.11),transparent)]" /></div>
}

function DiamondMark({ children = "D" }: { children?: React.ReactNode }) {
  return <span className="relative inline-grid h-8 w-8 shrink-0 place-items-center"><span className="absolute inset-1 rotate-45 border border-cyan-100/55 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)]" /><span className="relative text-[10px] font-black uppercase tracking-tight text-slate-700">{children}</span></span>
}

function StatCard({ value, label, tone }: { value: number | string; label: string; tone: "cyan" | "rose" | "amber" | "slate" }) {
  const toneClass = { cyan: "border-cyan-200 bg-cyan-50/80 text-cyan-900", rose: "border-rose-200 bg-rose-50/80 text-rose-900", amber: "border-amber-200 bg-amber-50/80 text-amber-900", slate: "border-slate-300 bg-white text-slate-950" }[tone]
  return <div className={`flex items-center gap-3 border px-3 py-2 shadow-sm ${toneClass}`}><DiamondMark /><div><div className="text-2xl font-black leading-none">{value}</div><div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-75">{label}</div></div></div>
}

function statusClass(status: IssueStatus) {
  if (status === "NEW") return "border-blue-200 bg-blue-50 text-blue-800"
  if (status === "IN_PROGRESS") return "border-amber-200 bg-amber-50 text-amber-800"
  if (status === "FIXED") return "border-cyan-200 bg-cyan-50 text-cyan-800"
  if (status === "VERIFIED") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "CLOSED") return "border-slate-200 bg-slate-100 text-slate-600"
  return "border-rose-200 bg-rose-50 text-rose-800"
}

function severityClass(severity: IssueSeverity) {
  if (severity === "URGENT") return "border-red-200 bg-red-50 text-red-800"
  if (severity === "HIGH") return "border-orange-200 bg-orange-50 text-orange-800"
  if (severity === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function statusLabel(status: IssueStatus) { return statuses.find((item) => item.value === status)?.label || status }
function severityLabel(severity: IssueSeverity) { return severities.find((item) => item.value === severity)?.label || severity }
function sourceLabel(source: string) { return sourceLabels[source] || source }
function dateOnly(value: string | null) { return value ? value.slice(0, 10) : "" }
function displayDate(value: string | null) { return value ? new Date(value).toLocaleDateString("hu-HU") : "-" }
function displayDateTime(value: string) { return value ? new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" }) : "-" }
function isOverdue(issue: ProjectIssue) { return Boolean(issue.dueAt && issue.status !== "CLOSED" && new Date(issue.dueAt).getTime() < Date.now()) }

export default function IssueRegisterPage({ onBack }: IssueRegisterPageProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectId, setProjectId] = useState("")
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [issues, setIssues] = useState<ProjectIssue[]>([])
  const [healthReady, setHealthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | IssueStatus>("ALL")
  const [severityFilter, setSeverityFilter] = useState<"ALL" | IssueSeverity>("ALL")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({})

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) || null, [projectId, projects])
  const canWrite = selectedProject?.permissions.includes("issue.write") || false

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { credentials: "same-origin", cache: "no-store" })
    const payload = await response.json() as { ok?: boolean; error?: string; projects?: ProjectOption[] }
    if (!response.ok || !payload.ok) throw new Error(payload.error || "A projektlista nem tölthető be.")
    const available = payload.projects || []
    setProjects(available)
    const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") || "" : ""
    setProjectId((current) => available.some((item) => item.id === current) ? current : available.some((item) => item.id === requested) ? requested : available[0]?.id || "")
  }, [])

  const loadProjectIssues = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) { setIssues([]); setMembers([]); setHealthReady(false); return }
    setLoading(true)
    setError("")
    setMessage("")
    try {
      const [healthResponse, issueResponse, memberResponse] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(nextProjectId)}/issues/health`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(nextProjectId)}/issues`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(nextProjectId)}/memberships`, { credentials: "same-origin", cache: "no-store" }),
      ])
      const health = await healthResponse.json() as { ok?: boolean; error?: string; databaseReady?: boolean; actualSchemaVersion?: string }
      const issuePayload = await issueResponse.json() as { ok?: boolean; error?: string; issues?: ProjectIssue[] }
      const memberPayload = await memberResponse.json() as { ok?: boolean; error?: string; memberships?: ProjectMember[] }
      if (!healthResponse.ok || !health.ok || !health.databaseReady) throw new Error(health.error || `A Project Issue Core nem áll készen (${health.actualSchemaVersion || "ismeretlen"}).`)
      if (!issueResponse.ok || !issuePayload.ok) throw new Error(issuePayload.error || "A hibajegyzék nem tölthető be.")
      if (!memberResponse.ok || !memberPayload.ok) throw new Error(memberPayload.error || "A projekttagok nem tölthetők be.")
      setHealthReady(true)
      setIssues(issuePayload.issues || [])
      setMembers((memberPayload.memberships || []).filter((member) => member.status === "ACTIVE"))
      setDrafts(Object.fromEntries((issuePayload.issues || []).map((issue) => [issue.id, { title: issue.title, description: issue.description, location: issue.location, discipline: issue.discipline, note: issue.note }])))
    } catch (caught) {
      setHealthReady(false)
      setError(caught instanceof Error ? caught.message : "A hibajegyzék betöltése sikertelen.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadProjects().catch((caught) => { setError(caught instanceof Error ? caught.message : "A projektlista betöltése sikertelen."); setLoading(false) })
  }, [loadProjects])

  useEffect(() => { if (projectId) void loadProjectIssues(projectId) }, [loadProjectIssues, projectId])

  function changeProject(next: string) {
    setProjectId(next)
    setExpandedId(null)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("projectId", next)
      window.history.replaceState({}, "", url.toString())
    }
  }

  async function persistIssue(issue: ProjectIssue, patch: Record<string, unknown>, successText: string) {
    if (!canWrite || savingId) return
    setSavingId(issue.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issue.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: issue.version, ...patch }),
      })
      const payload = await response.json() as { ok?: boolean; error?: string; code?: string; issue?: ProjectIssue }
      if (!response.ok || !payload.ok || !payload.issue) throw new Error(payload.error || "A hibajegy mentése sikertelen.")
      setIssues((current) => current.map((item) => item.id === issue.id ? payload.issue! : item))
      setDrafts((current) => ({ ...current, [issue.id]: { title: payload.issue!.title, description: payload.issue!.description, location: payload.issue!.location, discipline: payload.issue!.discipline, note: payload.issue!.note } }))
      setMessage(`${payload.issue.serial} · ${successText} · v${payload.issue.version}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A hibajegy mentése sikertelen.")
      await loadProjectIssues(projectId)
    } finally {
      setSavingId("")
    }
  }

  const filteredIssues = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("hu-HU")
    return issues.filter((issue) => {
      if (statusFilter !== "ALL" && issue.status !== statusFilter) return false
      if (severityFilter !== "ALL" && issue.severity !== severityFilter) return false
      if (!needle) return true
      return [issue.serial, issue.title, issue.location, issue.responsibleName, issue.discipline, sourceLabel(issue.sourceType)].join(" ").toLocaleLowerCase("hu-HU").includes(needle)
    })
  }, [issues, query, severityFilter, statusFilter])

  const openIssues = issues.filter((issue) => issue.status !== "CLOSED")
  const fixedIssues = issues.filter((issue) => issue.status === "FIXED" || issue.status === "VERIFIED")
  const overdueCount = issues.filter(isOverdue).length

  return (
    <div className="min-w-0 overflow-hidden bg-[#f3f7fa] pb-5 text-slate-800" data-project-issue-register="0.2.0">
      <section className="border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)]">
        <div className="relative overflow-hidden border-b border-cyan-500 bg-gradient-to-r from-[#0f2f46] via-[#0e7490] to-[#0891b2] px-3 py-2.5 text-white shadow-[0_6px_16px_rgba(8,145,178,0.18)] sm:px-5">
          <HeaderHexPattern />
          <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col items-start gap-1 pl-4 sm:pl-8 xl:pl-10">
              <button type="button" onClick={onBack} className="border-0 bg-transparent p-0 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100 hover:text-white">← Jegyzőkönyvek</button>
              <h1 className="text-2xl font-black tracking-[0.015em] text-cyan-100 drop-shadow-[0_0_12px_rgba(103,232,249,0.28)] sm:text-[30px]">Hibajegyzék</h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-5 text-cyan-50/85">Központi Project Issue Core munkatér · Compare, terepi, értekezleti és kézi hibajegyek egy projektlistában.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={projectId} onChange={(event) => changeProject(event.target.value)} aria-label="Hibajegyzék projekt" className="h-9 min-w-[280px] border border-cyan-300/60 bg-white/95 px-3 text-xs font-black text-slate-800 outline-none">
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
                </select>
                <span className="border border-white/25 bg-white/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-50">{canWrite ? "Szerkeszthető" : "Csak olvasás"}</span>
                <span className="border border-white/25 bg-white/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-50">Issue Core {healthReady ? "0.2.0 ✓" : "ellenőrzés"}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-4 xl:w-[620px]">
              <StatCard value={issues.length} label="Összes" tone="slate" />
              <StatCard value={openIssues.length} label="Nyitott" tone="rose" />
              <StatCard value={overdueCount} label="Lejárt" tone="amber" />
              <StatCard value={fixedIssues.length} label="Javítás" tone="cyan" />
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
          <div className="mx-auto grid max-w-[1500px] gap-2 lg:grid-cols-[minmax(260px,1fr)_190px_170px_auto]">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés HJ azonosítóra, hibára, felelősre, szakágra vagy helyszínre" className="h-10 border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-500" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | IssueStatus)} className="h-10 border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"><option value="ALL">Minden státusz</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as "ALL" | IssueSeverity)} className="h-10 border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"><option value="ALL">Minden súlyosság</option>{severities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <button type="button" onClick={() => void loadProjectIssues(projectId)} disabled={loading || !projectId} className="inline-flex h-10 items-center justify-center gap-2 border border-cyan-700 bg-cyan-700 px-4 text-xs font-black uppercase tracking-[0.08em] text-white disabled:opacity-50"><RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Frissítés</button>
          </div>
        </div>

        <div className="mx-auto max-w-[1500px] space-y-3 p-3 sm:p-4">
          {error ? <div className="flex items-center gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800"><AlertTriangle size={17} /> {error}</div> : null}
          {message ? <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}

          <section className="relative overflow-hidden border border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-cyan-500 before:content-['']">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Project Issue Core</div><h2 className="mt-0.5 text-base font-black text-cyan-800">Élő hibalista</h2></div><div className="text-xs font-black text-slate-500">{filteredIssues.length} / {issues.length} tétel</div></div>

            {loading ? <div className="grid min-h-48 place-items-center"><div className="flex items-center gap-3 text-sm font-bold text-slate-500"><Loader2 size={20} className="animate-spin" /> Hibajegyek betöltése…</div></div> : filteredIssues.length === 0 ? <div className="grid min-h-44 place-items-center px-6 text-center text-sm font-semibold text-slate-500">A kiválasztott projektben és szűrésben nincs megjeleníthető hibajegy.</div> : (
              <div className="overflow-x-auto">
                <div className="grid min-w-[1390px] grid-cols-[110px_minmax(280px,1fr)_150px_170px_210px_155px_155px_140px_48px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500"><div>HJ</div><div>Hiba / forrás</div><div>Súlyosság</div><div>Státusz</div><div>Felelős</div><div>Határidő</div><div>Helyszín</div><div>Utolsó mentés</div><div /></div>
                {filteredIssues.map((issue, index) => {
                  const expanded = expandedId === issue.id
                  const draft = drafts[issue.id] || { title: issue.title, description: issue.description, location: issue.location, discipline: issue.discipline, note: issue.note }
                  return <div key={issue.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/65"} data-project-issue={issue.serial}>
                    <div className="grid min-w-[1390px] grid-cols-[110px_minmax(280px,1fr)_150px_170px_210px_155px_155px_140px_48px] items-center border-b border-slate-100 px-4 py-2.5 text-sm hover:bg-cyan-50/55">
                      <div><div className="font-black text-rose-700">{issue.serial}</div><div className="mt-0.5 text-[9px] font-black uppercase text-slate-400">v{issue.version}</div></div>
                      <div className="min-w-0"><div className="truncate font-bold text-slate-950">{issue.title}</div><div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-500"><span>{sourceLabel(issue.sourceType)}</span>{issue.discipline ? <span>· {issue.discipline}</span> : null}</div></div>
                      <div><select value={issue.severity} disabled={!canWrite || savingId === issue.id} onChange={(event) => void persistIssue(issue, { severity: event.target.value }, "súlyosság mentve")} className={`h-8 w-full border px-2 text-[11px] font-black ${severityClass(issue.severity)}`}>{severities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                      <div><select value={issue.status} disabled={!canWrite || savingId === issue.id} onChange={(event) => void persistIssue(issue, { status: event.target.value }, "státusz mentve")} className={`h-8 w-full border px-2 text-[11px] font-black ${statusClass(issue.status)}`}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                      <div><select value={issue.responsibleUserId || ""} disabled={!canWrite || savingId === issue.id} onChange={(event) => void persistIssue(issue, { responsibleUserId: event.target.value }, "felelős mentve")} className="h-8 w-full border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"><option value="">{issue.responsibleName ? `Külső: ${issue.responsibleName}` : "Nincs kijelölve"}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.userId}</option>)}</select></div>
                      <div><input type="date" value={dateOnly(issue.dueAt)} disabled={!canWrite || savingId === issue.id} onChange={(event) => void persistIssue(issue, { dueAt: event.target.value ? `${event.target.value}T23:59:00` : "" }, "határidő mentve")} className={`h-8 w-full border px-2 text-[11px] font-bold ${isOverdue(issue) ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-300 bg-white text-slate-700"}`} /></div>
                      <div className="truncate text-[11px] font-semibold text-slate-600" title={issue.location || "Nincs helyszín"}>{issue.location || "-"}</div>
                      <div className="text-[10px] font-semibold text-slate-500"><div>{displayDate(issue.updatedAt)}</div><div className="truncate">{issue.updatedByName || "DIMPRO"}</div></div>
                      <button type="button" onClick={() => setExpandedId((current) => current === issue.id ? null : issue.id)} className="grid h-8 w-8 place-items-center border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                    </div>
                    {expanded ? <div className="border-b border-cyan-100 bg-cyan-50/35 px-5 py-4" data-issue-detail={issue.serial}>
                      <div className="grid gap-4 xl:grid-cols-[1.3fr_.9fr]">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="sm:col-span-2 grid gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Hiba megnevezése<input value={draft.title} disabled={!canWrite} onChange={(event) => setDrafts((current) => ({ ...current, [issue.id]: { ...draft, title: event.target.value } }))} className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800" /></label>
                          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Helyszín<input value={draft.location} disabled={!canWrite} onChange={(event) => setDrafts((current) => ({ ...current, [issue.id]: { ...draft, location: event.target.value } }))} className="h-10 border border-slate-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800" /></label>
                          <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Szakág<input value={draft.discipline} disabled={!canWrite} onChange={(event) => setDrafts((current) => ({ ...current, [issue.id]: { ...draft, discipline: event.target.value } }))} className="h-10 border border-slate-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800" /></label>
                          <label className="sm:col-span-2 grid gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Leírás<textarea rows={4} value={draft.description} disabled={!canWrite} onChange={(event) => setDrafts((current) => ({ ...current, [issue.id]: { ...draft, description: event.target.value } }))} className="border border-slate-300 bg-white p-3 text-sm font-semibold normal-case tracking-normal text-slate-800" /></label>
                          <label className="sm:col-span-2 grid gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Belső megjegyzés<textarea rows={3} value={draft.note} disabled={!canWrite} onChange={(event) => setDrafts((current) => ({ ...current, [issue.id]: { ...draft, note: event.target.value } }))} className="border border-slate-300 bg-white p-3 text-sm font-semibold normal-case tracking-normal text-slate-800" /></label>
                          {canWrite ? <button type="button" disabled={savingId === issue.id} onClick={() => void persistIssue(issue, draft, "részletek mentve")} className="sm:col-span-2 h-10 border border-cyan-700 bg-cyan-700 px-4 text-xs font-black uppercase tracking-[0.08em] text-white disabled:opacity-50">{savingId === issue.id ? "Mentés…" : "Részletek mentése"}</button> : null}
                        </div>
                        <div className="space-y-2 text-xs font-semibold text-slate-600">
                          <div className="border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Forrás</div><div className="mt-1 font-black text-slate-800">{sourceLabel(issue.sourceType)}</div><div className="mt-1 break-all text-[10px] text-slate-500">{issue.sourceId || "-"}</div></div>
                          <div className="border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Workflow</div><div className="mt-2 flex flex-wrap gap-2"><span className={`border px-2 py-1 text-[10px] font-black ${statusClass(issue.status)}`}>{statusLabel(issue.status)}</span><span className={`border px-2 py-1 text-[10px] font-black ${severityClass(issue.severity)}`}>{severityLabel(issue.severity)}</span>{isOverdue(issue) ? <span className="border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-800">Lejárt</span> : null}</div><div className="mt-2">Határidő: <strong>{displayDate(issue.dueAt)}</strong></div><div>Felelős: <strong>{issue.responsibleName || "Nincs kijelölve"}</strong></div></div>
                          <div className="border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Audit</div><div className="mt-1">Létrehozva: {displayDateTime(issue.createdAt)} · {issue.createdByName || "DIMPRO"}</div><div className="mt-1">Frissítve: {displayDateTime(issue.updatedAt)} · {issue.updatedByName || "DIMPRO"}</div><div className="mt-1">Aktuális verzió: <strong>v{issue.version}</strong></div></div>
                        </div>
                      </div>
                    </div> : null}
                  </div>
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}
