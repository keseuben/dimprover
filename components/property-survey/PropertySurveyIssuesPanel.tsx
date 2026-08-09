"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImagePlus,
  MapPinPlus,
  Move,
  Trash2,
  X,
} from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import { HoldActionButton } from "@/components/property-survey/HoldActionButton";
import {
  planIssueDisciplines,
  planMarkerSeverityOptions,
} from "@/components/viewers/PlanMarkerTypes";
import {
  propertySurveyIssuePhotoKinds,
  propertySurveyIssueStatuses,
  type PropertySurveyIssue,
  type PropertySurveyIssuePlacementMode,
} from "./propertySurveyIssueTypes";

type PropertySurveyIssuesPanelProps = {
  issues: PropertySurveyIssue[];
  activeIssueId: string | null;
  rooms: SurveyRoom[];
  placementMode: PropertySurveyIssuePlacementMode;
  onSelectIssue: (issueId: string) => void;
  onStartCreate: () => void;
  onStartMove: () => void;
  onCancelPlacement: () => void;
  onUpdateIssue: (issueId: string, patch: Partial<PropertySurveyIssue>) => void;
  onDeleteIssue: (issueId: string) => void;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]">{children}</span>;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("A fotó nem olvasható."));
    reader.readAsDataURL(file);
  });
}

async function optimizeIssuePhoto(file: File) {
  const sourceDataUrl = await fileToDataUrl(file);
  const image = new Image();
  image.src = sourceDataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("A fotó előnézete nem készíthető el."));
  });

  const maximumSide = 1600;
  const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return sourceDataUrl;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export function PropertySurveyIssuesPanel({
  issues,
  activeIssueId,
  rooms,
  placementMode,
  onSelectIssue,
  onStartCreate,
  onStartMove,
  onCancelPlacement,
  onUpdateIssue,
  onDeleteIssue,
}: PropertySurveyIssuesPanelProps) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const activeIssue = issues.find((issue) => issue.id === activeIssueId) || null;
  const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";
  const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-3 text-sm font-semibold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

  async function handlePhoto(file?: File) {
    if (!activeIssue || !file) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Csak képfájl csatolható.");
      const photoDataUrl = await optimizeIssuePhoto(file);
      onUpdateIssue(activeIssue.id, {
        photoName: file.name,
        photoDataUrl,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "A fotó feldolgozása sikertelen.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-slate-950">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-700 text-white"><MapPinPlus size={20} /></span>
          <div>
            <div className="text-sm font-black">Hibapont felvétele</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">Indítsd el a jelölést, majd koppints az alaprajzon a hiba pontos helyére. A sorszám automatikusan készül.</div>
          </div>
        </div>
        {placementMode ? (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <div className="flex items-center rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-900">
              {placementMode === "create" ? "Új hibapont helyének kijelölése aktív" : "A kijelölt hibapont új helyének kijelölése aktív"}
            </div>
            <button type="button" onClick={onCancelPlacement} className="survey-icon-button" aria-label="Hibapont elhelyezés megszakítása"><X size={17} /></button>
          </div>
        ) : (
          <button type="button" onClick={onStartCreate} className="survey-action-primary mt-3 w-full"><MapPinPlus size={18} /> Új hibapont az alaprajzon</button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[var(--survey-text)]">Rögzített hibák</div>
            <div className="text-xs font-semibold text-[var(--survey-muted)]">{issues.length} db hibapont</div>
          </div>
          <span className="rounded-full border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-2.5 py-1 text-[10px] font-black uppercase text-[var(--survey-muted)]">HJ</span>
        </div>
        <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
          {issues.length ? issues.map((issue) => {
            const active = issue.id === activeIssueId;
            const roomName = rooms.find((room) => room.id === issue.roomId)?.name || "Nincs helyiség";
            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelectIssue(issue.id)}
                className={`rounded-xl border p-3 text-left transition ${active ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)] hover:border-cyan-300"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-[0.08em] text-cyan-700">{issue.serial}</div>
                    <div className="mt-1 truncate text-sm font-black">{issue.title || "Névtelen hiba"}</div>
                    <div className={`mt-1 truncate text-[10px] font-bold ${active ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{roomName}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${issue.status === "Lezárt" ? "bg-emerald-100 text-emerald-700" : issue.status === "Folyamatban" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{issue.status}</span>
                </div>
              </button>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 text-center">
              <AlertTriangle className="mx-auto text-amber-500" size={24} />
              <div className="mt-2 text-sm font-black text-[var(--survey-text)]">Nincs rögzített hiba</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">Ez lehet helyes eredmény is. Csak akkor vegyél fel hibapontot, ha tényleges észrevétel van.</div>
            </div>
          )}
        </div>
      </div>

      {activeIssue ? (
        <div className="grid gap-4 border-t border-[var(--survey-border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">Aktív hibajegy</div>
              <div className="mt-1 text-lg font-black text-[var(--survey-text)]">{activeIssue.serial}</div>
            </div>
            <button type="button" onClick={onStartMove} className="survey-action-secondary"><Move size={16} /> Hely módosítása</button>
          </div>

          <div><FieldLabel>Hiba megnevezése</FieldLabel><input className={inputClass} value={activeIssue.title} onChange={(event) => onUpdateIssue(activeIssue.id, { title: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Pl. Repedés a nyílászáró felett" /></div>
          <div><FieldLabel>Helyiség</FieldLabel><select className={inputClass} value={activeIssue.roomId} onChange={(event) => onUpdateIssue(activeIssue.id, { roomId: event.target.value, updatedAt: new Date().toISOString() })}><option value="">Külső / nincs helyiség</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Szakág</FieldLabel><select className={inputClass} value={activeIssue.discipline} onChange={(event) => onUpdateIssue(activeIssue.id, { discipline: event.target.value as PropertySurveyIssue["discipline"], updatedAt: new Date().toISOString() })}>{planIssueDisciplines.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><FieldLabel>Státusz</FieldLabel><select className={inputClass} value={activeIssue.status} onChange={(event) => onUpdateIssue(activeIssue.id, { status: event.target.value as PropertySurveyIssue["status"], updatedAt: new Date().toISOString() })}>{propertySurveyIssueStatuses.map((status) => <option key={status}>{status}</option>)}</select></div>
          </div>
          <div><FieldLabel>Súlyosság</FieldLabel><select className={inputClass} value={activeIssue.severity} onChange={(event) => onUpdateIssue(activeIssue.id, { severity: event.target.value as PropertySurveyIssue["severity"], updatedAt: new Date().toISOString() })}>{planMarkerSeverityOptions.map((severity) => <option key={severity}>{severity}</option>)}</select></div>
          <div><FieldLabel>Hiba leírása</FieldLabel><textarea className={textareaClass} value={activeIssue.description} onChange={(event) => onUpdateIssue(activeIssue.id, { description: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Röviden írd le, mit láttál és milyen javítás vagy ellenőrzés szükséges." /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Rögzítés dátuma</FieldLabel><input type="date" className={inputClass} value={activeIssue.recordedAt} onChange={(event) => onUpdateIssue(activeIssue.id, { recordedAt: event.target.value, updatedAt: new Date().toISOString() })} /></div>
            <div><FieldLabel>Rögzítő</FieldLabel><input className={inputClass} value={activeIssue.recordedBy} onChange={(event) => onUpdateIssue(activeIssue.id, { recordedBy: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Név" /></div>
          </div>

          <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-[var(--survey-text)]">Egy fotó a hibához</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">Helyszíni vagy már megjelölt fotó csatolható. A nagy képet a rendszer helyben optimalizálja.</div>
              </div>
              {activeIssue.photoDataUrl ? <CheckCircle2 className="shrink-0 text-emerald-500" size={20} /> : <Camera className="shrink-0 text-[var(--survey-muted)]" size={20} />}
            </div>
            <div className="mt-3"><FieldLabel>Fotó típusa</FieldLabel><select className={inputClass} value={activeIssue.photoKind} onChange={(event) => onUpdateIssue(activeIssue.id, { photoKind: event.target.value as PropertySurveyIssue["photoKind"], updatedAt: new Date().toISOString() })}>{propertySurveyIssuePhotoKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></div>
            {activeIssue.photoDataUrl ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--survey-border)] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeIssue.photoDataUrl} alt={`${activeIssue.serial} hibafotó`} className="max-h-52 w-full object-contain" />
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                  <span className="min-w-0 truncate">{activeIssue.photoName || "Hibafotó"}</span>
                  <button type="button" onClick={() => onUpdateIssue(activeIssue.id, { photoName: undefined, photoDataUrl: undefined, updatedAt: new Date().toISOString() })} className="inline-flex items-center gap-1 font-black text-rose-600"><X size={14} /> Törlés</button>
                </div>
              </div>
            ) : null}
            <label className="survey-action-secondary mt-3 w-full cursor-pointer">
              <ImagePlus size={17} /> {photoBusy ? "Fotó feldolgozása..." : activeIssue.photoDataUrl ? "Fotó cseréje" : "Fotó készítése / kiválasztása"}
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={photoBusy} onChange={(event) => { void handlePhoto(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {photoError ? <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{photoError}</div> : null}
            <div className="mt-3"><FieldLabel>Fotó megjegyzése</FieldLabel><textarea className={textareaClass} value={activeIssue.photoNote} onChange={(event) => onUpdateIssue(activeIssue.id, { photoNote: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Pl. A repedés a nyílászáró jobb felső sarkából indul." /></div>
          </div>

          <HoldActionButton tone="danger" durationMs={2000} icon={<Trash2 size={17} />} label="Hibajegy törlése · 2 mp" holdingLabel="Törléshez" ariaLabel={`${activeIssue.serial} hibajegy törléséhez tartsd nyomva 2 másodpercig`} onComplete={() => onDeleteIssue(activeIssue.id)} className="w-full" />
        </div>
      ) : null}
    </div>
  );
}
