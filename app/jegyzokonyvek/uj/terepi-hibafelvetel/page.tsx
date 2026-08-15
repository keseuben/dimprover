"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import FieldMinutePage from "@/components/minutes/field/FieldMinutePage"

type FieldProject = {
  id: string
  code: string
  name: string
  status: string
  permissions: string[]
}

export default function FieldMinuteRoutePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<FieldProject[]>([])
  const [projectId, setProjectId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/projects", { credentials: "same-origin", cache: "no-store" })
      const payload = await response.json() as { ok?: boolean; error?: string; projects?: FieldProject[] }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projektlista nem tölthető be.")
      const available = payload.projects || []
      setProjects(available)
      const requested = new URLSearchParams(window.location.search).get("projectId") || ""
      const next = available.some((project) => project.id === requested) ? requested : available[0]?.id || ""
      setProjectId(next)
      if (next) {
        const url = new URL(window.location.href)
        url.searchParams.set("projectId", next)
        window.history.replaceState({}, "", url.toString())
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A projektlista betöltése sikertelen.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadProjects() }, [loadProjects])

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) || null, [projectId, projects])

  function changeProject(nextProjectId: string) {
    if (!projects.some((project) => project.id === nextProjectId)) return
    setProjectId(nextProjectId)
    const url = new URL(window.location.href)
    url.searchParams.set("projectId", nextProjectId)
    window.history.replaceState({}, "", url.toString())
  }

  return (
    <AppLayout>
      {loading ? (
        <div className="grid min-h-[420px] place-items-center bg-white">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-500"><Loader2 size={22} className="animate-spin" /> Terepi projektkörnyezet betöltése…</div>
        </div>
      ) : error ? (
        <div className="grid min-h-[420px] place-items-center bg-white p-6">
          <div className="max-w-xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800"><div className="flex items-center gap-2 font-black"><AlertTriangle size={18} /> A Terepi hibafelvétel nem indítható</div><p className="mt-2">{error}</p><button type="button" onClick={() => void loadProjects()} className="mt-4 border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase">Újrapróbálás</button></div>
        </div>
      ) : !selectedProject ? (
        <div className="grid min-h-[420px] place-items-center bg-white p-6 text-center text-sm font-semibold text-slate-500">Nincs elérhető projekt. A központi HJ mentéshez aktív projekt-hozzáférés szükséges.</div>
      ) : (
        <FieldMinutePage
          key={selectedProject.id}
          onBack={() => router.push("/jegyzokonyvek/uj")}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          projectCode={selectedProject.code}
          permissions={selectedProject.permissions || []}
          projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name }))}
          onProjectChange={changeProject}
        />
      )}
    </AppLayout>
  )
}
