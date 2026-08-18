"use client";
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, ChevronUp, Compass, MapPin, Mic, PencilLine, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import VoiceNotePanel from "./VoiceNotePanel";
import type { FieldCaptureItem } from "@/app/lib/field-capture/types";

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function locationLabel(item: FieldCaptureItem) {
  if (!item.options.gpsEnabled || item.location.status === "OFF") return "GPS ki";
  if (item.location.status === "REQUESTING") return "GPS mérés…";
  if (item.location.accuracyMeters !== null) return `GPS ±${Math.round(item.location.accuracyMeters)} m${item.location.status === "LOW_ACCURACY" ? " · gyenge" : ""}`;
  if (item.location.status === "DENIED") return "GPS tiltva";
  return "GPS nem elérhető";
}
function orientationLabel(item: FieldCaptureItem) {
  if (!item.options.orientationEnabled || item.orientation.status === "OFF") return "Kamerairány ki";
  if (item.orientation.status === "REQUESTING") return "Kamerairány mérés…";
  if (item.orientation.headingDegrees !== null) return `${item.orientation.directionLabel || "Irány"} · ${Math.round(item.orientation.headingDegrees)}°${item.orientation.status === "UNSTABLE" ? " · bizonytalan" : ""}`;
  if (item.orientation.status === "DENIED") return "Kamerairány tiltva";
  return "Kamerairány nem elérhető";
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

export default function CapturePreviewCard({ item, reviewMode = false, onNoteChange, onVoiceCommit, onEdit, onRemeasureLocation, onRemeasureOrientation, onDelete }: {
  item: FieldCaptureItem;
  reviewMode?: boolean;
  onNoteChange: (value: string) => void;
  onVoiceCommit: (value: string) => void;
  onEdit: () => void;
  onRemeasureLocation: () => void;
  onRemeasureOrientation: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(reviewMode || item.options.voiceNoteEnabled);
  useEffect(() => { if (reviewMode) setExpanded(true); }, [reviewMode]);

  return (
    <article data-field-capture-item className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-3 p-3 text-left">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-bold text-slate-400">Kép</div>}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">#{item.sequence}</span><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">{statusLabel(item.status)}</span>{item.edited ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">Szerkesztve · v{item.editRevision}</span> : null}</div>
          <strong className="mt-2 block truncate text-sm text-slate-950">{item.displayName}</strong>
          <span className="mt-1 block text-xs text-slate-500">{fileSize(item.originalSize)} → {fileSize(item.uploadSize)}{item.optimized ? " · optimalizálva" : ""}</span>
          {item.status === "UPLOADING" ? <div className="mt-2"><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600 transition-[width]" style={{ width: Math.max(0, Math.min(100, item.progress)) + "%" }} /></div><span className="mt-1 block text-[10px] font-black text-cyan-700">Feltöltés {Math.round(item.progress)}%</span></div> : null}
          {(item.status === "ERROR" || item.status === "DESTINATION_PENDING") && item.error ? <span className="mt-2 block text-[10px] font-bold leading-4 text-amber-800">{item.error}</span> : null}
        </div>
        {expanded ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
      </button>
      {expanded ? (
        <div className="border-t border-slate-100 p-3">
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${item.location.status === "READY" ? "bg-emerald-50 text-emerald-800" : item.location.status === "LOW_ACCURACY" ? "bg-amber-50 text-amber-800" : item.options.gpsEnabled ? "bg-cyan-50 text-cyan-800" : "bg-slate-50 text-slate-500"}`}><MapPin size={12} /> {locationLabel(item)}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${item.orientation.status === "READY" ? "bg-emerald-50 text-emerald-800" : item.orientation.status === "UNSTABLE" ? "bg-amber-50 text-amber-800" : item.options.orientationEnabled ? "bg-cyan-50 text-cyan-800" : "bg-slate-50 text-slate-500"}`}><Compass size={12} /> {orientationLabel(item)}</span>
            {item.options.voiceNoteEnabled ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800"><Mic size={12} /> Hangos megjegyzés</span> : null}
            {item.options.saveToDevice ? <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800"><Smartphone size={12} /> Telefonra mentés</span> : null}
          </div>

          <button type="button" onClick={onEdit} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-sm font-black text-violet-900"><PencilLine size={17} /> Kép szerkesztése / jelölése</button>

          {(item.options.gpsEnabled || item.options.orientationEnabled) ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {item.options.gpsEnabled ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500">GPS helyadat</p><p className="mt-1 text-xs font-bold text-slate-700">{locationLabel(item)}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{item.location.detail}</p>{item.location.latitude !== null && item.location.longitude !== null ? <p className="mt-1 font-mono text-[10px] text-slate-400">{item.location.latitude.toFixed(6)}, {item.location.longitude.toFixed(6)}</p> : null}{item.location.status === "DENIED" ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold leading-4 text-amber-900">Chrome: webhelyinformáció → Engedélyek → Hely → Engedélyezés, majd GPS újramérés.</p> : null}<button type="button" onClick={onRemeasureLocation} disabled={item.location.status === "REQUESTING"} className="mt-2 rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-cyan-800 disabled:opacity-50">GPS újramérés</button></div> : null}
            {item.options.orientationEnabled ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500">Hátlapi kamera iránya</p><p className="mt-1 text-xs font-bold text-slate-700">{orientationLabel(item)}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{item.orientation.detail}</p><button type="button" onClick={onRemeasureOrientation} disabled={item.orientation.status === "REQUESTING"} className="mt-2 rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-cyan-800 disabled:opacity-50">Kamerairány újramérés</button></div> : null}
          </div> : null}

          <label className="mt-3 block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Megjegyzés a képhez</span><textarea value={item.note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Pl. repedés a nyílászáró felett, javítandó..." className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] leading-6 text-slate-800 outline-none focus:border-cyan-500" /></label>
          <div className="mt-2"><VoiceNotePanel value={item.note} onCommit={onVoiceCommit} autoSuggested={item.options.voiceNoteEnabled} /></div>
          <details className="mt-3 rounded-2xl bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-black text-slate-600">Kép technikai adatai</summary><p className="mt-2 break-all text-[11px] leading-5 text-slate-500">Eredeti: {item.originalName}</p><p className="text-[11px] leading-5 text-slate-500">{item.optimizationNote}</p>{item.width && item.height ? <p className="text-[11px] leading-5 text-slate-500">Képméret: {item.width} × {item.height}px</p> : null}</details>
          <button type="button" onClick={onDelete} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-800"><Trash2 size={16} /> Kép eltávolítása</button>
        </div>
      ) : null}
    </article>
  );
}
