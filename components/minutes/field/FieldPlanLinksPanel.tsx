"use client"

import { useMemo, useState } from "react"
import PlanViewerShell from "../../viewers/PlanViewerShell"
import type { PlanIssueMarker, PlanPageExport } from "../../viewers/PlanMarkerTypes"
import type { FieldPhoto } from "./FieldPhotosPanel"
import { getPlanViewerFileType, type PlanViewerFile } from "../../viewers/viewerTypes"

type PlanSource = "library" | "device"
type PlanSheetSize = "A4" | "A3"
type PlanOrientation = "portrait" | "landscape"

type PlanAnnotation = {
  id: string
  tool: "pen" | "arrow" | "rect" | "circle" | "text"
  x: number
  y: number
  width: number
  height: number
  color: string
  stroke: number
  text?: string
}

export type IssuePlanLink = {
  id: string
  issueId: string
  planName: string
  planSource: PlanSource
  pageNumber: number
  originalSheetLabel: string
  originalSheetWidthMm: number
  originalSheetHeightMm: number
  planPreviewUrl?: string
  planViewerUrl?: string
  previewOffsetX: number
  previewOffsetY: number
  previewZoom: number
  previewRotation: number
  sourceSheetSize: PlanSheetSize
  sourceOrientation: PlanOrientation
  scaleLocked: boolean
  drawingScale: string
  annotationTool: "select" | "pen" | "arrow" | "rect" | "circle" | "text"
  annotationColor: string
  annotationStroke: number
  annotationCount: number
  annotations: PlanAnnotation[]
  selectionLocked: boolean
  cropView: boolean
  sheetSize: PlanSheetSize
  orientation: PlanOrientation
  selectionX: number
  selectionY: number
  selectionWidth: number
  selectionHeight: number
  markerX: number
  markerY: number
  markerLabel: string
  planMarkers?: PlanIssueMarker[]
  planPageExports?: PlanPageExport[]
  finalized: boolean
}

export type ProjectPlanOption = {
  name: string
  sheetLabel: string
  widthMm: number
  heightMm: number
  previewKind: string
  url: string
}

type FieldPlanLinksPanelProps = {
  activeIssueId?: string
  activeIssueSerial?: string
  activeIssueTitle?: string
  allIssues?: Array<{
    id: string
    serial: string
    title: string
    location?: string
    description?: string
    severity?: string
    responsible?: string
    contractorRepresentative?: string
    deadline?: string
    status?: string
    note?: string
  }>
  activeIssuePlanLinks: IssuePlanLink[]
  activeIssuePhotos?: FieldPhoto[]
  reusablePlanLinks?: IssuePlanLink[]
  sampleProjectPlans: ProjectPlanOption[]
  planSheetSizeOptions: PlanSheetSize[]
  planOrientationOptions: { value: PlanOrientation; label: string }[]
  showPlanSourceMenu: boolean
  activeIssueExists: boolean
  onToggleOpen: () => void
  open: boolean
  onTogglePlanSourceMenu: () => void
  onAddPlanFromProjectLibrary: () => void
  onReuseExistingPlanLink?: (sourcePlanLinkId: string, includeMarkers?: boolean) => void
  onOpenDevicePlanUpload: () => void
  onNotifyFuturePlanSource: (sourceName: string) => void
  onUpdatePlanLink: (id: string, patch: Partial<IssuePlanLink>) => void
  onUpdatePlanSheetSize: (link: IssuePlanLink, sheetSize: PlanSheetSize) => void
  onUpdatePlanOrientation: (link: IssuePlanLink, orientation: PlanOrientation) => void
  onDeletePlanLink: (id: string) => void
  getSampleProjectPlanMeta: (planName: string) => ProjectPlanOption
  formatPlanSheetMeta: (label: string, widthMm: number, heightMm: number) => string
}

export default function FieldPlanLinksPanel({
  activeIssueId,
  activeIssueSerial,
  activeIssueTitle,
  allIssues,
  activeIssuePlanLinks,
  activeIssuePhotos = [],
  reusablePlanLinks = [],
  sampleProjectPlans,
  planSheetSizeOptions,
  planOrientationOptions,
  showPlanSourceMenu,
  activeIssueExists,
  onToggleOpen,
  open,
  onTogglePlanSourceMenu,
  onAddPlanFromProjectLibrary,
  onReuseExistingPlanLink,
  onOpenDevicePlanUpload,
  onNotifyFuturePlanSource,
  onUpdatePlanLink,
  onUpdatePlanSheetSize,
  onUpdatePlanOrientation,
  onDeletePlanLink,
  getSampleProjectPlanMeta,
  formatPlanSheetMeta,
}: FieldPlanLinksPanelProps) {
  const [viewerFile, setViewerFile] = useState<PlanViewerFile | null>(null)

  function openLinkedPlanViewer(link: IssuePlanLink) {
    const issueSerial = activeIssueSerial || link.markerLabel
    const issueTitle = activeIssueTitle || link.markerLabel || activeIssueSerial || "Tervi hibahely"
    const normalizedMarkers = link.planMarkers ?? []

    if (normalizedMarkers.length && JSON.stringify(normalizedMarkers) !== JSON.stringify(link.planMarkers ?? [])) {
      onUpdatePlanLink(link.id, { planMarkers: normalizedMarkers })
    }

    setViewerFile({
      id: link.id,
      name: link.planName,
      url: link.planViewerUrl || link.planPreviewUrl,
      type: getPlanViewerFileType(link.planName),
      pageNumber: link.pageNumber,
      issueId: activeIssueId || link.issueId,
      issueSerial,
      issueTitle,
      issues: allIssues,
      photos: activeIssuePhotos.map((photo) => ({
        id: photo.id,
        issueId: photo.issueId,
        serial: photo.serial,
        name: photo.name,
        note: photo.note,
        category: photo.category,
        url: photo.url,
        dataUrl: photo.dataUrl,
      })),
      markers: normalizedMarkers,
      planPageExports: link.planPageExports ?? [],
      onMarkersChange: (markers) => {
        const primaryMarker = markers[0]
        onUpdatePlanLink(link.id, {
          planMarkers: markers,
          annotationCount: markers.length,
          ...(primaryMarker ? { markerX: primaryMarker.xPercent, markerY: primaryMarker.yPercent, markerLabel: primaryMarker.serial } : {}),
        })
      },
      onPlanPageExportsChange: (exports) => {
        onUpdatePlanLink(link.id, { planPageExports: exports })
      },
    })
  }

  const firstOpenablePlanLink = useMemo(
    () => activeIssuePlanLinks.find((link) => Boolean(link.planViewerUrl || link.planPreviewUrl)) ?? null,
    [activeIssuePlanLinks],
  )
  const canOpenAnyPlan = Boolean(firstOpenablePlanLink)

  function openFirstAvailablePlanViewer() {
    if (!firstOpenablePlanLink) return
    openLinkedPlanViewer(firstOpenablePlanLink)
  }

  return (
    <div className="border border-cyan-200 bg-white/95 shadow-sm">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cyan-50">
        <span><span className="block text-sm font-black uppercase tracking-[0.1em] text-slate-700">Tervi hibajelölés</span><span className="mt-1 block text-xs font-semibold text-slate-500">{activeIssuePlanLinks.length} tervlap · HJ + fotóhely marker</span></span>
        <span className="text-xl font-black text-cyan-800">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-cyan-100 p-4">
          <div className="border border-dashed border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold leading-5 text-cyan-900/80">
            A tervi / modell jelölés nem kötelező. Egy TH hibához több PDF tervlap, IFC modell vagy képi terv is kapcsolható. Minden kapcsolt fájl külön megnyitható, és saját HJ HexPin jelöléseket kaphat.
          </div>
          <div className="relative mt-3 border border-slate-200 bg-white p-3">
            <button type="button" onClick={onTogglePlanSourceMenu} disabled={!activeIssueExists} className="w-full border border-cyan-700 bg-cyan-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800 disabled:opacity-50">Új terv / másik szint hozzáadása ▾</button>
            {showPlanSourceMenu && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 border border-slate-300 bg-white p-2 text-left shadow-2xl">
                {reusablePlanLinks.length ? (
                  <>
                    <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-800">Már használt tervlapból</div>
                    {reusablePlanLinks.slice(0, 8).map((plan) => (
                      <div key={plan.id} className="border border-cyan-100 bg-cyan-50/45 p-2">
                        <div className="truncate text-xs font-black text-slate-800">↻ {plan.planName}</div>
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                          <button type="button" onClick={() => onReuseExistingPlanLink?.(plan.id, false)} className="border border-cyan-200 bg-white px-2 py-2 text-[11px] font-black uppercase tracking-[0.06em] text-cyan-800 hover:bg-cyan-50">Jelölések nélkül</button>
                          <button type="button" onClick={() => onReuseExistingPlanLink?.(plan.id, true)} className="border border-cyan-200 bg-white px-2 py-2 text-[11px] font-black uppercase tracking-[0.06em] text-cyan-800 hover:bg-cyan-50">HJ jelölésekkel</button>
                        </div>
                      </div>
                    ))}
                    <div className="my-1 border-t border-slate-100" />
                  </>
                ) : null}
                <button type="button" onClick={onAddPlanFromProjectLibrary} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-cyan-50"><span>▦ Projekt tervtárból</span><small className="text-[10px] font-black uppercase text-cyan-800">Aktív</small></button>
                <button type="button" onClick={onOpenDevicePlanUpload} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"><span>⇧ Feltöltés eszközről</span><small className="text-[10px] font-black uppercase text-cyan-800">Aktív</small></button>
                <div className="my-1 border-t border-slate-100" />
                {['Google Drive', 'OneDrive / SharePoint', 'Dropbox', 'URL / link alapú import'].map((source) => (
                  <button key={source} type="button" onClick={() => onNotifyFuturePlanSource(source)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-slate-400 hover:bg-slate-50"><span>{source}</span><small className="text-[10px] font-black uppercase">Hamarosan</small></button>
                ))}
              </div>
            )}
          </div>
          {activeIssuePlanLinks.length > 1 ? (
            <div className="mt-3 border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold leading-5 text-cyan-900">
              Ehhez a TH hibához több terv / modell fájl van kapcsolva. A HJ jelölések fájlonként külön mentődnek, a jegyzőkönyvben pedig közös TH alatt jelennek meg.
            </div>
          ) : null}
          <div className="mt-3 grid gap-3">
            {activeIssuePlanLinks.map((link, index) => (
              <div key={link.id} className="border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-cyan-800">{link.markerLabel || activeIssueSerial} · {index + 1}. kapcsolt terv</div>
                    <div className="mt-1 text-sm font-black text-slate-900">{link.planName}</div>
                  </div>
                  <span className={`border px-2 py-1 text-[10px] font-black uppercase ${link.finalized ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{link.finalized ? "véglegesítve" : "vázlat"}</span>
                </div>
                <div className="mt-3 border border-slate-300 bg-white p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Tervelőnézet kiszervezve</div>
                  <div className="mt-2 border border-dashed border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold leading-5 text-cyan-900/80">
                    A PDF tervlap, IFC modell vagy képi terv megnyitása és hibapontozása a közös tervnéző / modellnéző modulban történik.
                  </div>
                  <button
                    type="button"
                    onClick={() => openLinkedPlanViewer(link)}
                    disabled={!link.planViewerUrl && !link.planPreviewUrl}
                    className="mt-3 w-full border border-cyan-700 bg-cyan-700 px-3 py-3 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Terv / modell hibajelölés megnyitása
                  </button>
                  {!link.planViewerUrl && !link.planPreviewUrl ? (
                    <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-800">
                      Ehhez a tervkapcsolathoz még nincs elérhető PDF/IFC/kép URL. Feltöltött terv vagy modell esetén a viewer automatikusan megnyílik.
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2 text-[11px] font-black uppercase tracking-[0.06em] text-slate-500">
                    <div className="border border-slate-200 bg-slate-50 px-2 py-1.5">Kapcsolt terv: {link.planName}</div>
                    <div className="border border-slate-200 bg-slate-50 px-2 py-1.5">Oldal: {link.pageNumber}. · Méret: {link.sheetSize} {link.orientation === "landscape" ? "fekvő" : "álló"}</div>
                    <div className="border border-slate-200 bg-slate-50 px-2 py-1.5">Jelölő: {link.markerLabel} · HJ: {(link.planMarkers ?? []).filter((marker) => marker.markerKind !== "photo").length} · Fotóhely: {(link.planMarkers ?? []).filter((marker) => marker.markerKind === "photo").length}</div>
                    <div className={`border px-2 py-1.5 ${(link.planPageExports?.length ?? 0) ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>Teljes tervlap melléklet: {(link.planPageExports?.length ?? 0) ? `${link.planPageExports?.length} oldal mentve` : "még nincs mentve"}</div>
                  {(link.planMarkers?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {(link.planMarkers ?? []).some((marker) => !marker.cropImageDataUrl) ? (
                        <div className="border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
                          Hiányzó tervrészlet-kép: {(link.planMarkers ?? []).filter((marker) => !marker.cropImageDataUrl).length} marker. Nyisd meg a közös tervnézőt, majd használd a Részletkép mentése gombot.
                        </div>
                      ) : (
                        <div className="border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-cyan-800">
                          Minden HexPin markerhez van mentett PDF tervrészlet-kép.
                        </div>
                      )}
                    </div>
                  ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => onUpdatePlanLink(link.id, { finalized: !link.finalized })} className="border border-cyan-700 bg-cyan-700 px-3 py-2 text-xs font-black uppercase text-white">{link.finalized ? "Tervrészlet szerkesztése" : "Kijelölés véglegesítése"}</button>
                  <button type="button" onClick={() => onDeletePlanLink(link.id)} className="border border-red-200 bg-red-50 px-3 py-2 text-xs font-black uppercase text-red-700">Tervkapcsolat törlése</button>
                </div>
              </div>
            ))}
            {!canOpenAnyPlan && activeIssuePlanLinks.length ? <div className="border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800">A közös tervnéző aktív, de jelenleg csak olyan tervkapcsolat nyitható meg, amelynek van PDF/IFC/kép URL-je.</div> : null}
            {!activeIssuePlanLinks.length && <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Ehhez a hibához nincs tervkapcsolat. Ez elfogadott állapot, ha a hiba terv nélkül is azonosítható.</div>}
          </div>
        </div>
      )}
      {viewerFile ? <PlanViewerShell file={viewerFile} onClose={() => setViewerFile(null)} /> : null}
    </div>
  )
}
