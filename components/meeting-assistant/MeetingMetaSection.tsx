"use client";

import { CalendarClock, FolderKanban, MapPin, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingDocumentKind, MeetingMode, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import MeetingSectionShell from "./MeetingSectionShell";
import { readJsonResponse } from "./safeJson";

type DriveProject = { id: string; code: string; name: string; status: "active" | "archived" };
type Props = {
  meetingId: string;
  accessToken: string;
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  locked: boolean;
  postWorkspace: (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>;
  setStatus: (message: string) => void;
  onOpenProjectProfiles: () => void;
};

function dateTimeInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const TYPE_OPTIONS = [
  ["Általános egyeztetés", "ÁLT"],
  ["Heti kooperáció", "KOOP"],
  ["Tervezői egyeztetés", "TERV"],
  ["Műszaki ellenőri bejárás", "MEB"],
  ["Hiba- és hiányegyeztetés", "HIBA"],
  ["Műszaki átadás-átvétel", "ATADAS"],
] as const;

function createForm(workspace: MeetingWorkspace) {
  return {
    meetingMode: workspace.meetingMode,
    title: workspace.title,
    projectId: workspace.projectId,
    projectCode: workspace.projectCode,
    projectName: workspace.projectName,
    meetingLocation: workspace.meetingLocation,
    meetingType: workspace.meetingType,
    meetingTypeCode: workspace.meetingTypeCode,
    documentKind: workspace.documentKind,
    documentId: workspace.documentId,
    previousMeetingId: workspace.previousMeetingId,
    organizerName: workspace.organizerName,
    chairpersonName: workspace.chairpersonName,
    minuteTakerName: workspace.minuteTakerName,
    approverName: workspace.approverName,
    scheduledStart: dateTimeInput(workspace.scheduledStart),
    scheduledEnd: dateTimeInput(workspace.scheduledEnd),
  };
}

export default function MeetingMetaSection({ meetingId, accessToken, workspace, role, locked, postWorkspace, setStatus, onOpenProjectProfiles }: Props) {
  const [projects, setProjects] = useState<DriveProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => createForm(workspace));

  useEffect(() => { setForm(createForm(workspace)); }, [workspace]);

  useEffect(() => {
    if (role !== "organizer") return;
    const query = new URLSearchParams({ meetingId });
    if (accessToken) query.set("accessToken", accessToken);
    fetch(`/api/meeting-assistant/projects?${query.toString()}`, { cache: "no-store" })
      .then((response) => readJsonResponse<{ projects?: DriveProject[] }>(response, "A projektlista nem tölthető be."))
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]));
  }, [accessToken, meetingId, role]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    setForm((current) => ({
      ...current,
      projectId: project?.id || "",
      projectCode: project?.code || "",
      projectName: project?.name || "Nincs projekthez kapcsolva",
    }));
  }

  function selectType(meetingType: string) {
    const option = TYPE_OPTIONS.find(([label]) => label === meetingType);
    setForm((current) => ({ ...current, meetingType, meetingTypeCode: option?.[1] || current.meetingTypeCode }));
  }

  function selectMeetingMode(meetingMode: MeetingMode) {
    if (meetingMode === form.meetingMode) return;
    const confirmed = window.confirm(
      "Az értekezlet módjának módosításával a megjelenő integrációs funkciók megváltoznak. A korábban rögzített adatok megmaradnak, de egyes Teams- vagy személyes funkciók elrejtésre kerülnek. Folytatod?",
    );
    if (!confirmed) return;
    setForm((current) => ({
      ...current,
      meetingMode,
      meetingLocation:
        meetingMode === "teams" && (!current.meetingLocation.trim() || current.meetingLocation === workspace.meetingLocation)
          ? "Microsoft Teams"
          : meetingMode === "in_person" && current.meetingLocation === "Microsoft Teams"
            ? ""
            : current.meetingLocation,
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await postWorkspace("update_meta", {
        ...form,
        scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : "",
        scheduledEnd: form.scheduledEnd ? new Date(form.scheduledEnd).toISOString() : "",
        reserveNumber: true,
      });
      setStatus("Az értekezlet módja, alapadatai, szerepkörei és dokumentumformája mentve.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az alapadatok mentése sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MeetingSectionShell
      scope={role}
      id="meeting-meta"
      title="Értekezlet adatai és projektkapcsolat"
      icon={FolderKanban}
      defaultOpen={false}
      accentClass="bg-slate-100 text-slate-700"
      badge={workspace.projectId ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black text-emerald-700">projektkapcsolt</span> : undefined}
    >
      {role !== "organizer" ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[9px]">
          <div><b>Értekezlet módja</b><div>{workspace.meetingMode === "in_person" ? "Személyes értekezlet" : "Microsoft Teams értekezlet"}</div></div>
          <div><b>Dokumentum</b><div>{workspace.documentLabel}</div></div>
          <div><b>Azonosító</b><div>{workspace.minuteNumber || "Nincs sorszám"}</div></div>
          <div><b>Projekt</b><div>{workspace.projectName}</div></div>
          <div><b>Kategória</b><div>{workspace.meetingType} ({workspace.meetingTypeCode})</div></div>
          <div><b>Értekezletvezető</b><div>{workspace.chairpersonName || "-"}</div></div>
          <div><b>Jegyzőkönyvvezető</b><div>{workspace.minuteTakerName || "-"}</div></div>
          <div><b>Jóváhagyó</b><div>{workspace.approverName || "-"}</div></div>
          <div><b>Időpont</b><div>{workspace.scheduledStart ? new Date(workspace.scheduledStart).toLocaleString("hu-HU") : "-"}</div></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-[8px] font-black uppercase">Értekezlet módja
              <select value={form.meetingMode} onChange={(event) => selectMeetingMode(event.target.value as MeetingMode)} disabled={locked} className="mt-1 w-full rounded-md border bg-white px-2 py-2 text-[10px] normal-case">
                <option value="teams">Microsoft Teams értekezlet</option>
                <option value="in_person">Személyes értekezlet</option>
              </select>
            </label>
            <label className="text-[8px] font-black uppercase">Dokumentumforma
              <select value={form.documentKind} onChange={(event) => update("documentKind", event.target.value as MeetingDocumentKind)} disabled={locked} className="mt-1 w-full rounded-md border bg-white px-2 py-2 text-[10px] normal-case">
                <option value="reminder">Egyeztetési emlékeztető</option>
                <option value="minutes">Jegyzőkönyv</option>
                <option value="meeting_note">Egyeztetési feljegyzés</option>
              </select>
            </label>
            <label className="text-[8px] font-black uppercase sm:col-span-2">Értekezlet címe
              <input value={form.title} onChange={(event) => update("title", event.target.value)} disabled={locked} className="mt-1 w-full rounded-md border px-2 py-2 text-[10px] normal-case" />
            </label>
            <label className="text-[8px] font-black uppercase">Egyeztetés kategóriája
              <select value={form.meetingType} onChange={(event) => selectType(event.target.value)} disabled={locked} className="mt-1 w-full rounded-md border bg-white px-2 py-2 text-[10px] normal-case">
                {TYPE_OPTIONS.map(([label, code]) => <option key={code} value={label}>{code} – {label}</option>)}
              </select>
            </label>
            <label className="text-[8px] font-black uppercase">Dokumentumszám
              <input value={workspace.minuteNumber} readOnly placeholder="Projekt mentésekor automatikusan létrejön" className="mt-1 w-full rounded-md border bg-slate-50 px-2 py-2 text-[10px] normal-case" />
            </label>
            <label className="text-[8px] font-black uppercase">DIMPRO projekt
              <select value={form.projectId} onChange={(event) => selectProject(event.target.value)} disabled={locked} className="mt-1 w-full rounded-md border bg-white px-2 py-2 text-[10px] normal-case">
                <option value="">Nincs projekthez kapcsolva</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
              </select>
            </label>
            <label className="text-[8px] font-black uppercase">{form.meetingMode === "teams" ? "Teams-kapcsolat / helyszín" : "Helyszín / tárgyaló"}
              <div className="relative mt-1"><MapPin size={12} className="absolute left-2 top-2.5 text-slate-400" /><input value={form.meetingLocation} onChange={(event) => update("meetingLocation", event.target.value)} className="w-full rounded-md border py-2 pl-7 pr-2 text-[10px] normal-case" /></div>
            </label>
            <label className="text-[8px] font-black uppercase">Kezdés
              <div className="relative mt-1"><CalendarClock size={12} className="absolute left-2 top-2.5 text-slate-400" /><input type="datetime-local" value={form.scheduledStart} onChange={(event) => update("scheduledStart", event.target.value)} className="w-full rounded-md border py-2 pl-7 pr-2 text-[10px] normal-case" /></div>
            </label>
            <label className="text-[8px] font-black uppercase">Befejezés
              <input type="datetime-local" value={form.scheduledEnd} onChange={(event) => update("scheduledEnd", event.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-[10px] normal-case" />
            </label>
            <label className="text-[8px] font-black uppercase">Értekezletvezető<input value={form.chairpersonName} onChange={(event) => update("chairpersonName", event.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-[10px] normal-case" /></label>
            <label className="text-[8px] font-black uppercase">Jegyzőkönyvvezető<input value={form.minuteTakerName} onChange={(event) => update("minuteTakerName", event.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-[10px] normal-case" /></label>
            <label className="text-[8px] font-black uppercase">Jóváhagyó<input value={form.approverName} onChange={(event) => update("approverName", event.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-[10px] normal-case" /></label>
            <label className="text-[8px] font-black uppercase">Dokumentumazonosító<input value={form.documentId} onChange={(event) => update("documentId", event.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-[10px] normal-case" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpenProjectProfiles} className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-[9px] font-black text-teal-800"><Users size={12} /> Projektadatlap és tagok</button>
            <button type="button" onClick={() => void save()} disabled={locked || saving} className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-3 py-2 text-[9px] font-black text-white disabled:opacity-40"><Save size={12} /> Mentés és sorszámozás</button>
          </div>
        </div>
      )}
    </MeetingSectionShell>
  );
}
