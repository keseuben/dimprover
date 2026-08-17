"use client";

import { Camera, Compass, Images, MapPin, Mic, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import CaptureSaveTargets from "./CaptureSaveTargets";
import CaptureToggleRow from "./CaptureToggleRow";
import type { PreCaptureOptions } from "@/app/lib/field-capture/types";

export default function PreCaptureOptionsSheet({ open, value, onClose, onReset, onChoose }: {
  open: boolean;
  value: PreCaptureOptions;
  onClose: () => void;
  onReset: () => void;
  onChoose: (options: PreCaptureOptions, source: "camera" | "gallery") => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/35 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Fényképezés előtti beállítások">
      <button type="button" aria-label="Bezárás" onClick={onClose} className="absolute inset-0" />
      <section className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-cyan-100 bg-[#f8fcfc] p-4 shadow-2xl sm:max-w-xl sm:rounded-[2rem] sm:p-5">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.15em] text-cyan-800">Kép előtti gyors beállítás</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Mit rögzítsen ehhez a képhez?</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">A kép akkor is elkészíthető, ha minden opcionális adat ki van kapcsolva.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600" aria-label="Bezárás"><X size={18} /></button>
        </div>

        <div className="mt-4 space-y-2">
          <CaptureToggleRow title="GPS helyadat" description="Képenként külön kérhető. A tényleges mérés P5-ben aktiválódik; most a capture-kérés kerül mentésre." checked={draft.gpsEnabled} onChange={(checked) => setDraft({ ...draft, gpsEnabled: checked })} badge="P5 előkészítve" />
          <CaptureToggleRow title="Telefon iránya / tájolás" description="A GPS-től független kapcsoló. Heading mérés a P6 fázisban." checked={draft.orientationEnabled} onChange={(checked) => setDraft({ ...draft, orientationEnabled: checked })} badge="P6 előkészítve" />
          <CaptureToggleRow title="Hangos megjegyzés" description="A kép után felajánlja a már működő DIMPRO böngészős diktálási sessiont." checked={draft.voiceNoteEnabled} onChange={(checked) => setDraft({ ...draft, voiceNoteEnabled: checked })} />
          {draft.voiceNoteEnabled ? (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-violet-100 bg-violet-50 p-2">
              <button type="button" onClick={() => setDraft({ ...draft, transcriptMode: "raw" })} className={`rounded-xl px-3 py-2 text-xs font-black ${draft.transcriptMode === "raw" ? "bg-violet-700 text-white" : "bg-white text-slate-600"}`}>Nyers átirat</button>
              <button type="button" onClick={() => setDraft({ ...draft, transcriptMode: "cleaned" })} className={`rounded-xl px-3 py-2 text-xs font-black ${draft.transcriptMode === "cleaned" ? "bg-violet-700 text-white" : "bg-white text-slate-600"}`}>Tisztázott / DIMPRO</button>
            </div>
          ) : null}
        </div>

        <div className="mt-5"><p className="mb-2 text-[11px] font-black uppercase tracking-[.14em] text-slate-500">Mentési célok</p><CaptureSaveTargets value={draft} onChange={setDraft} /></div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={draft.rememberForSession} onChange={(event) => setDraft({ ...draft, rememberForSession: event.target.checked })} className="mt-0.5 h-5 w-5 accent-teal-700" />
            <span><strong className="block text-sm text-slate-950">Ezek legyenek az alapbeállítások ebben a munkamenetben</strong><span className="mt-1 block text-xs leading-5 text-slate-500">A következő képnél is ezeket ajánlja fel, de képenként bármikor felülírhatók.</span></span>
          </label>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onChoose(draft, "camera")} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-teal-800 px-4 text-sm font-black text-white shadow-lg shadow-teal-900/10"><Camera size={20} /> Kamera</button>
          <button type="button" onClick={() => onChoose(draft, "gallery")} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-white px-4 text-sm font-black text-cyan-900"><Images size={20} /> Galéria</button>
        </div>
        <button type="button" onClick={onReset} className="mt-3 inline-flex w-full items-center justify-center gap-2 py-2 text-xs font-black text-slate-500"><RotateCcw size={15} /> Alapbeállítások visszaállítása</button>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-500">
          <span className="rounded-xl bg-white p-2"><MapPin size={14} className="mx-auto mb-1" />GPS külön</span>
          <span className="rounded-xl bg-white p-2"><Compass size={14} className="mx-auto mb-1" />Tájolás külön</span>
          <span className="rounded-xl bg-white p-2"><Mic size={14} className="mx-auto mb-1" />Voice shared</span>
        </div>
      </section>
    </div>
  );
}
