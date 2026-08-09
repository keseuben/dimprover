"use client";

import { Archive, CalendarClock, CheckCircle2, Download, FileText, FolderOpen, MapPin, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { MeetingArchiveItem, MeetingStatus } from "@/app/lib/meeting-assistant/types";
import MeetingDeleteConfirmModal from "./MeetingDeleteConfirmModal";
import { readJsonResponse } from "./safeJson";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  active: "Folyamatban",
  draft_closed: "Lezárt piszkozat",
  pending_approval: "Jóváhagyásra vár",
  published: "Közzétett",
  archived: "Archivált",
};

const STATUS_CLASS: Record<MeetingStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  draft_closed: "border-slate-200 bg-slate-100 text-slate-700",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-800",
  published: "border-sky-200 bg-sky-50 text-sky-800",
  archived: "border-violet-200 bg-violet-50 text-violet-800",
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MeetingArchiveClient({ meetings, accessToken }: { meetings: MeetingArchiveItem[]; accessToken: string }) {
  const [rows, setRows] = useState(meetings);
  const [deleteTarget, setDeleteTarget] = useState<MeetingArchiveItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MeetingStatus | "all">("all");
  const [project, setProject] = useState("all");
  const [meetingType, setMeetingType] = useState("all");

  const projects = useMemo(
    () => [...new Set(rows.map((item) => item.projectName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "hu")),
    [rows],
  );

  const meetingTypes = useMemo(
    () => [...new Set(rows.map((item) => item.meetingType).filter(Boolean))].sort((a, b) => a.localeCompare(b, "hu")),
    [rows],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return rows.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (project !== "all" && item.projectName !== project) return false;
      if (meetingType !== "all" && item.meetingType !== meetingType) return false;
      if (normalized && !item.searchText.includes(normalized)) return false;
      return true;
    });
  }, [meetingType, project, query, rows, status]);

  const closedCount = rows.filter((item) => item.status !== "active").length;
  const publishedCount = rows.filter((item) => item.status === "published").length;
  const openTaskCount = rows.reduce((sum, item) => sum + item.openTaskCount, 0);

  async function confirmDelete(confirmationTitle: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/meeting-assistant/archive", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentMeetingId: "meeting-assistant-home", selectedMeetingId: deleteTarget.meetingId, accessToken, confirmationTitle, actorName: "Szervező" }),
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(response, "Az értekezlet törlése sikertelen.");
      if (!response.ok || !data.ok) throw new Error(data.error || "Az értekezlet törlése sikertelen.");
      setRows((current) => current.filter((item) => item.meetingId !== deleteTarget.meetingId));
      setNotice(`A(z) ${deleteTarget.title} értekezlet véglegesen törölve lett.`);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Az értekezlet törlése sikertelen.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eef5f3] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-3xl border border-teal-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,118,110,0.10)] sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-teal-700"><Archive size={16} /> DIMPRO értekezleti archívum</div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">Értekezletek és jegyzőkönyvi munkaterek</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">A folyamatban lévő, lezárt, jóváhagyásra váró és archivált értekezletek központi, visszakereshető nyilvántartása.</p>
            </div>
            <Link href="/ertekezleti-kisero" className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white hover:bg-teal-600">
              <CalendarClock size={16} /> Új / aktuális értekezlet
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-bold text-slate-500">Összes értekezlet</div><div className="mt-1 text-2xl font-black text-slate-950">{rows.length}</div></div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="text-xs font-bold text-sky-700">Lezárt / közzétett</div><div className="mt-1 text-2xl font-black text-sky-950">{closedCount} / {publishedCount}</div></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-bold text-amber-700">Rögzített feladatok és határidők</div><div className="mt-1 text-2xl font-black text-amber-950">{openTaskCount}</div></div>
          </div>
        </header>
        {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div>}

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_210px_250px_250px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés címre, projektre, résztvevőre, feladatra, fájlnévre vagy szövegre..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-teal-400" />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as MeetingStatus | "all")} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-400">
              <option value="all">Minden státusz</option>
              {(Object.keys(STATUS_LABEL) as MeetingStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
            </select>
            <select value={project} onChange={(event) => setProject(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-400">
              <option value="all">Minden projekt</option>
              {projects.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={meetingType} onChange={(event) => setMeetingType(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-400">
              <option value="all">Minden értekezlettípus</option>
              {meetingTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-500">Találatok: {filtered.length}</div>
        </section>

        <section className="mt-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Nincs a szűrésnek megfelelő értekezlet.</div>
          ) : filtered.map((item) => (
            <article key={item.meetingId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md sm:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    {item.snapshotVersion > 0 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600">Snapshot v{item.snapshotVersion}</span>}
                  </div>
                  <h2 className="mt-2 truncate text-xl font-black text-slate-950">{item.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1"><FolderOpen size={13} /> {item.projectCode ? `${item.projectCode} · ` : ""}{item.projectName}</span>
                    <span className="inline-flex items-center gap-1"><Users size={13} /> {item.organizerName}{item.participants.length ? ` + ${item.participants.length} résztvevő` : ""}</span>
                    <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {formatDate(item.closedAt || item.updatedAt)}</span>
                    <span>{item.meetingType}</span>
                    {item.meetingLocation && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {item.meetingLocation}</span>}
                    {(item.minuteNumber || item.documentId) && <span>Jegyzőkönyv: {item.minuteNumber || item.documentId}</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs"><b>{item.attachmentCount}</b><span className="ml-1 text-slate-500">melléklet</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs"><b>{item.actionCount}</b><span className="ml-1 text-slate-500">elem</span></div>
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>{item.openTaskCount}</b><span className="ml-1">feladat</span></div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><b>{item.decisionCount}</b><span className="ml-1">döntés</span></div>
                    <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900"><b>{item.transcriptCount}</b><span className="ml-1">átiratsor</span></div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 xl:w-56 xl:flex-col">
                  <Link href={`/ertekezleti-kisero?meetingId=${encodeURIComponent(item.meetingId)}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white hover:bg-slate-800"><FileText size={15} /> Munkatér megnyitása</Link>
                  <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(item); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700 hover:bg-rose-100"><Trash2 size={15} /> Értekezlet törlése</button>
                  <div className="grid grid-cols-2 gap-2">
                    <a href={`/api/meeting-assistant/export?meetingId=${encodeURIComponent(item.meetingId)}&format=pdf&includePrivate=1`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[10px] font-black text-rose-700"><Download size={12} /> PDF</a>
                    <a href={`/api/meeting-assistant/export?meetingId=${encodeURIComponent(item.meetingId)}&format=docx&includePrivate=1`} className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-[10px] font-black text-blue-700"><Download size={12} /> DOCX</a>
                  </div>
                  {item.previousMeetingId && <Link href={`/ertekezleti-kisero?meetingId=${encodeURIComponent(item.previousMeetingId)}`} className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black text-slate-600">Előző értekezlet</Link>}
                  {item.status === "published" && <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800"><CheckCircle2 size={15} /> Közzétett állapot</span>}
                </div>
              </div>
            </article>
          ))}
        </section>
        {deleteTarget && <MeetingDeleteConfirmModal
          kind="meeting"
          name={deleteTarget.title}
          description="Az értekezleti munkatér, a feltöltött mellékletek, a snapshotok és az ideiglenes hozzáférési kódok is véglegesen törlődnek."
          deleting={deleting}
          errorMessage={deleteError}
          onClose={() => { if (!deleting) { setDeleteError(""); setDeleteTarget(null); } }}
          onConfirm={confirmDelete}
        />}
      </div>
    </div>
  );
}
