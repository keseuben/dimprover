"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderKanban, Link2, LoaderCircle, RefreshCw, Unlink2 } from "lucide-react";
import { HoldActionButton } from "@/components/ui/HoldActionButton";

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  currentPhase: string;
  linked: boolean;
  link: {
    id: string;
    sync_to_dock: boolean;
    allow_dock_package_creation: boolean;
    archive_to_drive: boolean;
    drive_target_folder_id: string | null;
  } | null;
};

type Payload = {
  ok: boolean;
  projects: ProjectOption[];
  error?: string;
};

export default function DropSpaceProjectLinksPanel({
  adminKey,
  space,
  onChanged,
}: {
  adminKey: string;
  space: { id: string; publicCode: string; name: string };
  onChanged: () => Promise<void>;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [syncToDock, setSyncToDock] = useState(true);
  const [allowDockPackageCreation, setAllowDockPackageCreation] = useState(true);
  const [archiveToDrive, setArchiveToDrive] = useState(false);

  const headers = useMemo(() => ({
    "content-type": "application/json",
    "x-dimpro-license-admin-key": adminKey,
  }), [adminKey]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drop/admin/spaces/${encodeURIComponent(space.id)}/projects`, {
        headers: { "x-dimpro-license-admin-key": adminKey },
        cache: "no-store",
      });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || "A projektkapcsolatok nem tölthetők be.");
      setProjects(Array.isArray(payload.projects) ? payload.projects : []);
      setMessage("");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A projektkapcsolatok nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [adminKey, space.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const linkedProjects = projects.filter((project) => project.linked);
  const availableProjects = projects.filter((project) => !project.linked);

  const linkProject = useCallback(async () => {
    if (!selectedProjectId || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drop/admin/spaces/${encodeURIComponent(space.id)}/projects`, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectId: selectedProjectId, syncToDock, allowDockPackageCreation, archiveToDrive }),
      });
      const payload = await response.json() as { error?: string; project?: { name?: string } };
      if (!response.ok) throw new Error(payload.error || "A projektkapcsolat nem hozható létre.");
      setMessageTone("success");
      setMessage(`A Drop tér kapcsolódik a(z) ${payload.project?.name || "kiválasztott"} projekthez.`);
      setSelectedProjectId("");
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A projektkapcsolat nem hozható létre.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [allowDockPackageCreation, archiveToDrive, headers, load, onChanged, selectedProjectId, space.id, submitting, syncToDock]);

  const unlinkProject = useCallback(async (project: ProjectOption) => {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drop/admin/spaces/${encodeURIComponent(space.id)}/projects`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ projectId: project.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A projektkapcsolat nem választható le.");
      setMessageTone("success");
      setMessage(`${project.name} leválasztva a Drop térről.`);
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A projektkapcsolat nem választható le.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [headers, load, onChanged, space.id, submitting]);

  return (
    <section className="mt-5 rounded-[1.5rem] border border-teal-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Projektkapu-kapcsolatok</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">{space.name} · {space.publicCode}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">A Drop tér több Projektkapu projekthez kapcsolható. A csomagok ugyanazt a fájlobjektumot használják, nem készül párhuzamos másolat.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Frissítés
        </button>
      </div>

      {message ? (
        <div role={messageTone === "error" ? "alert" : "status"} className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${messageTone === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : messageTone === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-cyan-200 bg-cyan-50 text-cyan-950"}`}>
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.85fr)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">Kapcsolt projektek</p>
          <div className="mt-3 space-y-3">
            {linkedProjects.map((project) => (
              <article key={project.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-emerald-800"><Link2 size={16} /><span className="text-[10px] font-black uppercase tracking-[0.1em]">{project.code} · {project.status}</span></div>
                    <strong className="mt-2 block text-base text-slate-950">{project.name}</strong>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Dock: {project.link?.sync_to_dock ? "szinkronizált" : "kikapcsolva"} · Csomagkészítés: {project.link?.allow_dock_package_creation ? "engedélyezve" : "tiltva"} · Drive: {project.link?.archive_to_drive ? "archiválás aktív" : "nincs archiválás"}</p>
                  </div>
                  <HoldActionButton
                    tone="danger"
                    durationMs={2000}
                    disabled={submitting}
                    icon={<Unlink2 size={15} />}
                    label="Leválasztás · 2 mp"
                    holdingLabel="Leválasztáshoz"
                    runningLabel="Leválasztás…"
                    completedLabel="Leválasztva"
                    onComplete={() => unlinkProject(project)}
                  />
                </div>
              </article>
            ))}
            {!linkedProjects.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">Még nincs kapcsolt Projektkapu projekt.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
          <div className="flex items-center gap-2 text-cyan-800"><FolderKanban size={17} /><p className="text-xs font-black uppercase tracking-[0.12em]">Új projektkapcsolat</p></div>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100">
            <option value="">Projekt kiválasztása</option>
            {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
          </select>
          <div className="mt-4 space-y-2">
            <Toggle checked={syncToDock} onChange={setSyncToDock} label="Megjelenítés a Dock munkatérben" />
            <Toggle checked={allowDockPackageCreation} onChange={setAllowDockPackageCreation} label="Csomagkészítés engedélyezése a projektből" />
            <Toggle checked={archiveToDrive} onChange={setArchiveToDrive} label="Drive-archiválás előkészítése" />
          </div>
          <button type="button" onClick={() => void linkProject()} disabled={!selectedProjectId || submitting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <Link2 size={17} />} Projekt kapcsolása
          </button>
          {!availableProjects.length ? <p className="mt-3 text-xs font-bold leading-5 text-slate-500">Minden elérhető Projektkapu projekt kapcsolva van ehhez a térhez.</p> : null}
        </div>
      </div>
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-100 bg-white p-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-700" />
      <span className="text-xs font-bold leading-5 text-slate-700">{label}</span>
    </label>
  );
}
