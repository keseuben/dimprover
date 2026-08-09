"use client";

import { FolderPlus, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingProjectProfile } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

function projectIdFrom(code: string, name: string) {
  return `${code || name}-${Date.now()}`.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);
}

export default function MeetingProjectCreateModal({ accessToken, onClose, onCreated }: { accessToken: string; onClose: () => void; onCreated: (profile: MeetingProjectProfile) => void | Promise<void> }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectManager, setProjectManager] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const valid = useMemo(() => name.trim().length >= 2 && code.trim().length >= 1, [code, name]);

  async function createProject() {
    if (!valid || saving) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/meeting-assistant/project-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId: "meeting-assistant-home",
          accessToken,
          action: "upsert_project",
          project: {
            projectId: projectIdFrom(code, name),
            code: code.trim(),
            name: name.trim(),
            location: location.trim(),
            clientName: clientName.trim(),
            projectManager: projectManager.trim(),
            startDate,
            endDate,
            status: "active",
            defaultMeetingType: "Általános egyeztetés",
          },
        }),
      });
      const data = await readJsonResponse<{ ok?: boolean; profile?: MeetingProjectProfile; error?: string }>(response, "A projekt létrehozása sikertelen.");
      if (!response.ok || !data.ok || !data.profile) throw new Error(data.error || "A projekt létrehozása sikertelen.");
      await onCreated(data.profile);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A projekt létrehozása sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Új projekt létrehozása">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-200 p-5 sm:p-6"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-800"><FolderPlus size={24} /></span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950">Új projekt létrehozása</h2><p className="mt-1 text-sm text-slate-500">A projekt ezután megjelenik az Értekezleti Kísérő projektlistájában.</p></div><button type="button" onClick={onClose} title="Bezárás" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><X size={20} /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-black text-slate-700">Projektkód *<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={120} placeholder="Például: DIM-2026-01" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-black text-slate-700">Projekt neve *<input value={name} onChange={(event) => setName(event.target.value)} maxLength={240} placeholder="Projekt megnevezése" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-black text-slate-700 sm:col-span-2">Helyszín<input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={240} placeholder="Település, cím vagy munkaterület" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-black text-slate-700">Megrendelő<input value={clientName} onChange={(event) => setClientName(event.target.value)} maxLength={240} placeholder="Megrendelő szervezet" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-black text-slate-700">Projektvezető<input value={projectManager} onChange={(event) => setProjectManager(event.target.value)} maxLength={180} placeholder="Név" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-black text-slate-700">Projekt kezdete<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-black text-slate-700">Tervezett befejezés<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" /></label>
          </div>
          {status && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{status}</div>}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:px-6"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">Mégse</button><button type="button" onClick={() => void createProject()} disabled={!valid || saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 size={17} className="animate-spin" /> : <FolderPlus size={17} />} Projekt létrehozása</button></footer>
      </div>
    </div>
  );
}
