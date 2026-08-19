"use client";

import { Compass, Download, LoaderCircle, MapPinned, Route } from "lucide-react";
import { buildGpsPhotoMapModel, fitGpsPhotoMapToViewport } from "@/app/lib/field-capture/gpsPhotoMap";
import { downloadGpsPhotoMapPdf, type GpsPhotoMapPdfPaperSize } from "@/app/lib/field-capture/gpsPhotoMapPdf";
import { useState } from "react";
import type { FieldCaptureItem } from "@/app/lib/field-capture/types";
import SurveyNorthMark from "@/components/viewers/SurveyNorthMark";

const WIDTH = 760;
const HEIGHT = 430;

export default function GpsPhotoMapPanel({ items, projectName }: { items: FieldCaptureItem[]; projectName?: string | null }) {
  const [exporting, setExporting] = useState<GpsPhotoMapPdfPaperSize | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const model = buildGpsPhotoMapModel(items);
  if (!model) return null;
  const points = fitGpsPhotoMapToViewport(model, { width: WIDTH, height: HEIGHT, padding: 64 });
  const byId = new Map(points.map((point) => [point.id, point]));

  async function exportPdf(paperSize: GpsPhotoMapPdfPaperSize) {
    setExporting(paperSize);
    setExportMessage("");
    try {
      const result = await downloadGpsPhotoMapPdf({ items, paperSize, orientation: "landscape", projectName });
      setExportMessage(`${result.paperSize} PDF elkészült · ${result.pointCount} GPS-fotópont`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "A GPS fotótérkép PDF exportja nem sikerült.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <section data-terep-gps-photo-map="true" className="mt-3 overflow-hidden rounded-[1.6rem] border border-cyan-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-100 bg-cyan-50/70 p-4">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-800 text-white"><MapPinned size={19} /></span><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-cyan-800">Terepi GPS fotótérkép</p><h3 className="mt-1 text-base font-black text-slate-950">{model.points.length} GPS-fotópont</h3><p className="mt-1 text-xs leading-5 text-slate-600">A szaggatott vonal a fotók készítési sorrendjét jelöli, nem a tényleges bejárt útvonalat.</p></div></div>
        <div className="flex flex-col items-end gap-2"><div className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-right text-[10px] font-bold text-slate-600"><strong className="block text-cyan-900">Helyszíni kiterjedés</strong>{model.bounds.widthMeters.toFixed(1)} × {model.bounds.heightMeters.toFixed(1)} m</div><div className="flex gap-2"><button type="button" data-gps-photo-map-export="A4" disabled={exporting !== null} onClick={() => void exportPdf("A4")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-3 text-[10px] font-black text-cyan-900 disabled:opacity-50">{exporting === "A4" ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />} A4 PDF</button><button type="button" data-gps-photo-map-export="A3" disabled={exporting !== null} onClick={() => void exportPdf("A3")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-3 text-[10px] font-black text-cyan-900 disabled:opacity-50">{exporting === "A3" ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />} A3 PDF</button></div>{exportMessage ? <p data-gps-photo-map-export-message className="max-w-[260px] text-right text-[10px] font-bold text-slate-600">{exportMessage}</p> : null}</div>
      </div>
      <div className="p-3 sm:p-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label="Terepi GPS fotótérkép fotópontokkal és északi nyíllal">
            <rect width={WIDTH} height={HEIGHT} fill="#f8fafc" />
            <g opacity="0.65">{Array.from({ length: 9 }, (_, index) => <line key={`v-${index}`} x1={index * 95} y1="0" x2={index * 95} y2={HEIGHT} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 8" />)}{Array.from({ length: 6 }, (_, index) => <line key={`h-${index}`} x1="0" y1={index * 86} x2={WIDTH} y2={index * 86} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 8" />)}</g>
            {model.sequenceSegments.map((segment) => { const from = byId.get(segment.fromId); const to = byId.get(segment.toId); if (!from || !to) return null; return <line key={`${segment.fromId}-${segment.toId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#0e7490" strokeWidth="2.2" strokeDasharray="9 7" opacity="0.62" vectorEffect="non-scaling-stroke" />; })}
            {points.map((point) => <g key={point.id} transform={`translate(${point.x} ${point.y})`}>
              {point.headingDegrees !== null ? <g transform={`rotate(${point.headingDegrees})`}><line x1="0" y1="-10" x2="0" y2="-34" stroke="#ea580c" strokeWidth="3" vectorEffect="non-scaling-stroke" /><path d="M -5 -27 L 0 -36 L 5 -27" fill="none" stroke="#ea580c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></g> : null}
              <circle r="13" fill="#ffffff" stroke={point.accuracyMeters !== null && point.accuracyMeters > 50 ? "#d97706" : "#0891b2"} strokeWidth="4" vectorEffect="non-scaling-stroke" />
              <text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="950">{point.sequence}</text>
              <g transform="translate(17 -17)"><rect x="0" y="-9" width="150" height="32" rx="7" fill="#ffffff" stroke="#cbd5e1" vectorEffect="non-scaling-stroke" /><text x="7" y="3" fill="#0f172a" fontSize="9" fontWeight="900">#{point.sequence} · {point.displayName.slice(0, 22)}</text><text x="7" y="15" fill="#64748b" fontSize="8" fontWeight="700">GPS {point.accuracyMeters === null ? "pontosság n/a" : `±${Math.round(point.accuracyMeters)} m`}{point.directionLabel ? ` · kamera ${point.directionLabel}` : ""}</text></g>
            </g>)}
            <SurveyNorthMark northAngle={0} x={WIDTH - 62} y={62} scale={0.9} />
          </svg>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><Route size={15} className="mt-0.5 shrink-0 text-cyan-700" /><span><strong className="text-slate-800">Sorrendi kapcsolat:</strong> fotók készítési sorrendje.</span></div><div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><Compass size={15} className="mt-0.5 shrink-0 text-orange-600" /><span><strong className="text-slate-800">Narancs nyíl:</strong> hátlapi kamera rögzített iránya.</span></div></div>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-5 text-amber-950">{model.disclaimer}</p>
      </div>
    </section>
  );
}
