"use client";

import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Mail,
  MapPin,
  Monitor,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { readJsonResponse } from "./safeJson";
import MeetingTeamsAttendancePanel from "./MeetingTeamsAttendancePanel";
import type {
  AttendanceStatus,
  MeetingAttendee,
  MeetingViewRole,
  MeetingWorkspace,
  ParticipationMode,
} from "@/app/lib/meeting-assistant/types";

type PostWorkspace = (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>;

type Props = {
  meetingId: string;
  accessToken: string;
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  locked: boolean;
  postWorkspace: PostWorkspace;
  setStatus: (message: string) => void;
  refreshWorkspace: () => Promise<void>;
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Jelen",
  late: "Késve érkezett",
  left_early: "Korábban távozott",
  invited_absent: "Meghívott, nem vett részt",
};

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-800",
  late: "border-amber-200 bg-amber-50 text-amber-800",
  left_early: "border-violet-200 bg-violet-50 text-violet-800",
  invited_absent: "border-slate-200 bg-slate-100 text-slate-700",
};

function emptyForm() {
  return {
    id: "",
    projectMemberId: "",
    name: "",
    organization: "",
    functionTitle: "",
    email: "",
    phone: "",
    status: "present" as AttendanceStatus,
    participationMode: "online" as ParticipationMode,
    arrivalTime: "",
    departureTime: "",
    external: false,
  };
}

export default function MeetingAttendanceSection({ meetingId, accessToken, workspace, role, locked, postWorkspace, setStatus, refreshWorkspace }: Props) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToProject, setSaveToProject] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const attendees = workspace.attendees || [];
  const presentCount = attendees.filter((item) => item.status !== "invited_absent").length;

  useEffect(() => {
    function handleNavigation(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; scope?: MeetingViewRole }>).detail;
      if (detail?.scope && detail.scope !== role) return;
      setOpen(Boolean(detail?.id) && detail.id === "meeting-attendance");
    }
    window.addEventListener("dimpro-meeting-section", handleNavigation as EventListener);
    return () => window.removeEventListener("dimpro-meeting-section", handleNavigation as EventListener);
  }, [role]);

  function editAttendee(attendee: MeetingAttendee) {
    setForm({
      id: attendee.id,
      projectMemberId: attendee.projectMemberId,
      name: attendee.name,
      organization: attendee.organization,
      functionTitle: attendee.functionTitle,
      email: attendee.email,
      phone: attendee.phone,
      status: attendee.status,
      participationMode: attendee.participationMode,
      arrivalTime: attendee.arrivalTime,
      departureTime: attendee.departureTime,
      external: attendee.external,
    });
    setFormOpen(true);
  }

  function resetForm() {
    setForm(emptyForm());
    setFormOpen(false);
  }

  async function saveAttendee() {
    if (!form.name.trim()) {
      setStatus("A jelenlévő neve kötelező.");
      return;
    }
    setSaving(true);
    try {
      await postWorkspace("upsert_attendee", form);
      if (saveToProject && workspace.projectId) {
        const response = await fetch("/api/meeting-assistant/project-profiles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ meetingId, accessToken, action: "upsert_member", projectId: workspace.projectId, member: { id: form.projectMemberId || undefined, name: form.name, organization: form.organization, functionTitle: form.functionTitle, email: form.email, phone: form.phone, external: form.external, active: true, defaultInvite: true } }),
        });
        const data = await readJsonResponse<{ ok: boolean; error?: string }>(response, "A projekttag mentése sikertelen.");
        if (!response.ok || !data.ok) throw new Error(data.error || "A projekttag mentése sikertelen.");
      }
      setStatus(saveToProject && workspace.projectId ? "A jelenlévő rögzítve és a projekt tagjai közé mentve." : form.id ? "A jelenlévő adatai módosítva." : "A jelenlévő rögzítve.");
      setSaveToProject(false);
      resetForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A jelenlévő mentése sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAttendanceSection() {
    const nextId = open ? "" : "meeting-attendance";
    window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id: nextId, scope: role } }));
    if (!nextId) return;
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>(`[data-meeting-panel-role="${role}"]`);
      const target = panel?.querySelector<HTMLElement>(`#${nextId}`);
      const container = panel?.querySelector<HTMLElement>("[data-meeting-scroll-container]");
      if (!target || !container) return;
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({ top: Math.max(0, container.scrollTop + targetRect.top - containerRect.top), behavior: "smooth" });
    }, 90);
  }

  async function removeAttendee(attendee: MeetingAttendee) {
    if (!window.confirm(`Biztosan törlöd a jelenléti ívről: ${attendee.name}?`)) return;
    try {
      await postWorkspace("remove_attendee", { id: attendee.id });
      setStatus("A személy törölve a jelenléti ívről.");
      if (form.id === attendee.id) resetForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A törlés sikertelen.");
    }
  }

  return (
    <section id="meeting-attendance" className="scroll-mt-[92px] border-b border-slate-200 bg-white">
      <button
        type="button"
        onClick={toggleAttendanceSection}
        className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700"><Users size={13} /></span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-black text-slate-900">Jelenlévők és meghívottak</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{presentCount} / {attendees.length}</span>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-2">
          {role === "organizer" && workspace.meetingMode === "teams" && <MeetingTeamsAttendancePanel meetingId={meetingId} accessToken={accessToken} workspace={workspace} locked={locked} refreshWorkspace={refreshWorkspace} setStatus={setStatus} />}

          {role === "organizer" && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] leading-4 text-slate-500">A jelenléti ív folyamatosan mentődik, és bekerül a lezárt jegyzőkönyvbe.</div>
              <button
                type="button"
                onClick={() => { setForm(emptyForm()); setFormOpen(true); }}
                disabled={locked}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UserPlus size={13} /> Jelenlévő hozzáadása
              </button>
            </div>
          )}

          {formOpen && role === "organizer" && (
            <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-black text-teal-900">{form.id ? "Jelenlévő szerkesztése" : "Új jelenlévő"}</div>
                <button type="button" onClick={resetForm} className="rounded-lg p-1 text-slate-500 hover:bg-white"><X size={14} /></button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Név *" className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500" />
                <input value={form.organization} onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))} placeholder="Cég / szervezet" className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500" />
                <input value={form.functionTitle} onChange={(event) => setForm((current) => ({ ...current, functionTitle: event.target.value }))} placeholder="Beosztás / szerepkör" className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500" />
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="E-mail" className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500" />
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefonszám" className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500" />
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AttendanceStatus }))} className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500">
                  {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={form.participationMode} onChange={(event) => setForm((current) => ({ ...current, participationMode: event.target.value as ParticipationMode }))} className="rounded-lg border border-teal-200 px-3 py-2 text-[11px] outline-none focus:border-teal-500">
                  <option value="online">Online / Teams</option>
                  <option value="in_person">Személyes részvétel</option>
                </select>
                <label className="text-[9px] font-bold text-slate-500">Érkezés<input type="time" value={form.arrivalTime} onChange={(event) => setForm((current) => ({ ...current, arrivalTime: event.target.value }))} className="mt-1 w-full rounded-lg border border-teal-200 px-3 py-2 text-[11px]" /></label>
                <label className="text-[9px] font-bold text-slate-500">Távozás<input type="time" value={form.departureTime} onChange={(event) => setForm((current) => ({ ...current, departureTime: event.target.value }))} className="mt-1 w-full rounded-lg border border-teal-200 px-3 py-2 text-[11px]" /></label>
              </div>
              <div className="mt-3 flex flex-wrap gap-4"><label className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-700"><input type="checkbox" checked={form.external} onChange={(event) => setForm((current) => ({ ...current, external: event.target.checked }))} /> Külsős / vendég résztvevő</label>{workspace.projectId && <label className="inline-flex items-center gap-2 text-[10px] font-bold text-teal-800"><input type="checkbox" checked={saveToProject} onChange={(event) => setSaveToProject(event.target.checked)} /> Mentés a projekt állandó tagjai közé is</label>}</div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={resetForm} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600">Mégse</button>
                <button type="button" onClick={() => void saveAttendee()} disabled={saving || locked} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Check size={13} /> {saving ? "Mentés..." : "Mentés"}</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {attendees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-500">Még nincs rögzített jelenlévő.</div>
            ) : attendees.map((attendee) => (
              <article key={attendee.id} className="border-b border-slate-100 bg-white px-1 py-2 last:border-b-0">
                <div className="flex items-start gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-black text-teal-800">{attendee.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-black text-slate-900">{attendee.name}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black ${STATUS_CLASS[attendee.status]}`}>{STATUS_LABEL[attendee.status]}</span>
                      {attendee.external && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[8px] font-black text-violet-800">Külsős</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold text-slate-500">
                      {(attendee.organization || attendee.functionTitle) && <span className="inline-flex items-center gap-1"><Building2 size={10} /> {[attendee.organization, attendee.functionTitle].filter(Boolean).join(" · ")}</span>}
                      <span className="inline-flex items-center gap-1">{attendee.participationMode === "online" ? <Monitor size={10} /> : <MapPin size={10} />} {attendee.participationMode === "online" ? "Online" : "Személyes"}</span>
                      {(attendee.arrivalTime || attendee.departureTime) && <span className="inline-flex items-center gap-1"><Clock3 size={10} /> {attendee.arrivalTime || "-"} – {attendee.departureTime || "-"}</span>}
                      {role === "organizer" && attendee.email && <span className="inline-flex items-center gap-1"><Mail size={10} /> {attendee.email}</span>}
                      {attendee.source && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-600">Forrás: {attendee.source === "teams_invite" ? "Teams meghívó" : attendee.source === "teams_attendance" ? "Teams jelenléti jelentés" : attendee.source === "project" ? "Projektadatlap" : "Kézi"}</span>}
                      {Boolean(attendee.totalAttendanceSeconds) && <span className="inline-flex items-center gap-1"><Clock3 size={10} /> Összesen: {Math.floor((attendee.totalAttendanceSeconds || 0) / 3600)} ó {Math.round(((attendee.totalAttendanceSeconds || 0) % 3600) / 60)} p</span>}
                    </div>
                  </div>
                  {role === "organizer" && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => editAttendee(attendee)} disabled={locked} title="Szerkesztés" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><Pencil size={12} /></button>
                      <button type="button" onClick={() => void removeAttendee(attendee)} disabled={locked} title="Törlés" className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
