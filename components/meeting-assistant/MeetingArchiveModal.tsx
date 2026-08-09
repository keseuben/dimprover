"use client";

import { Archive, Download, FileText, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MeetingArchiveItem, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type ArchiveResponse = { ok: boolean; meetings?: MeetingArchiveItem[]; workspace?: MeetingWorkspace; continuousText?: string; error?: string };

export default function MeetingArchiveModal({ meetingId, accessToken, role, onClose }: { meetingId: string; accessToken: string; role: MeetingViewRole; onClose: () => void }) {
  const [meetings, setMeetings] = useState<MeetingArchiveItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<MeetingWorkspace | null>(null);
  const [preview, setPreview] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function params(extra: Record<string, string> = {}) {
    const result = new URLSearchParams({ currentMeetingId: meetingId, ...extra });
    if (accessToken) result.set("accessToken", accessToken);
    return result;
  }

  useEffect(() => {
    fetch(`/api/meeting-assistant/archive?${params().toString()}`, { cache: "no-store" })
      .then((response) => readJsonResponse<ArchiveResponse>(response, "A korábbi dokumentumok nem tölthetők be."))
      .then((data) => {
        const rows = data.meetings || [];
        setMeetings(rows);
        setSelectedId((rows.find((item) => item.meetingId !== meetingId) || rows[0])?.meetingId || "");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Betöltési hiba."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, meetingId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/meeting-assistant/archive?${params({ selectedMeetingId: selectedId }).toString()}`, { cache: "no-store" })
      .then((response) => readJsonResponse<ArchiveResponse>(response, "Az előnézet nem tölthető be."))
      .then((data) => { setDetail(data.workspace || null); setPreview(data.continuousText || ""); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Előnézeti hiba."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("hu-HU");
    return value ? meetings.filter((item) => item.searchText.includes(value)) : meetings;
  }, [meetings, query]);

  function exportUrl(format: "pdf" | "docx") {
    return `/api/meeting-assistant/archive-export?${params({ targetMeetingId: selectedId, format, includePrivate: role === "organizer" ? "1" : "0" }).toString()}`;
  }

  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><Archive size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-slate-950">Korábbi értekezleti dokumentumok</h2><p className="text-[10px] text-slate-500">Emlékeztetők, jegyzőkönyvek és egyeztetési feljegyzések.</p></div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 p-2"><X size={16} /></button>
        </header>
        {error && <div className="bg-rose-50 px-4 py-2 text-[10px] font-semibold text-rose-800">{error}</div>}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr]">
          <aside className="min-h-0 border-r border-slate-200 bg-slate-50 p-3">
            <label className="relative block"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés..." className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2 text-[10px]" /></label>
            <div className="mt-2 h-[calc(100%-42px)] space-y-1.5 overflow-y-auto">
              {filtered.map((item) => <button key={item.meetingId} type="button" onClick={() => setSelectedId(item.meetingId)} className={`w-full rounded-lg border p-2.5 text-left ${selectedId === item.meetingId ? "border-teal-400 bg-white" : "border-slate-200 bg-white/70"}`}><div className="truncate text-[10px] font-black">{item.minuteNumber || item.title}</div><div className="truncate text-[9px] text-slate-600">{item.documentLabel} · {item.meetingTypeCode}</div><div className="mt-1 text-[8px] text-slate-500">{new Date(item.closedAt || item.updatedAt).toLocaleString("hu-HU")} · {item.minuteTakerName || item.organizerName}</div></button>)}
            </div>
          </aside>
          <main className="min-h-0 overflow-y-auto p-4">
            {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-teal-700" /></div> : detail ? <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3"><div><div className="text-[9px] font-black uppercase text-teal-700">{detail.documentLabel}</div><h3 className="text-lg font-black">{detail.minuteNumber || detail.title}</h3><div className="text-[10px] text-slate-500">{detail.projectName} · {detail.meetingType}</div></div><div className="flex gap-2"><a href={exportUrl("pdf")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-3 py-2 text-[9px] font-black text-white"><Download size={12} /> PDF</a><a href={exportUrl("docx")} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-2 text-[9px] font-black text-white"><Download size={12} /> DOCX</a></div></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]"><div className="bg-slate-50 p-2"><b>Értekezletvezető</b><div>{detail.chairpersonName || "-"}</div></div><div className="bg-slate-50 p-2"><b>Jegyzőkönyvvezető</b><div>{detail.minuteTakerName || "-"}</div></div><div className="bg-slate-50 p-2"><b>Jóváhagyó</b><div>{detail.approverName || "-"}</div></div></div>
              <div className="meeting-notebook-sheet mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-[11px] leading-6"><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase text-amber-800"><FileText size={14} /> Összefüggő dokumentum</div><pre className="whitespace-pre-wrap font-sans">{preview}</pre></div>
            </> : <div className="flex h-full items-center justify-center text-[11px] text-slate-500">Nincs kiválasztott dokumentum.</div>}
          </main>
        </div>
      </div>
    </div>
  );
}
