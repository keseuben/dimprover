"use client";

import { FileUp, LoaderCircle, MapPinned, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldCaptureItem } from "@/app/lib/field-capture/types";
import {
  buildConsecutiveGpsPlanDistanceSegments,
  buildGpsPlanCalibrationModel,
  buildGpsPlanPhotoPoints,
  type GpsPlanAnchor,
} from "@/app/lib/field-capture/gpsPlanCalibration";
import {
  clearGpsPlanCalibration,
  loadGpsPlanCalibrationRecord,
  saveGpsPlanAnchors,
  saveGpsPlanDocument,
  setGpsPlanPage,
  type GpsPlanCalibrationRecord,
} from "@/app/lib/field-capture/gpsPlanCalibrationStore";
import {
  GPS_CALIBRATION_POINTS_CHANGED_EVENT,
  loadGpsCalibrationPoints,
} from "@/app/lib/field-capture/gpsPhotoMapCalibrationStore";
import { loadSharedPdfDocument, renderSharedPdfPage } from "@/components/viewers/pdfDocumentEngine";

const MAX_PLAN_BYTES = 40 * 1024 * 1024;

function qualityLabel(quality: ReturnType<typeof buildGpsPlanCalibrationModel> extends infer T ? T extends { quality: infer Q } ? Q : never : never) {
  if (quality === "GOOD") return "jó";
  if (quality === "ACCEPTABLE") return "elfogadható";
  if (quality === "WEAK") return "gyenge";
  return "3 pontos · ellenőrző pont nélkül";
}

export default function GpsPlanCalibrationPanel({ items, sessionId }: { items: FieldCaptureItem[]; sessionId?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [record, setRecord] = useState<GpsPlanCalibrationRecord | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState(() => loadGpsCalibrationPoints(sessionId));
  const [selectedPointId, setSelectedPointId] = useState("");
  const [rendering, setRendering] = useState(false);
  const [message, setMessage] = useState("");
  const [canvasReady, setCanvasReady] = useState(false);
  const [planRenderRecord, setPlanRenderRecord] = useState<GpsPlanCalibrationRecord | null>(null);

  const reloadRecord = useCallback(async () => {
    const loaded = await loadGpsPlanCalibrationRecord(sessionId);
    setRecord(loaded);
    setPlanRenderRecord(loaded);
  }, [sessionId]);

  useEffect(() => {
    setCalibrationPoints(loadGpsCalibrationPoints(sessionId));
    setSelectedPointId("");
    setCanvasReady(false);
    void reloadRecord();
  }, [sessionId, reloadRecord]);

  useEffect(() => {
    function handleCalibrationChanged(event: Event) {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
      if (detail?.sessionId && detail.sessionId !== sessionId) return;
      const next = loadGpsCalibrationPoints(sessionId);
      setCalibrationPoints(next);
      setSelectedPointId((current) => current && next.some((point) => point.id === current) ? current : "");
    }
    window.addEventListener(GPS_CALIBRATION_POINTS_CHANGED_EVENT, handleCalibrationChanged);
    return () => {
      window.removeEventListener(GPS_CALIBRATION_POINTS_CHANGED_EVENT, handleCalibrationChanged);
    };
  }, [sessionId, reloadRecord]);

  useEffect(() => {
    let cancelled = false;
    async function renderPlan() {
      const canvas = canvasRef.current;
      const renderRecord = planRenderRecord;
      if (!canvas || !renderRecord) { setCanvasReady(false); return; }
      setRendering(true);
      setCanvasReady(false);
      try {
        const source = new Uint8Array(await renderRecord.pdfBlob.arrayBuffer());
        const doc = await loadSharedPdfDocument(source);
        const page = await doc.getPage(renderRecord.pageNumber);
        await renderSharedPdfPage({ page, canvas, scale: 1.35, maximumPixelDimension: 2600 });
        await doc.destroy?.();
        if (!cancelled) setCanvasReady(true);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "A PDF tervlap nem renderelhető.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    void renderPlan();
    return () => { cancelled = true; };
  }, [planRenderRecord]);

  const anchors = useMemo(() => record?.anchors ?? [], [record?.anchors]);
  const model = useMemo(() => buildGpsPlanCalibrationModel({ calibrationPoints, anchors, pageNumber: record?.pageNumber }), [calibrationPoints, anchors, record?.pageNumber]);
  const photoPoints = useMemo(() => model ? buildGpsPlanPhotoPoints(items, model) : [], [items, model]);
  const distanceSegments = useMemo(() => buildConsecutiveGpsPlanDistanceSegments(photoPoints), [photoPoints]);
  const pointIndex = useMemo(() => new Map(calibrationPoints.map((point, index) => [point.id, index])), [calibrationPoints]);
  const assigned = new Set(anchors.map((anchor) => anchor.calibrationPointId));
  const outsideCount = photoPoints.filter((point) => !point.insidePlan).length;

  async function uploadPlan(file: File) {
    if (!sessionId) return;
    setMessage("");
    if (file.size > MAX_PLAN_BYTES) { setMessage("A tervlap legfeljebb 40 MB lehet."); return; }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setMessage("PDF tervlap szükséges."); return; }
    setRendering(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new Error("A kiválasztott fájl nem érvényes PDF.");
      const doc = await loadSharedPdfDocument(bytes);
      const pageCount = doc.numPages;
      await doc.destroy?.();
      const saved = await saveGpsPlanDocument({ sessionId, file, pageCount, pageNumber: 1 });
      setRecord(saved);
      setPlanRenderRecord(saved);
      setSelectedPointId(calibrationPoints[0]?.id || "");
      setMessage(`${saved.fileName} betöltve · ${saved.pageCount} oldal. Jelöld meg ugyanazokat az R pontokat a tervlapon.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A PDF tervlap betöltése sikertelen.");
    } finally {
      setRendering(false);
    }
  }

  async function placeAnchor(event: React.MouseEvent<SVGSVGElement>) {
    if (!sessionId || !record || !selectedPointId || !canvasReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = (event.clientX - rect.left) / rect.width * 100;
    const yPercent = (event.clientY - rect.top) / rect.height * 100;
    const nextAnchor: GpsPlanAnchor = {
      id: `plan-anchor-${selectedPointId}`,
      calibrationPointId: selectedPointId,
      pageNumber: record.pageNumber,
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: Math.max(0, Math.min(100, yPercent)),
      createdAt: new Date().toISOString(),
    };
    const nextAnchors = [...anchors.filter((anchor) => anchor.calibrationPointId !== selectedPointId), nextAnchor];
    const saved = await saveGpsPlanAnchors(sessionId, nextAnchors);
    setRecord(saved);
    const currentIndex = calibrationPoints.findIndex((point) => point.id === selectedPointId);
    const nextPoint = calibrationPoints.slice(currentIndex + 1).find((point) => !nextAnchors.some((anchor) => anchor.calibrationPointId === point.id));
    setSelectedPointId(nextPoint?.id || selectedPointId);
    setMessage(`${nextAnchors.length}. tervlapi referencia-pont rögzítve.`);
  }

  async function removeAnchor(calibrationPointId: string) {
    if (!sessionId) return;
    const saved = await saveGpsPlanAnchors(sessionId, anchors.filter((anchor) => anchor.calibrationPointId !== calibrationPointId));
    setRecord(saved);
    setSelectedPointId(calibrationPointId);
  }

  async function changePage(pageNumber: number) {
    if (!sessionId) return;
    const saved = await setGpsPlanPage(sessionId, pageNumber);
    setRecord(saved);
    setPlanRenderRecord(saved);
    setSelectedPointId(calibrationPoints[0]?.id || "");
    setMessage("Tervlapoldal váltva. A referencia-pontokat ezen az oldalon újra meg kell jelölni.");
  }

  async function clearPlan() {
    if (!sessionId) return;
    await clearGpsPlanCalibration(sessionId);
    setRecord(null);
    setPlanRenderRecord(null);
    setSelectedPointId("");
    setCanvasReady(false);
    setMessage("Tervlap-kalibráció törölve.");
  }

  return (
    <section data-gps-plan-calibration="true" className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.12em] text-indigo-700">F10 · Tervlapra illesztett GPS-fotópontok</p>
          <h4 className="mt-1 text-sm font-black text-slate-950">Tervlap-kalibráció</h4>
          <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-5 text-slate-600">Válassz PDF tervlapot, majd ugyanazokat a helyszíni R referencia-pontokat kattintsd meg a terven. 3 ponttal létrejön az illesztés; 4 vagy több ponttal az eltérés is ellenőrizhető.</p>
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-indigo-700 px-3 text-xs font-black text-white"><FileUp size={15} /> {record ? "Tervlap cseréje" : "PDF tervlap"}<input data-gps-plan-upload type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPlan(file); event.currentTarget.value = ""; }} /></label>
      </div>

      {!calibrationPoints.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold leading-5 text-amber-900">Előbb rögzíts legalább 3 külön GPS referencia-/kalibrációs pontot az előző panelen.</div> : null}

      {record ? <>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-white p-2 text-[10px] font-bold text-slate-600">
          <strong className="mr-auto truncate text-slate-900">{record.fileName}</strong>
          {record.pageCount > 1 ? <label className="flex items-center gap-2">Oldal<select data-gps-plan-page value={record.pageNumber} onChange={(event) => void changePage(Number(event.target.value))} className="h-9 rounded-lg border border-indigo-200 bg-white px-2 font-black">{Array.from({ length: record.pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}/{record.pageCount}</option>)}</select></label> : <span>{record.pageNumber}. oldal</span>}
          <button type="button" onClick={() => void clearPlan()} className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-rose-700"><Trash2 size={13} /> Törlés</button>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
          <div className="rounded-xl border border-indigo-200 bg-white p-3">
            <div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500">Tervlapi referencia-pont</div>
            <div className="mt-2 grid gap-2">{calibrationPoints.map((point, index) => {
              const anchor = anchors.find((item) => item.calibrationPointId === point.id);
              const selected = selectedPointId === point.id;
              return <button key={point.id} type="button" data-gps-plan-reference={point.id} onClick={() => setSelectedPointId(point.id)} className={`rounded-lg border p-2 text-left ${selected ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100" : anchor ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <span className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-900">R{index + 1} · {point.label}</strong><span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${anchor ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{anchor ? "terven" : "hiányzik"}</span></span>
                <span className="mt-1 block font-mono text-[8px] text-slate-500">{point.latitude.toFixed(7)}, {point.longitude.toFixed(7)}</span>
                {anchor ? <span className="mt-1 flex items-center justify-between text-[8px] font-bold text-indigo-700"><span>X {anchor.xPercent.toFixed(2)}% · Y {anchor.yPercent.toFixed(2)}%</span><span onClick={(event) => { event.stopPropagation(); void removeAnchor(point.id); }} className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-rose-700">törlés</span></span> : null}
              </button>;
            })}</div>
            <div className={`mt-3 rounded-lg border p-2 text-[9px] font-bold leading-4 ${model ? model.quality === "WEAK" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {model ? <><strong className="block">Illesztés: {qualityLabel(model.quality)}</strong><span>{model.anchorCount} referencia-pont · Észak tervi iránya {model.northAngleDegrees.toFixed(1)}°</span>{model.verificationAvailable ? <span className="block">Átlagos eltérés ±{(model.averageResidualMeters ?? 0).toFixed(2).replace(".", ",")} m · max. {(model.maxResidualMeters ?? 0).toFixed(2).replace(".", ",")} m</span> : <span className="block">4. ponttól ellenőrizhető a maradékhiba.</span>}</> : <><strong className="block">{anchors.length}/3 tervlapi pont</strong><span>Legalább 3 nem egyvonalú referencia szükséges.</span></>}
            </div>
          </div>

          <div className="min-w-0">
            <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-white" data-gps-plan-stage>
              <canvas ref={canvasRef} className="block h-auto w-full" />
              {rendering ? <div className="absolute inset-0 grid place-items-center bg-white/80"><span className="inline-flex items-center gap-2 text-xs font-black text-indigo-800"><LoaderCircle size={16} className="animate-spin" /> Tervlap renderelése…</span></div> : null}
              {canvasReady ? <svg data-gps-plan-overlay viewBox="0 0 100 100" preserveAspectRatio="none" onClick={(event) => void placeAnchor(event)} className={`absolute inset-0 h-full w-full ${selectedPointId ? "cursor-crosshair" : "cursor-default"}`}>
                {distanceSegments.filter((segment) => segment.from.insidePlan && segment.to.insidePlan).map((segment) => {
                  const midX = (segment.from.xPercent + segment.to.xPercent) / 2;
                  const midY = (segment.from.yPercent + segment.to.yPercent) / 2;
                  return <g key={segment.id} data-gps-plan-distance={segment.displayLabel}>
                    <line x1={segment.from.xPercent} y1={segment.from.yPercent} x2={segment.to.xPercent} y2={segment.to.yPercent} stroke="#0e7490" strokeWidth="0.45" strokeDasharray="1.6 1.3" vectorEffect="non-scaling-stroke" />
                    <rect x={midX - 4.2} y={midY - 2.1} width="8.4" height="4.2" rx="1" fill="white" fillOpacity="0.94" stroke="#67e8f9" strokeWidth="0.18" />
                    <text x={midX} y={midY + 0.8} textAnchor="middle" fontSize="2.5" fontWeight="900" fill="#0f172a">{segment.displayLabel}</text>
                  </g>;
                })}
                {anchors.map((anchor) => {
                  const index = pointIndex.get(anchor.calibrationPointId) ?? 0;
                  return <g key={anchor.id} transform={`translate(${anchor.xPercent} ${anchor.yPercent})`} data-gps-plan-anchor={anchor.calibrationPointId}>
                    <rect x="-1.7" y="-1.7" width="3.4" height="3.4" rx="0.45" fill="#ede9fe" stroke="#6d28d9" strokeWidth="0.45" vectorEffect="non-scaling-stroke" />
                    <text x="0" y="0.75" textAnchor="middle" fontSize="2.1" fontWeight="950" fill="#4c1d95">R{index + 1}</text>
                  </g>;
                })}
                {photoPoints.filter((point) => point.insidePlan).map((point) => <g key={point.id} transform={`translate(${point.xPercent} ${point.yPercent})`} data-gps-plan-photo={point.sequence}>
                  {point.headingPlanDegrees !== null ? <g transform={`rotate(${point.headingPlanDegrees})`}><line x1="0" y1="-1.4" x2="0" y2="-5.2" stroke="#ea580c" strokeWidth="0.55" vectorEffect="non-scaling-stroke" /><path d="M -0.8 -4.2 L 0 -5.6 L 0.8 -4.2" fill="none" stroke="#ea580c" strokeWidth="0.5" vectorEffect="non-scaling-stroke" /></g> : null}
                  <circle r="1.75" fill="white" stroke="#0891b2" strokeWidth="0.55" vectorEffect="non-scaling-stroke" />
                  <text x="0" y="0.7" textAnchor="middle" fontSize="2.1" fontWeight="950" fill="#0f172a">{point.sequence}</text>
                </g>)}
                {model ? <g transform="translate(94 8)"><line x1="0" y1="4" x2="0" y2="-3" stroke="#0f172a" strokeWidth="0.6" transform={`rotate(${model.northAngleDegrees})`} vectorEffect="non-scaling-stroke" /><path d="M -1.1 -1.5 L 0 -3.8 L 1.1 -1.5" fill="none" stroke="#0f172a" strokeWidth="0.55" transform={`rotate(${model.northAngleDegrees})`} vectorEffect="non-scaling-stroke" /><text x="0" y="7" textAnchor="middle" fontSize="2.4" fontWeight="950" fill="#0f172a">É</text></g> : null}
              </svg> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold text-slate-600">
              <span>{selectedPointId ? `Kattints a terven: R${(pointIndex.get(selectedPointId) ?? 0) + 1}` : "Válassz R referencia-pontot."}</span>
              {model ? <span>{photoPoints.length} fotópont · {distanceSegments.length} automatikus távolság · {outsideCount ? `${outsideCount} pont a terven kívül` : "minden pont a terven"}</span> : null}
            </div>
          </div>
        </div>
      </> : <div className="mt-3 rounded-xl border border-dashed border-indigo-300 bg-white p-5 text-center"><MapPinned className="mx-auto text-indigo-300" size={28} /><strong className="mt-2 block text-xs text-slate-700">Még nincs tervlap kiválasztva</strong><p className="mt-1 text-[10px] font-semibold leading-5 text-slate-500">A tervlap csak ezen az eszközön, az IndexedDB-ben tárolódik a munkamenethez.</p></div>}

      {message ? <p data-gps-plan-message className="mt-2 text-[10px] font-bold leading-5 text-slate-600">{message}</p> : null}
      {record ? <button type="button" onClick={() => setSelectedPointId(calibrationPoints.find((point) => !assigned.has(point.id))?.id || calibrationPoints[0]?.id || "")} className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[10px] font-black text-indigo-800"><RotateCcw size={13} /> Következő hiányzó R pont</button> : null}
    </section>
  );
}
