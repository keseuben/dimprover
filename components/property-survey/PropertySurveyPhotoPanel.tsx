"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Archive, Camera, CheckCircle2, Download, ImagePlus, MapPinPlus, Move, Trash2, X } from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  requiredSurveyCertificatePhotoCategories,
  surveyCertificatePhotoCategoryLabels,
  surveyPhotoPurposeLabels,
  type SurveyCertificatePhotoCategory,
  type SurveyPhotoPlacementMode,
  type SurveyPhotoPoint,
  type SurveyPhotoPurpose,
} from "@/components/property-survey/propertySurveyEnergyModel";
import type { PropertySurveyMode } from "@/components/property-survey/propertySurveyWorkspaceTypes";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  SURVEY_CERTIFICATE_MAX_PHOTOS,
  SURVEY_CERTIFICATE_MAX_TOTAL_BYTES,
  SURVEY_CERTIFICATE_WARNING_TOTAL_BYTES,
  SURVEY_PHOTO_MAX_LONG_SIDE,
  SURVEY_PHOTO_TARGET_BYTES,
  createSurveyPhotoZip,
  downloadSurveyPhotoBlob,
  formatSurveyPhotoBytes,
  getSurveyCertificatePhotoSummary,
  getSurveyPhotoSizeBytes,
  optimizeSurveyPhoto,
} from "@/components/property-survey/propertySurveyPhotoExport";

type Props = {
  surveyMode: PropertySurveyMode;
  surveyName: string;
  points: SurveyPhotoPoint[];
  allPoints: SurveyPhotoPoint[];
  rooms: SurveyRoom[];
  activePhotoId: string | null;
  placementMode: SurveyPhotoPlacementMode;
  onSelect: (photoId: string) => void;
  onStartCreate: () => void;
  onStartMove: () => void;
  onCancelPlacement: () => void;
  onUpdate: (photoId: string, patch: Partial<SurveyPhotoPoint>) => void;
  onDelete: (photoId: string) => void;
};

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const textareaClass = "min-h-20 w-full resize-y rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-semibold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
const labelClass = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]";

function safeDownloadName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "dimpro_felmeres";
}

export function PropertySurveyPhotoPanel({ surveyMode, surveyName, points, allPoints, rooms, activePhotoId, placementMode, onSelect, onStartCreate, onStartMove, onCancelPlacement, onUpdate, onDelete }: Props) {
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState<"certificate" | "all" | null>(null);
  const [error, setError] = useState("");
  const active = points.find((point) => point.id === activePhotoId) || null;
  const certificateMode = surveyMode === "Energetikai felmérés";
  const summary = useMemo(() => getSurveyCertificatePhotoSummary(allPoints), [allPoints]);
  const uploadedCount = allPoints.filter((point) => Boolean(point.dataUrl)).length;

  async function handleFile(file?: File) {
    if (!active || !file) return;
    setBusy(true);
    setError("");
    try {
      const optimized = await optimizeSurveyPhoto(file);
      onUpdate(active.id, {
        fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg",
        ...optimized,
        capturedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A fotó feldolgozása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip(mode: "certificate" | "all") {
    setZipBusy(mode);
    setError("");
    try {
      const blob = await createSurveyPhotoZip({ points: allPoints, mode, surveyName });
      const suffix = mode === "certificate" ? "winwatt_fotocsomag" : "minden_foto";
      downloadSurveyPhotoBlob(blob, `${safeDownloadName(surveyName)}_${suffix}.zip`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A ZIP-csomag létrehozása sikertelen.");
    } finally {
      setZipBusy(null);
    }
  }

  function updatePurpose(purpose: SurveyPhotoPurpose) {
    if (!active) return;
    setError("");
    onUpdate(active.id, {
      purpose,
      includeInCertificate: purpose === "documentation" ? active.includeInCertificate === true : false,
      updatedAt: new Date().toISOString(),
    });
  }

  function updateCertificateCategory(category: SurveyCertificatePhotoCategory) {
    if (!active) return;
    setError("");
    onUpdate(active.id, {
      certificateCategory: category,
      includeInCertificate: category === "other" ? false : active.includeInCertificate === true,
      updatedAt: new Date().toISOString(),
    });
  }

  function toggleCertificateSelection(point: SurveyPhotoPoint, checked: boolean) {
    setError("");
    if (!checked) {
      onUpdate(point.id, { includeInCertificate: false, updatedAt: new Date().toISOString() });
      return;
    }
    if (point.purpose === "issue") {
      setError("A hibafotó nem jelölhető ki a WinWatt/e-tanúsítás fotócsomagba.");
      return;
    }
    if (!point.dataUrl) {
      setError("A kijelölés előtt készítsd el vagy töltsd fel a fényképet.");
      return;
    }
    if (point.certificateCategory === "other") {
      setError("A WinWatt-csomaghoz válassz a három hivatalos képkategória közül.");
      return;
    }
    if (point.includeInCertificate !== true && summary.count >= SURVEY_CERTIFICATE_MAX_PHOTOS) {
      setError(`A WinWatt/e-tanúsítás csomagban legfeljebb ${SURVEY_CERTIFICATE_MAX_PHOTOS} fénykép jelölhető ki.`);
      return;
    }
    const predictedTotalBytes = summary.totalBytes + (point.includeInCertificate === true ? 0 : getSurveyPhotoSizeBytes(point));
    if (predictedTotalBytes > SURVEY_CERTIFICATE_MAX_TOTAL_BYTES) {
      setError(`A kijelöléssel a WinWatt-csomag ${formatSurveyPhotoBytes(predictedTotalBytes)} lenne, ezért meghaladná a 4 MB-os felső korlátot.`);
      return;
    }
    if (predictedTotalBytes > SURVEY_CERTIFICATE_WARNING_TOTAL_BYTES) {
      setError(`Figyelmeztetés: a kijelölt csomag ${formatSurveyPhotoBytes(predictedTotalBytes)}, vagyis meghaladja a 3,5 MB-os DIMPRO biztonsági küszöböt.`);
    }
    onUpdate(point.id, { includeInCertificate: true, updatedAt: new Date().toISOString() });
  }

  const totalStatusClass = summary.exceedsHardLimit
    ? "border-rose-300 bg-rose-50 text-rose-950"
    : summary.exceedsWarningLimit
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-emerald-300 bg-emerald-50 text-emerald-950";

  return <div className="grid gap-4">
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><Camera size={19}/></span>
        <div>
          <div className="text-sm font-black">{certificateMode ? "Energetikai fotódokumentáció" : "Számozott alaprajzi fotódokumentáció"}</div>
          <div className="mt-1 text-xs font-semibold leading-5">A fotó elsődlegesen a felmérés kötelező dokumentációs része. A hibafotó külön, másodlagos típusként választható. Először jelöld ki a fotó készítésének helyét az alaprajzon.</div>
        </div>
      </div>
      {placementMode ? <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">{placementMode === "create" ? "Új dokumentációs fotópont helyének kijelölése aktív" : "Fotópont új helyének kijelölése aktív"}</div><button type="button" onClick={onCancelPlacement} className="survey-icon-button"><X size={16}/></button></div> : <button type="button" onClick={onStartCreate} className="survey-action-primary mt-3 w-full"><MapPinPlus size={17}/> Új dokumentációs fotópont</button>}
    </div>

    {certificateMode ? <div data-survey-certificate-photo-summary="true" className={`rounded-2xl border p-4 ${totalStatusClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-sm font-black">WinWatt / e-tanúsítás fotókeret</div><div className="mt-1 text-xs font-semibold leading-5">A felmérés során a 12 darabos tanúsítási keretnél több fotó is készíthető. A ZIP-be kizárólag a külön bepipált képek kerülnek: legfeljebb 12 JPG, együttesen maximum 4 MB. DIMPRO célérték: 1600 px hosszabbik oldal, legfeljebb 280 KB/kép, lehetőleg 3,5 MB összméret alatt.</div></div>
        {summary.exceedsHardLimit || summary.exceedsPhotoCount ? <AlertTriangle className="shrink-0 text-rose-700" size={22}/> : <CheckCircle2 className="shrink-0 text-emerald-700" size={22}/>} 
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-current/20 bg-white/75 p-3"><div className="text-[9px] font-black uppercase">Kijelölt képek</div><div className="mt-1 text-xl font-black">{summary.count} / {SURVEY_CERTIFICATE_MAX_PHOTOS}</div></div>
        <div className="rounded-xl border border-current/20 bg-white/75 p-3"><div className="text-[9px] font-black uppercase">Összméret</div><div className="mt-1 text-xl font-black">{formatSurveyPhotoBytes(summary.totalBytes)}</div><div className="text-[9px] font-bold">figyelmeztetés {formatSurveyPhotoBytes(SURVEY_CERTIFICATE_WARNING_TOTAL_BYTES)} · maximum {formatSurveyPhotoBytes(SURVEY_CERTIFICATE_MAX_TOTAL_BYTES)}</div></div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {requiredSurveyCertificatePhotoCategories.map((category) => {
          const ready = summary.categoryCounts[category] > 0;
          return <div key={category} className={`rounded-xl border px-3 py-2 text-xs font-black ${ready ? "border-emerald-300 bg-white text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{ready ? "✓" : "!"} {surveyCertificatePhotoCategoryLabels[category]} · {summary.categoryCounts[category]} db</div>;
        })}
      </div>
      {summary.missingRequiredCategories.length ? <div className="mt-2 text-[10px] font-bold">Még hiányzó WinWatt-kategória: {summary.missingRequiredCategories.map((category) => surveyCertificatePhotoCategoryLabels[category]).join(", ")}.</div> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={zipBusy !== null || summary.count === 0} onClick={() => void downloadZip("certificate")} className="survey-action-primary disabled:opacity-50"><Archive size={17}/>{zipBusy === "certificate" ? "ZIP készítése..." : "WinWatt fotócsomag ZIP"}</button>
        <button type="button" disabled={zipBusy !== null || uploadedCount === 0} onClick={() => void downloadZip("all")} className="survey-action-secondary disabled:opacity-50"><Download size={17}/>{zipBusy === "all" ? "ZIP készítése..." : "Minden feltöltött kép ZIP"}</button>
      </div>
    </div> : null}

    <div>
      <div className="mb-2 flex items-center justify-between"><div><div className="text-sm font-black text-[var(--survey-text)]">Fotópontok</div><div className="text-xs font-semibold text-[var(--survey-muted)]">{points.length} pont · {points.filter((point) => point.dataUrl).length} feltöltött kép az aktív szinten</div></div></div>
      <div className="grid max-h-60 gap-2 overflow-y-auto pr-1">{points.length ? points.map((point) => {
        const roomName = rooms.find((room) => room.id === point.roomId)?.name || "Nincs helyiség";
        const selected = point.id === activePhotoId;
        const certificateEligible = certificateMode && point.purpose === "documentation" && point.certificateCategory !== "other" && Boolean(point.dataUrl);
        return <div key={point.id} data-survey-photo-point={point.id} data-survey-photo-purpose={point.purpose} data-survey-photo-serial={point.serial} data-survey-photo-in-certificate={point.includeInCertificate === true ? "true" : "false"} className={`rounded-xl border p-3 ${selected ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}>
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => onSelect(point.id)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-black text-cyan-700">{point.serial}</span><span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${point.purpose === "issue" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{point.purpose === "issue" ? "Hibafotó" : "Dokumentáció"}</span>{point.includeInCertificate === true ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[8px] font-black uppercase text-blue-800">ZIP-be kijelölve</span> : null}</div>
              <div className="mt-1 truncate text-sm font-black">{point.title}</div>
              <div className={`mt-1 truncate text-[10px] font-bold ${selected ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{roomName}{point.dataUrl ? ` · ${formatSurveyPhotoBytes(getSurveyPhotoSizeBytes(point))}` : ""}</div>
              {certificateMode && point.purpose === "documentation" ? <div className="mt-1 truncate text-[9px] font-semibold text-slate-500">{surveyCertificatePhotoCategoryLabels[point.certificateCategory]}</div> : null}
            </button>
            <div className="flex shrink-0 flex-col items-center gap-2">
              {certificateMode ? <label className={`grid place-items-center rounded-lg border px-2 py-1.5 text-[8px] font-black uppercase ${certificateEligible ? "cursor-pointer border-blue-200 bg-blue-50 text-blue-800" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`} title={certificateEligible ? "Kijelölés a WinWatt ZIP-csomaghoz" : "Előbb tölts fel dokumentációs fotót és válassz WinWatt-kategóriát"}>
                <span>ZIP</span>
                <input data-survey-photo-certificate-toggle={point.id} type="checkbox" checked={point.includeInCertificate === true} disabled={!certificateEligible} onChange={(event) => toggleCertificateSelection(point, event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-600"/>
              </label> : null}
              {point.dataUrl ? <Camera size={18} className="text-emerald-600"/> : null}
            </div>
          </div>
        </div>;
      }) : <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Még nincs fotópont.</div>}</div>
    </div>

    {active ? <div className="grid gap-4 border-t border-[var(--survey-border)] pt-4">
      <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700">Aktív fotópont</div><div className="mt-1 text-lg font-black text-[var(--survey-text)]">{active.serial}</div></div><button type="button" onClick={onStartMove} className="survey-action-secondary"><Move size={15}/> Hely módosítása</button></div>
      <label><span className={labelClass}>Fotó szerepe</span><select data-survey-photo-purpose value={active.purpose} onChange={(event) => updatePurpose(event.target.value as SurveyPhotoPurpose)} className={inputClass}>{Object.entries(surveyPhotoPurposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {active.purpose === "documentation" ? <>
        <label><span className={labelClass}>Dokumentációs kategória</span><select data-survey-photo-category value={active.certificateCategory} onChange={(event) => updateCertificateCategory(event.target.value as SurveyCertificatePhotoCategory)} className={inputClass}>{Object.entries(surveyCertificatePhotoCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {certificateMode ? <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-black text-[var(--survey-text)]"><span><span className="block">Kijelölés a WinWatt / e-tanúsítás ZIP-csomagba</span><span className="mt-1 block text-[9px] font-semibold text-[var(--survey-muted)]">Csak a bepipált, feltöltött dokumentációs fotók kerülnek a ZIP-be és számítanak bele a 12 képes / 4 MB-os keretbe.</span></span><input data-survey-active-certificate-toggle type="checkbox" checked={active.includeInCertificate === true} disabled={!active.dataUrl || active.certificateCategory === "other"} onChange={(event) => toggleCertificateSelection(active, event.target.checked)} className="h-5 w-5 accent-cyan-600 disabled:opacity-40"/></label> : null}
      </> : <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-900">A hibafotó másodlagos dokumentum, nem kerül automatikusan a WinWatt/e-tanúsítás fotócsomagba. A kapcsolódó hibát a külön Hibák lépésben kell rögzíteni.</div>}
      <label><span className={labelClass}>Megnevezés</span><input className={inputClass} value={active.title} onChange={(event) => onUpdate(active.id, { title: event.target.value, updatedAt: new Date().toISOString() })}/></label>
      <label><span className={labelClass}>Helyiség</span><select className={inputClass} value={active.roomId} onChange={(event) => onUpdate(active.id, { roomId: event.target.value, updatedAt: new Date().toISOString() })}><option value="">Nincs helyiség</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      {active.dataUrl ? <div className="overflow-hidden rounded-xl border border-[var(--survey-border)] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.dataUrl} alt={active.title} className="max-h-56 w-full object-contain"/>
        <div className="grid gap-1 border-t border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 sm:grid-cols-2"><span>{active.fileName}</span><span className="sm:text-right">{active.pixelWidth || "?"} × {active.pixelHeight || "?"} px · {formatSurveyPhotoBytes(getSurveyPhotoSizeBytes(active))}</span>{active.originalSizeBytes ? <span className="text-[10px] font-semibold text-slate-500 sm:col-span-2">Eredeti: {formatSurveyPhotoBytes(active.originalSizeBytes)} · optimalizált JPG: {formatSurveyPhotoBytes(getSurveyPhotoSizeBytes(active))}</span> : null}</div>
      </div> : null}
      <label className="survey-action-secondary cursor-pointer"><ImagePlus size={17}/>{busy ? "Fotó optimalizálása..." : active.dataUrl ? "Fotó cseréje" : "Fotó készítése / kiválasztása"}<input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }}/></label>
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[10px] font-bold leading-5 text-cyan-950">Automatikus optimalizálás: JPG/JPEG · legfeljebb {SURVEY_PHOTO_MAX_LONG_SIDE} px hosszabbik oldal · cél legfeljebb {formatSurveyPhotoBytes(SURVEY_PHOTO_TARGET_BYTES)} képenként.</div>
      {error ? <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</div> : null}
      <label><span className={labelClass}>Megjegyzés</span><textarea className={textareaClass} value={active.note} onChange={(event) => onUpdate(active.id, { note: event.target.value, updatedAt: new Date().toISOString() })}/></label>
      <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={16}/>} label="Fotópont törlése · 2 mp" holdingLabel="Törléshez" ariaLabel={`${active.serial} fotópont törléséhez tartsd nyomva 2 másodpercig`} onComplete={() => onDelete(active.id)} className="w-full"/>
    </div> : null}
  </div>;
}
