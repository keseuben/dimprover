"use client";
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, ChevronUp, Compass, MapPin, Mic, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import VoiceNotePanel from "./VoiceNotePanel";
import type { FieldCaptureItem } from "@/app/lib/field-capture/types";

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function statusLabel(status: FieldCaptureItem["status"]) {
  if (status === "LOCAL_ONLY") return "Csak ezen az eszközön";
  if (status === "QUEUED") return "Várakozik szinkronra";
  if (status === "UPLOADING") return "Feltöltés alatt";
  if (status === "SERVER_STORED") return "DIMPRO-ba mentve";
  if (status === "DESTINATION_PENDING") return "Célhely mentése folyamatban";
  if (status === "SYNCED") return "Minden cél kész";
  return "Hiba";
}

export default function CapturePreviewCard({ item, onNoteChange, onVoiceCommit, onDelete }: {
  item: FieldCaptureItem;
  onNoteChange: (value: string) => void;
  onVoiceCommit: (value: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(item.options.voiceNoteEnabled);
  return (
    <article data-field-capture-item className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-3 p-3 text-left">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-bold text-slate-400">Kép</div>}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">#{item.sequence}</span><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">{statusLabel(item.status)}</span></div>
          <strong className="mt-2 block truncate text-sm text-slate-950">{item.displayName}</strong>
          <span className="mt-1 block text-xs text-slate-500">{fileSize(item.originalSize)} → {fileSize(item.uploadSize)}{item.optimized ? " · optimalizálva" : ""}</span>
        </div>
        {expanded ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
      </button>
      {expanded ? (
        <div className="border-t border-slate-100 p-3">
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${item.options.gpsEnabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}><MapPin size={12} /> GPS {item.options.gpsEnabled ? "kérve" : "ki"}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${item.options.orientationEnabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}><Compass size={12} /> Tájolás {item.options.orientationEnabled ? "kérve" : "ki"}</span>
            {item.options.voiceNoteEnabled ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800"><Mic size={12} /> Hangos megjegyzés</span> : null}
            {item.options.saveToDevice ? <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800"><Smartphone size={12} /> Telefonra mentés</span> : null}
          </div>
          <label className="mt-3 block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Megjegyzés a képhez</span><textarea value={item.note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Pl. repedés a nyílászáró felett, javítandó..." className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] leading-6 text-slate-800 outline-none focus:border-cyan-500" /></label>
          <div className="mt-2"><VoiceNotePanel value={item.note} onCommit={onVoiceCommit} autoSuggested={item.options.voiceNoteEnabled} /></div>
          <details className="mt-3 rounded-2xl bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-black text-slate-600">Kép technikai adatai</summary><p className="mt-2 break-all text-[11px] leading-5 text-slate-500">Eredeti: {item.originalName}</p><p className="text-[11px] leading-5 text-slate-500">{item.optimizationNote}</p>{item.width && item.height ? <p className="text-[11px] leading-5 text-slate-500">Képméret: {item.width} × {item.height}px</p> : null}</details>
          <button type="button" onClick={onDelete} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-800"><Trash2 size={16} /> Kép eltávolítása</button>
        </div>
      ) : null}
    </article>
  );
}
