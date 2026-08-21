"use client";

import { LoaderCircle, MapPinned, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GpsPhotoMapCalibrationPoint, GpsPhotoMapCalibrationPointType } from "@/app/lib/field-capture/gpsPhotoMap";
import { captureGpsCalibrationPoint, getGpsCalibrationReadiness, GPS_CALIBRATION_POINT_LABELS, type GpsCalibrationProgress } from "@/app/lib/field-capture/gpsPhotoMapCalibration";
import { loadGpsCalibrationPoints, saveGpsCalibrationPoints } from "@/app/lib/field-capture/gpsPhotoMapCalibrationStore";

export default function GpsCalibrationPanel({ sessionId }: { sessionId?: string | null }) {
  const [points, setPoints] = useState<GpsPhotoMapCalibrationPoint[]>([]);
  const [pointType, setPointType] = useState<GpsPhotoMapCalibrationPointType>("CORNER");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<GpsCalibrationProgress | null>(null);
  const [message, setMessage] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    setPoints(loadGpsCalibrationPoints(sessionId));
  }, [sessionId]);

  const readiness = getGpsCalibrationReadiness(points);

  async function capturePoint() {
    if (!sessionId || capturing) return;
    setCapturing(true);
    setProgress({ sampleCount: 0, elapsedMs: 0, targetDurationMs: 8_000, latestAccuracyMeters: null });
    setMessage("GPS mintagyűjtés indul. Maradjon a kijelölt sarok- vagy kitűzési ponton.");
    try {
      const point = await captureGpsCalibrationPoint({
        id: `${sessionId}-${Date.now()}`,
        label: label.trim() || `${GPS_CALIBRATION_POINT_LABELS[pointType]} ${points.length + 1}`,
        type: pointType,
        note,
        durationMs: 8_000,
        onProgress: setProgress,
      });
      const next = [...points, point];
      setPoints(next);
      saveGpsCalibrationPoints(sessionId, next);
      setLabel("");
      setNote("");
      setMessage(`${point.label} rögzítve · ${point.sampleCount} GPS-minta · ${point.accuracyMeters === null ? "pontosság n/a" : `±${Math.round(point.accuracyMeters)} m`}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kalibrációs GPS-pont rögzítése nem sikerült.");
    } finally {
      setCapturing(false);
      setProgress(null);
    }
  }

  function removePoint(id: string) {
    const next = points.filter((point) => point.id !== id);
    setPoints(next);
    saveGpsCalibrationPoints(sessionId, next);
    setMessage("Kalibrációs pont törölve.");
  }

  return (
    <section data-gps-calibration-foundation="true" className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.12em] text-violet-700">Tervillesztési előkészítés</p>
          <h4 className="mt-1 text-sm font-black text-slate-950">Kalibrációs pontok</h4>
          <p className="mt-1 max-w-2xl text-[11px] font-semibold leading-5 text-slate-600">Minimum 3 helyszíni sarok-, kitűzési vagy referencia pont szükséges. A rögzített R pontokat az alábbi Tervlap-kalibráció panelben ugyanazon fizikai pont tervlapi helyéhez kell párosítani.</p>
        </div>
        <div data-gps-calibration-readiness={readiness.readyForPlanAlignment ? "ready" : "pending"} className={`rounded-xl border px-3 py-2 text-right text-[10px] font-black ${readiness.readyForPlanAlignment ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-violet-200 bg-white text-violet-800"}`}>
          <strong className="block text-base">{readiness.count}/3</strong>
          {readiness.readyForPlanAlignment ? "Alapkalibrációhoz elegendő" : "Minimum 3 pont szükséges"}
          {readiness.averageAccuracyMeters !== null ? <span className="mt-1 block text-[9px]">átlagos GPS pontosság ±{Math.round(readiness.averageAccuracyMeters)} m</span> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-[10px] font-black text-slate-700">Pont típusa<select data-gps-calibration-type value={pointType} onChange={(event) => setPointType(event.target.value as GpsPhotoMapCalibrationPointType)} className="mt-1 min-h-10 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs font-bold"><option value="CORNER">Sarokpont</option><option value="SETTING_OUT">Kitűzési pont</option><option value="CUSTOM_REFERENCE">Egyedi referencia</option></select></label>
        <label className="text-[10px] font-black text-slate-700">Pont neve<input data-gps-calibration-label value={label} onChange={(event) => setLabel(event.target.value)} placeholder="pl. ÉK épületsarok" className="mt-1 min-h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold" /></label>
        <label className="text-[10px] font-black text-slate-700">Megjegyzés<input data-gps-calibration-note value={note} onChange={(event) => setNote(event.target.value)} placeholder="opcionális" className="mt-1 min-h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold" /></label>
      </div>

      <button type="button" data-gps-calibration-capture disabled={!sessionId || capturing} onClick={() => void capturePoint()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-black text-white disabled:bg-slate-300">{capturing ? <LoaderCircle size={16} className="animate-spin" /> : <MapPinned size={16} />}{capturing ? "GPS mintagyűjtés…" : "GPS koordináta rögzítése"}</button>
      {capturing && progress ? <div data-gps-calibration-progress className="mt-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[10px] font-bold text-violet-900">{progress.sampleCount} minta · {Math.min(8, Math.ceil(progress.elapsedMs / 1000))}/8 mp{progress.latestAccuracyMeters === null ? "" : ` · aktuális ±${Math.round(progress.latestAccuracyMeters)} m`}</div> : null}
      {message ? <p data-gps-calibration-message className="mt-2 text-[10px] font-bold leading-5 text-slate-600">{message}</p> : null}

      {points.length ? <div className="mt-3 grid gap-2">{points.map((point) => <div key={point.id} data-gps-calibration-point className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white p-3"><div className="min-w-0"><div className="text-xs font-black text-slate-900">{point.label} · {GPS_CALIBRATION_POINT_LABELS[point.type]}</div><div className="mt-1 font-mono text-[9px] text-slate-500">{point.latitude.toFixed(7)}, {point.longitude.toFixed(7)}</div><div className="mt-1 text-[9px] font-bold text-slate-600">{point.sampleCount} minta · {(point.samplingDurationMs / 1000).toFixed(1)} mp · {point.accuracyMeters === null ? "pontosság n/a" : `±${Math.round(point.accuracyMeters)} m`} · {new Date(point.capturedAt).toLocaleString("hu-HU")}</div>{point.note ? <div className="mt-1 text-[9px] font-semibold text-slate-500">{point.note}</div> : null}</div><button type="button" aria-label={`${point.label} törlése`} onClick={() => removePoint(point.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700"><Trash2 size={14} /></button></div>)}</div> : null}
    </section>
  );
}
