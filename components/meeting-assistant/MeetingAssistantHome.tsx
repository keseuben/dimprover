"use client";

import { Archive, CalendarPlus, FileText, FolderKanban, FolderPlus, Loader2, MapPin, Moon, RefreshCw, Search, Sun, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MeetingArchiveItem, MeetingProjectProfile } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";
import { useMeetingWebTheme } from "./useMeetingWebTheme";
import MeetingProjectCreateModal from "./MeetingProjectCreateModal";
import MeetingCreateModal, { type MeetingCreateDraft } from "./MeetingCreateModal";
import MeetingDeleteConfirmModal from "./MeetingDeleteConfirmModal";
import "./teams-meeting-theme.css";

type DriveProject = { id: string; code: string; name: string; status: "active" | "archived" };
type ProjectRow = { id: string; code: string; name: string; location: string; status: "active" | "archived"; members: number; profile?: MeetingProjectProfile };
type DeleteTarget = { kind: "project"; project: ProjectRow; meetingCount: number } | { kind: "meeting"; meeting: MeetingArchiveItem };

function meetingId(projectId: string) {
  return `${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 110);
}

export default function MeetingAssistantHome({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingArchiveItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState("");
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [meetingProject, setMeetingProject] = useState<ProjectRow | null>(null);
  const [meetingCreateError, setMeetingCreateError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { theme, toggleTheme } = useMeetingWebTheme();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const id = "meeting-assistant-home";
      const [projectResponse, profileResponse, archiveResponse] = await Promise.all([
        fetch(`/api/meeting-assistant/projects?meetingId=${id}&accessToken=${encodeURIComponent(accessToken)}`, { cache: "no-store" }),
        fetch(`/api/meeting-assistant/project-profiles?meetingId=${id}&accessToken=${encodeURIComponent(accessToken)}`, { cache: "no-store" }),
        fetch(`/api/meeting-assistant/archive?currentMeetingId=${id}&accessToken=${encodeURIComponent(accessToken)}`, { cache: "no-store" }),
      ]);
      const projectData = await readJsonResponse<{ projects?: DriveProject[]; error?: string }>(projectResponse, "A projektlista nem tölthető be.");
      const profileData = await readJsonResponse<{ profiles?: MeetingProjectProfile[]; error?: string }>(profileResponse, "A projektadatlapok nem tölthetők be.");
      const archiveData = await readJsonResponse<{ meetings?: MeetingArchiveItem[]; error?: string }>(archiveResponse, "Az értekezletek nem tölthetők be.");
      if (!projectResponse.ok) throw new Error(projectData.error || "A projektlista nem tölthető be.");
      if (!profileResponse.ok) throw new Error(profileData.error || "A projektadatlapok nem tölthetők be.");
      if (!archiveResponse.ok) throw new Error(archiveData.error || "Az értekezletek nem tölthetők be.");

      const profiles = new Map((profileData.profiles || []).map((profile) => [profile.projectId, profile]));
      const rows = new Map<string, ProjectRow>();
      for (const project of projectData.projects || []) {
        const profile = profiles.get(project.id);
        rows.set(project.id, { id: project.id, code: profile?.code || project.code, name: profile?.name || project.name, location: profile?.location || "", status: profile?.status || project.status, members: profile?.members.filter((member) => member.active).length || 0, profile });
      }
      for (const profile of profileData.profiles || []) {
        if (!rows.has(profile.projectId)) rows.set(profile.projectId, { id: profile.projectId, code: profile.code, name: profile.name, location: profile.location, status: profile.status, members: profile.members.filter((member) => member.active).length, profile });
      }
      setProjects([...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "hu")));
      setMeetings(archiveData.meetings || []);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A kezdőoldal betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? projects.filter((project) => `${project.code} ${project.name} ${project.location}`.toLowerCase().includes(term)) : projects;
  }, [projects, search]);

  const visibleMeetings = meetings.filter((item) => !selectedProjectId || item.projectId === selectedProjectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 15);

  async function createMeeting(project: ProjectRow, draft: MeetingCreateDraft) {
    const id = meetingId(project.id);
    setCreating(project.id);
    try {
      const response = await fetch("/api/meeting-assistant/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId: id,
          accessToken,
          role: "organizer",
          operation: "update_meta",
          payload: {
            title: draft.title,
            meetingMode: draft.meetingMode,
            projectId: project.id,
            projectCode: project.code,
            projectName: project.name,
            meetingLocation: draft.meetingLocation || project.location,
            meetingType: draft.meetingType,
            meetingTypeCode: draft.meetingTypeCode,
            documentKind: draft.documentKind,
            documentLabel: draft.documentLabel,
            chairpersonName: draft.chairpersonName || project.profile?.projectManager || "",
            minuteTakerName: draft.minuteTakerName || "Szervező",
            organizerName: draft.chairpersonName || "Szervező",
            scheduledStart: draft.scheduledStart ? new Date(draft.scheduledStart).toISOString() : "",
            reserveNumber: true,
          },
        }),
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string; accessToken?: string }>(response, "Az értekezlet létrehozása sikertelen.");
      if (!response.ok || !data.ok) throw new Error(data.error || "Az értekezlet létrehozása sikertelen.");
      const meetingAccessToken = data.accessToken || accessToken;
      if (draft.agendaTemplateKey !== "blank") {
        const agendaResponse = await fetch("/api/meeting-assistant/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ meetingId: id, accessToken: meetingAccessToken, role: "organizer", operation: "apply_agenda_template", payload: { templateKey: draft.agendaTemplateKey } }),
        });
        if (!agendaResponse.ok) throw new Error("Az értekezlet létrejött, de a napirendi sablon betöltése sikertelen.");
      }
      setMeetingCreateError("");
      setMeetingProject(null);
      router.push(`/ertekezleti-kisero?meetingId=${encodeURIComponent(id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Az értekezlet létrehozása sikertelen.";
      setMeetingCreateError(message);
      setStatus(message);
      setCreating("");
    }
  }

  async function confirmDelete(confirmationName: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (deleteTarget.kind === "project") {
        const response = await fetch("/api/meeting-assistant/project-profiles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            meetingId: "meeting-assistant-home",
            accessToken,
            action: "delete_project",
            projectId: deleteTarget.project.id,
            projectName: deleteTarget.project.name,
            confirmationName,
            actorName: "Szervező",
          }),
        });
        const data = await readJsonResponse<{ ok?: boolean; error?: string; deletedMeetingCount?: number }>(response, "A projekt törlése sikertelen.");
        if (!response.ok || !data.ok) throw new Error(data.error || "A projekt törlése sikertelen.");
        const projectId = deleteTarget.project.id;
        setProjects((current) => current.filter((item) => item.id !== projectId));
        setMeetings((current) => current.filter((item) => item.projectId !== projectId));
        if (selectedProjectId === projectId) setSelectedProjectId("");
        setStatus(`A(z) ${deleteTarget.project.name} projekt és ${data.deletedMeetingCount || 0} kapcsolódó értekezlet törölve lett az Értekezleti Kísérőből.`);
      } else {
        const response = await fetch("/api/meeting-assistant/archive", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            currentMeetingId: "meeting-assistant-home",
            selectedMeetingId: deleteTarget.meeting.meetingId,
            accessToken,
            confirmationTitle: confirmationName,
            actorName: "Szervező",
          }),
        });
        const data = await readJsonResponse<{ ok?: boolean; error?: string }>(response, "Az értekezlet törlése sikertelen.");
        if (!response.ok || !data.ok) throw new Error(data.error || "Az értekezlet törlése sikertelen.");
        setMeetings((current) => current.filter((item) => item.meetingId !== deleteTarget.meeting.meetingId));
        setStatus(`A(z) ${deleteTarget.meeting.title} értekezlet véglegesen törölve lett.`);
      }
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "A törlés sikertelen.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="dimpro-meeting-theme meeting-web-shell flex min-h-screen items-center justify-center bg-[#eef5f3]" data-theme={theme}><Loader2 size={30} className="animate-spin text-teal-700" /></div>;

  return <main className="dimpro-meeting-theme meeting-web-shell min-h-screen bg-[#eef5f3] p-3 sm:p-6" data-theme={theme}><div className="mx-auto max-w-[1500px]">
    <header className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">DIMPRO projektmunka</div><h1 className="mt-1 text-2xl font-black text-slate-950">Értekezleti Asszisztens</h1><p className="mt-1 text-sm text-slate-600">Válassz projektet, indíts gyors egyeztetést, vagy nyisd meg a korábbi dokumentumot.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={toggleTheme} title={theme === "dark" ? "Váltás világos módra" : "Váltás sötét módra"} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Világos mód" : "Sötét mód"}</button><button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black"><RefreshCw size={15} /> Frissítés</button><button type="button" onClick={() => setProjectCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white"><FolderPlus size={15} /> Új projekt</button><button type="button" onClick={() => router.push("/ertekezletek")} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white"><Archive size={15} /> Teljes archívum</button></div></div>{status && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{status}</div>}</header>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-sm font-black">Projektek</h2><p className="text-[11px] text-slate-500">{projects.length} projekt · válassz projektet, majd hozz létre új értekezletet</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative sm:w-64"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Projekt keresése..." className="w-full rounded-xl border py-2 pl-9 pr-3 text-xs" /></label><button type="button" onClick={() => setProjectCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-black text-white"><FolderPlus size={15} /> Új projekt</button>{selectedProjectId && <button type="button" onClick={() => { const project = projects.find((item) => item.id === selectedProjectId); if (project) { setMeetingCreateError(""); setMeetingProject(project); } }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black text-white"><CalendarPlus size={15} /> Új értekezlet</button>}</div></div><div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">{filtered.length === 0 ? <div className="col-span-full p-8 text-center text-sm text-slate-500">Még nincs projekt. Kattints az Új projekt gombra az első projekt létrehozásához.</div> : filtered.map((project) => {
        const projectMeetingCount = meetings.filter((item) => item.projectId === project.id).length;
        return <article key={project.id} className={`rounded-xl border p-4 ${selectedProjectId === project.id ? "border-teal-400 bg-teal-50/50" : "border-slate-200"}`}><button type="button" onClick={() => setSelectedProjectId(project.id)} className="w-full text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-800"><FolderKanban size={18} /></span><div className="mt-3 text-[10px] font-black uppercase text-teal-700">{project.code}</div><h3 className="mt-1 text-sm font-black">{project.name}</h3><div className="mt-3 space-y-1 text-[10px] font-semibold text-slate-500"><div className="flex items-center gap-1"><MapPin size={11} /> {project.location || "Nincs helyszín"}</div><div className="flex items-center gap-1"><Users size={11} /> {project.members} állandó tag</div><div className="flex items-center gap-1"><FileText size={11} /> {projectMeetingCount} dokumentum</div></div></button><div className="mt-4 flex gap-2"><button type="button" onClick={() => { setSelectedProjectId(project.id); setMeetingCreateError(""); setMeetingProject(project); }} className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black text-white"><CalendarPlus size={13} /> Új értekezlet</button><button type="button" onClick={() => { setDeleteError(""); setDeleteTarget({ kind: "project", project, meetingCount: projectMeetingCount }); }} title="Projekt törlése" aria-label={`${project.name} projekt törlése`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"><Trash2 size={14} /></button></div></article>;
      })}</div></section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b p-4"><h2 className="text-sm font-black">Korábbi értekezletek</h2><p className="text-[11px] text-slate-500">{selectedProjectId ? "A kiválasztott projekt dokumentumai" : "Legutóbbi dokumentumok"}</p></div><div className="max-h-[720px] divide-y overflow-y-auto">{visibleMeetings.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">Nincs megnyitható értekezlet.</div> : visibleMeetings.map((meeting) => <div key={meeting.meetingId} className="flex items-stretch hover:bg-slate-50"><button type="button" onClick={() => router.push(`/ertekezleti-kisero?meetingId=${encodeURIComponent(meeting.meetingId)}`)} className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><FileText size={15} /></span><span className="min-w-0"><span className="block truncate text-[11px] font-black">{meeting.title}</span><span className="mt-1 block truncate text-[9px] text-slate-500">{meeting.minuteNumber || meeting.documentLabel} · {meeting.projectName}</span><span className="mt-1 block text-[9px] text-slate-400">{new Date(meeting.updatedAt).toLocaleString("hu-HU")}</span></span></button><button type="button" onClick={() => { setDeleteError(""); setDeleteTarget({ kind: "meeting", meeting }); }} title="Értekezlet törlése" aria-label={`${meeting.title} értekezlet törlése`} className="m-3 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"><Trash2 size={14} /></button></div>)}</div></section>
    </div>
    {projectCreateOpen && <MeetingProjectCreateModal accessToken={accessToken} onClose={() => setProjectCreateOpen(false)} onCreated={async (profile) => {
      const row: ProjectRow = { id: profile.projectId, code: profile.code, name: profile.name, location: profile.location, status: profile.status, members: profile.members.filter((member) => member.active).length, profile };
      setProjects((current) => [...current.filter((item) => item.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name, "hu")));
      setSelectedProjectId(row.id);
      setProjectCreateOpen(false);
      setStatus(`A(z) ${profile.name} projekt létrejött. Most létrehozhatsz benne új értekezletet.`);
    }} />}
    {meetingProject && <MeetingCreateModal project={meetingProject} creating={creating === meetingProject.id} errorMessage={meetingCreateError} onClose={() => { if (!creating) { setMeetingCreateError(""); setMeetingProject(null); } }} onCreate={(draft) => createMeeting(meetingProject, draft)} />}
    {deleteTarget && <MeetingDeleteConfirmModal
      kind={deleteTarget.kind}
      name={deleteTarget.kind === "project" ? deleteTarget.project.name : deleteTarget.meeting.title}
      description={deleteTarget.kind === "project"
        ? `A projekt és ${deleteTarget.meetingCount} hozzá tartozó értekezlet törlődik az Értekezleti Kísérőből. A DIMPRO Drive eredeti projektmappája és fájljai nem törlődnek.`
        : "Az értekezleti munkatér, a feltöltött mellékletek, a snapshotok és az ideiglenes hozzáférési kódok is törlődnek."}
      deleting={deleting}
      errorMessage={deleteError}
      onClose={() => { if (!deleting) { setDeleteError(""); setDeleteTarget(null); } }}
      onConfirm={confirmDelete}
    />}
  </div></main>;
}