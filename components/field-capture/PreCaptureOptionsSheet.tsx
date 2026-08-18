"use client";

import { Camera, Compass, Images, MapPin, Mic, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getFieldLocationPermissionState, requestFieldLocationPermission, requestFieldOrientationPermission, type FieldLocationPermissionState } from "@/app/lib/field-capture/captureSensors";
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
  type LocationPermissionUiState = FieldLocationPermissionState | "checking" | "requesting";
  const [draft, setDraft] = useState(value);
  const [locationPermissionState, setLocationPermissionState] = useState<LocationPermissionUiState>("checking");
  const [locationPermissionMessage, setLocationPermissionMessage] = useState("");
  const [orientationPermissionMessage, setOrientationPermissionMessage] = useState("");

  function locationMessage(state: FieldLocationPermissionState) {
    if (state === "granted") return "Helyhozzáférés engedélyezve ehhez a DIMPRO webhelyhez.";
    if (state === "prompt") return "A webhely még nem kapott külön helyhozzáférési engedélyt.";
    if (state === "denied") return "A helyhozzáférés ennél a webhelynél tiltva van.";
    if (state === "unavailable") return "A készülék vagy a böngésző nem biztosít helymeghatározást.";
    return "A böngésző nem jelzi előre az engedély állapotát; külön engedélykéréssel ellenőrizhető.";
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDraft(value);
    setOrientationPermissionMessage("");
    setLocationPermissionState("checking");
    setLocationPermissionMessage("Helyhozzáférés ellenőrzése…");
    void getFieldLocationPermissionState().then((state) => {
      if (cancelled) return;
      setLocationPermissionState(state);
      setLocationPermissionMessage(locationMessage(state));
    });
    return () => { cancelled = true; };
  }, [open, value]);

  async function toggleGps(checked: boolean) {
    setDraft((current) => ({ ...current, gpsEnabled: checked }));
    if (!checked) return;
    setLocationPermissionState("checking");
    setLocationPermissionMessage("Helyhozzáférés ellenőrzése…");
    const state = await getFieldLocationPermissionState();
    setLocationPermissionState(state);
    setLocationPermissionMessage(locationMessage(state));
  }

  async function requestGpsPermission() {
    setLocationPermissionState("requesting");
    setLocationPermissionMessage("A böngésző helyhozzáférési engedélyére várunk…");
    const result = await requestFieldLocationPermission();
    setLocationPermissionState(result.state);
    if (result.state === "granted") {
      const accuracy = result.sample?.accuracyMeters;
      setLocationPermissionMessage(
        accuracy !== null && accuracy !== undefined
          ? `Helyhozzáférés engedélyezve · próbamérés ±${Math.round(accuracy)} m.`
          : "Helyhozzáférés engedélyezve ehhez a DIMPRO webhelyhez.",
      );
      return;
    }
    setLocationPermissionMessage(locationMessage(result.state));
  }

  async function toggleOrientation(checked: boolean) {
    if (!checked) { setDraft((current) => ({ ...current, orientationEnabled: false })); setOrientationPermissionMessage(""); return; }
    const permission = await requestFieldOrientationPermission();
    if (permission === "denied") {
      setDraft((current) => ({ ...current, orientationEnabled: false }));
      setOrientationPermissionMessage("A tájolási szenzor engedélyét a böngésző nem adta meg.");
      return;
    }
    if (permission === "unavailable") {
      setDraft((current) => ({ ...current, orientationEnabled: true }));
      setOrientationPermissionMessage("A böngésző nem jelez tájolási API-t; a kép mentése ettől még működik.");
      return;
    }
    setDraft((current) => ({ ...current, orientationEnabled: true }));
    setOrientationPermissionMessage(permission === "granted" ? "Tájolási szenzor engedélyezve." : "Tájolási szenzor használatra kész.");
  }

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
          <CaptureToggleRow title="GPS helyadat" description="Képenként külön mérés készül, pontossággal és időbélyeggel. Gyenge GPS esetén figyelmeztetést kap." checked={draft.gpsEnabled} onChange={(checked) => void toggleGps(checked)} badge="aktív" />
          {draft.gpsEnabled ? (
            <div data-terep-location-permission className={`rounded-2xl border p-3 ${locationPermissionState === "granted" ? "border-emerald-200 bg-emerald-50" : locationPermissionState === "denied" ? "border-amber-200 bg-amber-50" : "border-cyan-200 bg-cyan-50"}`}>
              <div className="flex items-start gap-2">
                <MapPin size={16} className={`mt-0.5 shrink-0 ${locationPermissionState === "granted" ? "text-emerald-700" : locationPermissionState === "denied" ? "text-amber-700" : "text-cyan-700"}`} />
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs text-slate-900">Böngésző helyhozzáférés</strong>
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">{locationPermissionMessage}</p>
                </div>
              </div>
              {locationPermissionState !== "granted" ? (
                <button
                  data-terep-location-permission-button
                  type="button"
                  onClick={() => void requestGpsPermission()}
                  disabled={locationPermissionState === "requesting" || locationPermissionState === "checking"}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-white px-3 text-xs font-black text-cyan-900 disabled:opacity-50"
                >
                  <MapPin size={16} />
                  {locationPermissionState === "denied" ? "Engedély ellenőrzése újra" : "Helyhozzáférés engedélyezése"}
                </button>
              ) : (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-center text-xs font-black text-emerald-800">Helyhozzáférés engedélyezve</div>
              )}
              {locationPermissionState === "denied" ? (
                <p className="mt-2 rounded-xl border border-amber-200 bg-white p-2 text-[10px] font-bold leading-4 text-amber-900">
                  Chrome: nyissa meg a webhelyinformációt → Engedélyek → Hely → Engedélyezés, majd nyomja meg az „Engedély ellenőrzése újra” gombot. A kép GPS nélkül is elkészíthető.
                </p>
              ) : null}
            </div>
          ) : null}
          <CaptureToggleRow title="Hátlapi kamera iránya" description="A GPS-től független iránymérés. A rendszer fokértéket és égtájat rögzít, ha a készülék támogatja." checked={draft.orientationEnabled} onChange={(checked) => void toggleOrientation(checked)} badge="aktív" />
          {orientationPermissionMessage ? <p className="px-2 text-[11px] font-semibold leading-5 text-slate-500">{orientationPermissionMessage}</p> : null}
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
          <span className="rounded-xl bg-white p-2"><Compass size={14} className="mx-auto mb-1" />Kamerairány</span>
          <span className="rounded-xl bg-white p-2"><Mic size={14} className="mx-auto mb-1" />Voice shared</span>
        </div>
      </section>
    </div>
  );
}
