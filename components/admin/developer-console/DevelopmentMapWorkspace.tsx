"use client";

import { AlertTriangle, Archive, Boxes, CheckCircle2, ChevronRight, CircleDot, FolderKanban, GripVertical, Layers3, Map as MapIcon, RefreshCw, Search, ShieldCheck, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEVELOPMENT_MAP_NODES, isTechnicalDevelopmentTask, resolveDevelopmentMapNode } from "@/app/lib/dev-center/development-map";
import { resolveTaskDevelopmentContext } from "@/app/lib/dev-center/development-context";
import type { ConsoleLiveState, LiveTask } from "./types";

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function taskContext(task: LiveTask) {
  return resolveTaskDevelopmentContext({ projectId: task.project_id, title: task.title, description: task.description, status: task.status, scope: task.scope, metadata: task.metadata });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { queued: "Sorban", ready: "Indításra kész", claimed: "Átvéve", in_progress: "Folyamatban", testing: "Tesztelés", blocked: "Blokkolt", completed: "Lezárt", cancelled: "Visszavonva" };
  return labels[status] || status;
}

function taskUpdated(task: LiveTask) {
  const date = new Date(task.updated_at || task.created_at || "");
  return Number.isFinite(date.getTime()) ? date.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

function TaskCard({ task, compact = false }: { task: LiveTask; compact?: boolean }) {
  const context = taskContext(task);
  const node = resolveDevelopmentMapNode({ projectId: task.project_id, title: task.title, description: task.description, status: task.status, scope: task.scope, metadata: task.metadata });
  const technical = isTechnicalDevelopmentTask(task);
  return <article
    draggable
    data-development-map-task={task.id}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/benjadmin-task-id", task.id); }}
    className={`group cursor-grab rounded-xl border bg-white p-3 shadow-sm active:cursor-grabbing ${task.status === "blocked" ? "border-red-300 bg-red-50" : "border-slate-200"}`}
  >
    <div className="flex items-start gap-2">
      <GripVertical size={15} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <strong className="text-[12px] font-black leading-4 text-slate-950">{task.title}</strong>
          {technical ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">TECHNIKAI</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500">
          <span>{statusLabel(task.status)}</span><span>·</span><span>6/{context.workStageIndex} {context.workStageLabel}</span><span>·</span><span>{taskUpdated(task)}</span>
        </div>
        {!compact ? <>
          <div className="mt-2 flex items-start gap-1.5 text-[10px] font-bold leading-4 text-cyan-800"><Layers3 size={12} className="mt-0.5 shrink-0" /><span>{node ? `${node.groupName} › ${node.projectName} › ${node.moduleName}` : `${context.mainModule} › ${context.moduleName} › ${context.submoduleName}`}</span></div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-600">{context.workItem}</p>
        </> : null}
      </div>
    </div>
  </article>;
}

export default function DevelopmentMapWorkspace() {
  const [live, setLive] = useState<ConsoleLiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [movingTaskId, setMovingTaskId] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dev/console/live", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; live?: ConsoleLiveState; error?: string } | null;
      if (!response.ok || !payload?.live) throw new Error(payload?.error || "A Fejlesztési Térkép nem tölthető be.");
      setLive(payload.live);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Fejlesztési Térkép nem tölthető be.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !movingTaskId) void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [load, movingTaskId]);

  const tasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (live?.tasks || [])
      .filter((task) => showClosed || !["completed", "cancelled"].includes(task.status))
      .filter((task) => showTechnical || !isTechnicalDevelopmentTask(task))
      .filter((task) => !needle || `${task.title} ${task.description || ""} ${task.project_id || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [live?.tasks, query, showClosed, showTechnical]);

  const unclassified = useMemo(() => tasks.filter((task) => !resolveDevelopmentMapNode({ projectId: task.project_id, title: task.title, description: task.description, status: task.status, scope: task.scope, metadata: task.metadata })), [tasks]);
  const groups = useMemo(() => {
    const result = new Map<string, Map<string, typeof DEVELOPMENT_MAP_NODES>>();
    for (const node of DEVELOPMENT_MAP_NODES) {
      if (!result.has(node.groupName)) result.set(node.groupName, new Map());
      const projects = result.get(node.groupName)!;
      if (!projects.has(node.projectName)) projects.set(node.projectName, []);
      projects.get(node.projectName)!.push(node);
    }
    return result;
  }, []);

  async function moveTask(taskId: string, nodeId: string) {
    if (!taskId || !nodeId || movingTaskId) return;
    setMovingTaskId(taskId); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/dev/console/development-map/${encodeURIComponent(taskId)}`, { method: "PATCH", headers: adminHeaders(true), body: JSON.stringify({ nodeId }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; placement?: { projectName?: string; moduleName?: string; contextModuleName?: string } } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az átsorolás nem menthető.");
      setNotice(`Átsorolva: ${payload.placement?.projectName || "projekt"} › ${payload.placement?.moduleName || "modul"} › ${payload.placement?.contextModuleName || "munkarész"}. Git/worktree nem mozdult.`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Az átsorolás nem menthető."); }
    finally { setMovingTaskId(""); }
  }

  if (loading && !live) return <div className="grid min-h-[70vh] place-items-center text-sm font-bold text-slate-500">Fejlesztési Térkép betöltése…</div>;

  return <main className="min-h-[calc(100vh-62px)] bg-slate-100 p-3 text-slate-950" data-testid="benjadmin-development-map">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-950 text-cyan-100"><MapIcon size={20} /></span><div><span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">BENJADMIN</span><h1 className="text-lg font-black">Fejlesztési Térkép</h1><p className="text-[11px] font-semibold text-slate-500">Főcsoport → Projekt → Modul → Kontextus Modul / Almodul → Munkarész</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700"><ShieldCheck size={11} className="mr-1 inline" />METAADAT MOZGATÁS · PROD DENY</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600">Ctrl+Alt+2 = elrejtés</span></div>
    </header>
    {error ? <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"><AlertTriangle size={15} />{error}<button className="ml-auto rounded-lg border border-red-200 bg-white px-2 py-1" onClick={() => void load()}><RefreshCw size={12} className="inline" /> Újra</button></div> : null}
    {notice ? <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{notice}</div> : null}
    <section className="grid min-h-[calc(100vh-190px)] grid-cols-1 gap-3 xl:grid-cols-[minmax(330px,0.78fr)_minmax(640px,1.7fr)]" data-testid="benjadmin-development-map-columns">
      <aside className="min-h-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="benjadmin-development-map-source">
        <div className="mb-3 flex items-center justify-between gap-2"><div><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">FORRÁS</span><h2 className="font-black">Fejlesztések / átsorolás</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black">{tasks.length} db</span></div>
        <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={14} className="text-slate-400" /><input className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none" placeholder="Keresés fejlesztésben…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="mb-3 grid grid-cols-2 gap-2 text-[10px] font-black"><button type="button" className={`rounded-lg border px-2 py-2 ${showTechnical ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setShowTechnical((v) => !v)}><Wrench size={12} className="mr-1 inline" />Technikai taskok</button><button type="button" className={`rounded-lg border px-2 py-2 ${showClosed ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setShowClosed((v) => !v)}><Archive size={12} className="mr-1 inline" />Lezártak</button></div>
        {unclassified.length ? <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-800"><AlertTriangle size={12} className="mr-1 inline" />{unclassified.length} elem nincs biztosan besorolva. Ezeket érdemes elsőként áthúzni.</div> : null}
        <div className="grid max-h-[calc(100vh-375px)] gap-2 overflow-auto pr-1">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}{!tasks.length ? <p className="p-5 text-center text-xs font-bold text-slate-400">Nincs a szűrésnek megfelelő fejlesztés.</p> : null}</div>
      </aside>
      <section className="min-h-0 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="benjadmin-development-map-targets">
        <div className="mb-3 flex items-center justify-between"><div><span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">CÉLSTRUKTÚRA</span><h2 className="font-black">Projekt- és modulhierarchia</h2></div><span className="text-[10px] font-bold text-slate-500">Húzd a kártyát a megfelelő modulra</span></div>
        <div className="grid gap-3">{[...groups.entries()].map(([groupName, projects]) => <details key={groupName} open className="rounded-xl border border-slate-200 bg-slate-50 p-2" data-map-group={groupName}>
          <summary className="cursor-pointer list-none px-2 py-2 text-sm font-black text-slate-950"><Layers3 size={15} className="mr-2 inline text-cyan-700" />{groupName}</summary>
          <div className="grid gap-2 pt-1">{[...projects.entries()].map(([projectName, nodes]) => <details key={projectName} open className="rounded-xl border border-slate-200 bg-white p-2" data-map-project={projectName}>
            <summary className="cursor-pointer list-none px-2 py-2 text-[12px] font-black"><FolderKanban size={14} className="mr-2 inline text-slate-500" />{projectName}</summary>
            <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">{nodes.map((node) => {
              const assigned = tasks.filter((task) => resolveDevelopmentMapNode({ projectId: task.project_id, title: task.title, description: task.description, status: task.status, scope: task.scope, metadata: task.metadata })?.id === node.id);
              return <div key={node.id} data-development-map-node={node.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); void moveTask(event.dataTransfer.getData("text/benjadmin-task-id"), node.id); }} className="min-h-28 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-2 transition hover:border-cyan-400 hover:bg-cyan-50/40">
                <div className="mb-2 flex items-start justify-between gap-2"><div><strong className="block text-[11px] font-black text-slate-950"><Boxes size={12} className="mr-1 inline text-cyan-700" />{node.moduleName}</strong><span className="mt-0.5 block text-[9px] font-bold text-slate-500">{node.contextModuleName}</span></div><span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-slate-500">{assigned.length}</span></div>
                <div className="grid gap-1.5">{assigned.slice(0, 4).map((task) => <TaskCard key={`${node.id}-${task.id}`} task={task} compact />)}{assigned.length > 4 ? <span className="text-center text-[9px] font-black text-slate-400">+ {assigned.length - 4} további</span> : null}{!assigned.length ? <div className="grid min-h-14 place-items-center rounded-lg border border-dashed border-slate-200 bg-white/60 text-[9px] font-bold text-slate-400"><ChevronRight size={13} />Ide húzható</div> : null}</div>
              </div>;
            })}</div>
          </details>)}</div>
        </details>)}</div>
      </section>
    </section>
    <footer className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-500"><CheckCircle2 size={13} className="text-emerald-600" />Átsoroláskor csak BENJADMIN metadata és audit esemény változik.<CircleDot size={11} />Git branch, worktree és fájlútvonal fizikailag változatlan marad.</footer>
  </main>;
}
