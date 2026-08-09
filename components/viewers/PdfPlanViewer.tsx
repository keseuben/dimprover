"use client"

import { useEffect, useRef, useState } from "react"
import PlanHexMarker from "./PlanHexMarker"
import {
  getMarkerSeverityVisual,
  getMarkerStatusVisual,
  getPlanIssueDisciplineMeta,
  planIssueDisciplines,
  planMarkerOrientationOptions,
  planMarkerPaperSizeOptions,
  planMarkerSeverityOptions,
  type PlanIssueDiscipline,
  type PlanIssueMarker,
  type PlanMarkerOrientation,
  type PlanMarkerPaperSize,
  type PlanPageExport,
} from "./PlanMarkerTypes"
import type { PlanViewerFile } from "./viewerTypes"
import { loadSharedPdfJs, type SharedPdfDocument, type SharedPdfJsModule } from "./pdfDocumentEngine"


const markerTitlePresets = [
  "Hiányzó vagy sérült szegélyelem",
  "Pontatlan nyílászáró beállítás",
  "Sérült burkolati él",
  "Hiányzó rögzítés / takaróelem",
  "Felületi sérülés vagy karcolás",
  "Eltérő kivitelezés a tervhez képest",
  "Hiányzó tömítés vagy hézagkitöltés",
  "Nem megfelelő csatlakozási részlet",
  "Utólagos javítást igénylő részlet",
  "Ellenőrizendő műszaki eltérés",
]

const markerDescriptionPresets = [
  "A kivitelezés nem felel meg a helyszíni elvárásnak, javítás szükséges.",
  "A jelölt ponton tervtől eltérő állapot látható, műszaki egyeztetés szükséges.",
  "A hibás részlet javítása és fotós visszaellenőrzése szükséges.",
  "A jelölt szerkezeti csatlakozás nem megfelelő, kivitelezői javítás szükséges.",
  "A helyszíni állapot dokumentálva, felelős vállalkozói visszajelzés szükséges.",
  "A jelölt területen hiányos vagy sérült kivitelezési részlet található.",
  "A megjelölt ponton a munkarész átadás előtt javítandó.",
  "A tervi helyen ellenőrzés és szükség szerinti pótlás / javítás szükséges.",
  "A kivitelezési eltérés további műszaki ellenőri egyeztetést igényel.",
  "A hiba lezárásához javítás utáni fotódokumentáció szükséges.",
]

function MarkerPresetSelect({ label, options, onSelect }: { label: string; options: string[]; onSelect: (value: string) => void }) {
  const [query, setQuery] = useState("")
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="mb-2 border border-slate-200 bg-slate-50/80 p-2">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label} mintaszövegek</div>
      <div className="grid gap-2">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-black leading-none text-slate-500">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Keresés mintaszövegben"
            className="h-9 w-full border border-slate-300 bg-white pl-10 pr-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-500"
          />
        </label>
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value) return
            onSelect(event.target.value)
            setQuery("")
          }}
          className="h-9 border border-cyan-200 bg-white px-3 text-xs font-bold text-cyan-900 outline-none focus:border-cyan-500"
        >
          <option value="">Válassz mintaszöveget...</option>
          {filteredOptions.map((option, index) => (
            <option key={option} value={option}>{index + 1}. {option}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

type PdfPlanViewerProps = {
  file: PlanViewerFile
  onSaveAndClose?: () => void
}

type ExportFrame = {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

type PdfJsDocument = SharedPdfDocument
type PdfJsModule = SharedPdfJsModule

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const DEFAULT_ZOOM = 1
const PDF_HEXPIN_EXPORT_VERSION = "pdf-hexpin-frame-v1"

export default function PdfPlanViewer({ file, onSaveAndClose }: PdfPlanViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const documentRef = useRef<PdfJsDocument | null>(null)
  const renderRunRef = useRef(0)
  const zoomAnchorRef = useRef<{ xPercent: number; yPercent: number } | null>(null)
  const dragMarkerRef = useRef<{ markerId: string; moved: boolean; cloneOnDrag: boolean; clonedMarkerId?: string } | null>(null)
  const dragExportFrameRef = useRef<{ startClientX: number; startClientY: number; startFrame: ExportFrame } | null>(null)
  const dragPanelRef = useRef<{ panel: "marker" | "export" | "photo"; startClientX: number; startClientY: number; startX: number; startY: number; startXScroll?: number; startYScroll?: number } | null>(null)
  const pendingPageClickRef = useRef<{ pointerId: number; clientX: number; clientY: number; button: number } | null>(null)
  const [pdfJs, setPdfJs] = useState<PdfJsModule | null>(null)
  const [pageNumber, setPageNumber] = useState(file.pageNumber || 1)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [autoFitPage, setAutoFitPage] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState("")
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [pagePhysicalSizeMm, setPagePhysicalSizeMm] = useState<{ widthMm: number; heightMm: number } | null>(null)
  const [sourceKind, setSourceKind] = useState("nincs forrás")
  const [activeDiscipline, setActiveDiscipline] = useState<PlanIssueDiscipline>("architecture")
  const [showMarkerLetters, setShowMarkerLetters] = useState(true)
  const [markerPaperSize, setMarkerPaperSize] = useState<PlanMarkerPaperSize>("A5")
  const [markerOrientation, setMarkerOrientation] = useState<PlanMarkerOrientation>("landscape")
  const [markers, setMarkers] = useState<PlanIssueMarker[]>(file.markers ?? [])
  const [planPageExports, setPlanPageExports] = useState<PlanPageExport[]>(file.planPageExports ?? [])
  const [activeIssueId, setActiveIssueId] = useState(file.issueId || file.issues?.[0]?.id || "")
  const [showOnlyActiveIssueMarkers, setShowOnlyActiveIssueMarkers] = useState(false)
  const [markerPlacementMode, setMarkerPlacementMode] = useState<"issue" | "photo">("issue")
  const [selectedPhotoIdForMarker, setSelectedPhotoIdForMarker] = useState(file.photos?.[0]?.id || "")
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [pulseMarkerId, setPulseMarkerId] = useState<string | null>(null)
  const [exportFrame, setExportFrame] = useState<ExportFrame>({ xPercent: 18, yPercent: 22, widthPercent: 56, heightPercent: 42 })
  const [exportFrameVisible, setExportFrameVisible] = useState(false)
  const [markerPanelPosition, setMarkerPanelPosition] = useState({ x: Math.max(360, window.innerWidth - 340), y: 150 })
  const [exportPanelPosition, setExportPanelPosition] = useState({ x: Math.max(360, window.innerWidth - 680), y: 150 })
  const [photoPanelPosition, setPhotoPanelPosition] = useState({ x: Math.max(360, window.innerWidth - 1010), y: 150 })
  const [markerPanelCollapsed, setMarkerPanelCollapsed] = useState(false)
  const [exportPanelCollapsed, setExportPanelCollapsed] = useState(true)
  const [photoPanelCollapsed, setPhotoPanelCollapsed] = useState(false)


  useEffect(() => {
    setMarkers((file.markers ?? []).map((marker) => marker.cropImageDataUrl && marker.cropHexpinExportVersion !== PDF_HEXPIN_EXPORT_VERSION ? { ...marker, cropImageDataUrl: undefined, cropImageGeneratedAt: undefined } : marker))
    setPlanPageExports(file.planPageExports ?? [])
    setActiveIssueId(file.activeIssueId || file.issueId || file.issues?.[0]?.id || "")
    setSelectedMarkerId(file.selectedMarkerId ?? file.markers?.[0]?.id ?? null)
  }, [file.id, file.issueId, file.markers, file.planPageExports, file.issues, file.activeIssueId, file.selectedMarkerId])

  useEffect(() => {
    if (file.activeIssueId && file.activeIssueId !== activeIssueId) setActiveIssueId(file.activeIssueId)
  }, [file.activeIssueId])

  useEffect(() => {
    if (file.selectedMarkerId !== undefined) setSelectedMarkerId(file.selectedMarkerId)
  }, [file.selectedMarkerId])

  useEffect(() => {
    if (!file.photos?.length) {
      setSelectedPhotoIdForMarker("")
      if (markerPlacementMode === "photo") setMarkerPlacementMode("issue")
      return
    }
    setSelectedPhotoIdForMarker((current) => current && file.photos?.some((photo) => photo.id === current) ? current : file.photos?.[0]?.id || "")
  }, [file.photos, markerPlacementMode])

  useEffect(() => {
    if (!file.focusMarkerRequest || !file.selectedMarkerId) return
    focusMarkerOnStage(file.selectedMarkerId)
    triggerMarkerPulse(file.selectedMarkerId)
  }, [file.focusMarkerRequest, file.selectedMarkerId, markers, pageSize])

  useEffect(() => {
    function handleDeleteSelectedMarker(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditingField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable
      if (isEditingField) return
      if ((event.key === "Delete" || event.key === "Backspace") && selectedMarkerId) {
        event.preventDefault()
        const nextMarkers = markers.filter((marker) => marker.id !== selectedMarkerId)
        commitMarkers(nextMarkers)
        const nextSelected = nextMarkers[0]?.id ?? null
        setSelectedMarkerId(nextSelected)
        file.onSelectedMarkerChange?.(nextSelected)
      }
    }
    window.addEventListener("keydown", handleDeleteSelectedMarker)
    return () => window.removeEventListener("keydown", handleDeleteSelectedMarker)
  }, [selectedMarkerId, markers])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    function handleNativeWheel(event: WheelEvent) {
      if (!event.ctrlKey || !event.altKey) return
      event.preventDefault()
      event.stopPropagation()
      captureZoomAnchor()
      setAutoFitPage(false)
      const direction = event.deltaY > 0 ? -1 : 1
      const step = event.shiftKey ? 0.05 : 0.1
      setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + direction * step).toFixed(2)))))
    }

    stage.addEventListener("wheel", handleNativeWheel, { passive: false })
    return () => stage.removeEventListener("wheel", handleNativeWheel)
  }, [])

  useEffect(() => {
    function stopFloatingPanelDrag() {
      dragPanelRef.current = null
    }

    window.addEventListener("pointerup", stopFloatingPanelDrag)
    window.addEventListener("pointercancel", stopFloatingPanelDrag)
    window.addEventListener("blur", stopFloatingPanelDrag)
    return () => {
      window.removeEventListener("pointerup", stopFloatingPanelDrag)
      window.removeEventListener("pointercancel", stopFloatingPanelDrag)
      window.removeEventListener("blur", stopFloatingPanelDrag)
    }
  }, [])

  function commitMarkers(nextMarkers: PlanIssueMarker[]) {
    setMarkers(nextMarkers)
    file.onMarkersChange?.(nextMarkers)
  }

  function commitPlanPageExports(nextExports: PlanPageExport[]) {
    setPlanPageExports(nextExports)
    file.onPlanPageExportsChange?.(nextExports)
  }

  useEffect(() => {
    let cancelled = false

    async function loadPdfJs() {
      try {
        const pdfModule = await loadSharedPdfJs()
        if (!cancelled) setPdfJs(pdfModule)
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) setError("A PDF.js betöltése nem sikerült.")
      }
    }

    loadPdfJs()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!pdfJs || !file.url) return
    let cancelled = false
    const previousDocument = documentRef.current

    async function loadDocument() {
      if (!pdfJs || !file.url) return
      setLoading(true)
      setError("")
      setPageCount(0)
      setPageSize(null)
      setSourceKind(file.url.startsWith("blob:") ? "feltöltött blob PDF" : file.url.startsWith("data:") ? "data URL PDF" : "URL alapú PDF")
      try {
        const loadingTask = pdfJs.getDocument({ url: file.url })
        const loadedDocument = await loadingTask.promise
        if (cancelled) {
          loadedDocument.destroy?.()
          return
        }
        previousDocument?.destroy?.()
        documentRef.current = loadedDocument
        setPageCount(loadedDocument.numPages)
        setPageNumber((current) => Math.min(Math.max(file.pageNumber || current || 1, 1), loadedDocument.numPages))
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) setError("A PDF tervlap betöltése nem sikerült. Ellenőrizd a fájl URL-t, blob forrást vagy jogosultságot.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDocument()

    return () => {
      cancelled = true
    }
  }, [pdfJs, file.url, file.pageNumber])

  useEffect(() => {
    const document = documentRef.current
    const canvas = canvasRef.current
    if (!document || !canvas || !pageCount) return

    let cancelled = false
    const runId = renderRunRef.current + 1
    renderRunRef.current = runId

    async function renderPage() {
      if (!document || !canvas) return
      const targetCanvas = canvas
      setRendering(true)
      setError("")
      try {
        const page = await document.getPage(pageNumber)
        if (cancelled || renderRunRef.current !== runId) return

        const viewport = page.getViewport({ scale: zoom, rotation })
        const context = targetCanvas.getContext("2d")
        if (!context) throw new Error("Canvas context nem elérhető")

        const devicePixelRatio = window.devicePixelRatio || 1
        targetCanvas.width = Math.floor(viewport.width * devicePixelRatio)
        targetCanvas.height = Math.floor(viewport.height * devicePixelRatio)
        targetCanvas.style.width = `${Math.floor(viewport.width)}px`
        targetCanvas.style.height = `${Math.floor(viewport.height)}px`
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
        context.clearRect(0, 0, viewport.width, viewport.height)
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, viewport.width, viewport.height)
        setPageSize({ width: Math.round(viewport.width), height: Math.round(viewport.height) })
        const physicalViewport = page.getViewport({ scale: 1, rotation })
        setPagePhysicalSizeMm({
          widthMm: physicalViewport.width * 25.4 / 72,
          heightMm: physicalViewport.height * 25.4 / 72,
        })

        const renderTask = page.render({ canvasContext: context, canvas: targetCanvas, viewport })
        await renderTask.promise
        if (!cancelled && renderRunRef.current === runId) window.requestAnimationFrame(restoreZoomAnchor)
      } catch (renderError) {
        const errorName = renderError instanceof Error ? renderError.name : ""
        const errorMessage = renderError instanceof Error ? renderError.message : ""
        const isExpectedRenderCancel = errorName === "RenderingCancelledException" || errorName === "AbortException" || errorMessage.toLowerCase().includes("cancel")
        if (isExpectedRenderCancel) return
        console.error(renderError)
        if (!cancelled && renderRunRef.current === runId) setError("A PDF oldal renderelése nem sikerült.")
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    renderPage()

    return () => {
      cancelled = true
    }
  }, [pageNumber, zoom, rotation, pageCount])

  function triggerMarkerPulse(markerId: string | null) {
    if (!markerId) return
    setPulseMarkerId(markerId)
    window.setTimeout(() => {
      setPulseMarkerId((current) => current === markerId ? null : current)
    }, 1600)
  }

  function focusMarkerOnStage(markerId: string) {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const marker = markers.find((item) => item.id === markerId)
    if (!stage || !canvas || !marker) return
    const markerX = (marker.xPercent / 100) * canvas.offsetWidth
    const markerY = (marker.yPercent / 100) * canvas.offsetHeight
    const targetLeft = Math.max(0, markerX - stage.clientWidth / 2)
    const targetTop = Math.max(0, markerY - stage.clientHeight / 2)
    stage.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" })
  }

  function captureZoomAnchor() {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas || !canvas.offsetWidth || !canvas.offsetHeight) return
    zoomAnchorRef.current = {
      xPercent: Math.min(100, Math.max(0, ((stage.scrollLeft + stage.clientWidth / 2) / canvas.offsetWidth) * 100)),
      yPercent: Math.min(100, Math.max(0, ((stage.scrollTop + stage.clientHeight / 2) / canvas.offsetHeight) * 100)),
    }
  }

  function restoreZoomAnchor() {
    const anchor = zoomAnchorRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!anchor || !stage || !canvas) return
    const targetLeft = Math.max(0, (anchor.xPercent / 100) * canvas.offsetWidth - stage.clientWidth / 2)
    const targetTop = Math.max(0, (anchor.yPercent / 100) * canvas.offsetHeight - stage.clientHeight / 2)
    stage.scrollTo({ left: targetLeft, top: targetTop, behavior: "auto" })
    zoomAnchorRef.current = null
  }

  function changeZoom(delta: number) {
    captureZoomAnchor()
    setAutoFitPage(false)
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2)))))
  }

  async function fitToPage() {
    const document = documentRef.current
    const stage = stageRef.current
    if (!document || !stage) return
    try {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1, rotation })
      const availableWidth = Math.max(320, stage.clientWidth - 64)
      const availableHeight = Math.max(320, stage.clientHeight - 64)
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((Math.min(availableWidth / viewport.width, availableHeight / viewport.height)).toFixed(2))))
      zoomAnchorRef.current = null
      setZoom(nextZoom)
      window.setTimeout(() => stage.scrollTo({ left: 0, top: 0, behavior: "auto" }), 80)
    } catch (fitError) {
      console.error(fitError)
      setError("Teljes laphoz igazítás nem sikerült.")
    }
  }

  async function fitToWidth() {
    const document = documentRef.current
    const stage = stageRef.current
    if (!document || !stage) return
    try {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1, rotation })
      const availableWidth = Math.max(320, stage.clientWidth - 48)
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((availableWidth / viewport.width).toFixed(2))))
      setAutoFitPage(false)
      zoomAnchorRef.current = null
      setZoom(nextZoom)
      window.setTimeout(() => stage.scrollTo({ left: 0, top: 0, behavior: "auto" }), 80)
    } catch (fitError) {
      console.error(fitError)
      setError("Oldalszélességhez igazítás nem sikerült.")
    }
  }


  useEffect(() => {
    if (!autoFitPage || !pageCount || !documentRef.current || !stageRef.current) return
    fitToPage()
  }, [autoFitPage, pageNumber, rotation, pageCount])

  useEffect(() => {
    if (!autoFitPage || !pageCount) return
    function handleResize() {
      fitToPage()
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [autoFitPage, pageCount, pageNumber, rotation])

  function goToPage(nextPage: number) {
    if (!pageCount) return
    setPageNumber(Math.min(Math.max(nextPage, 1), pageCount))
  }

  function drawExportHexPin(context: CanvasRenderingContext2D, marker: PlanIssueMarker, x: number, y: number) {
    const meta = getPlanIssueDisciplineMeta(marker.discipline)
    const isPhotoMarker = marker.markerKind === "photo"
    const severityVisual = getMarkerSeverityVisual(marker.issueSeverity)
    const statusVisual = getMarkerStatusVisual(marker.status || marker.issueStatus)
    const issueSerial = isPhotoMarker ? marker.photoSerial || "FOTÓ" : marker.issueSerial || marker.issueId || "TH"
    const hjSerial = isPhotoMarker ? marker.serial || "FHJ" : marker.serial || "HJ"

    const markerWidth = 92
    const markerHeight = 112
    const centerX = markerWidth / 2
    const tipY = markerHeight
    const bubbleY = 28
    const bubbleRadius = 30
    const labelHeight = 22

    context.save()
    context.translate(x - centerX, y - tipY)

    context.save()
    context.shadowColor = "rgba(15,23,42,0.48)"
    context.shadowBlur = 12
    context.shadowOffsetY = 8

    context.beginPath()
    context.moveTo(centerX, tipY)
    context.lineTo(centerX - 9, bubbleY + bubbleRadius - 1)
    context.lineTo(centerX + 9, bubbleY + bubbleRadius - 1)
    context.closePath()
    context.fillStyle = isPhotoMarker ? "#1d4ed8" : meta.hexColor
    context.fill()
    context.strokeStyle = "#0f172a"
    context.lineWidth = 4
    context.stroke()

    context.beginPath()
    context.arc(centerX, bubbleY + bubbleRadius * 0.64, bubbleRadius, 0, Math.PI * 2)
    context.fillStyle = isPhotoMarker ? "#dbeafe" : meta.lightHexColor
    context.fill()
    context.lineWidth = isPhotoMarker ? 5 : 4
    context.strokeStyle = isPhotoMarker ? "#1d4ed8" : severityVisual.strokeColor || "#0f172a"
    context.stroke()
    context.restore()

    context.beginPath()
    context.arc(centerX, tipY, 5, 0, Math.PI * 2)
    context.fillStyle = isPhotoMarker ? "#1d4ed8" : severityVisual.strokeColor || "#0f172a"
    context.fill()
    context.strokeStyle = "#ffffff"
    context.lineWidth = 2
    context.stroke()

    context.font = "900 14px Arial"
    context.textAlign = "center"
    context.textBaseline = "middle"
    const labelWidth = Math.max(68, context.measureText(issueSerial).width + 18)
    const labelX = centerX - labelWidth / 2
    context.fillStyle = "rgba(255,255,255,0.98)"
    context.strokeStyle = "#0f172a"
    context.lineWidth = 2
    context.beginPath()
    context.roundRect(labelX, 0, labelWidth, labelHeight, 5)
    context.fill()
    context.stroke()
    context.fillStyle = "#0f172a"
    context.fillText(issueSerial, centerX, labelHeight / 2 + 0.5)

    context.fillStyle = "#0f172a"
    context.font = "900 15px Arial"
    context.fillText(hjSerial, centerX, bubbleY + 34)

    const badgeSize = 25
    const bx = centerX - badgeSize / 2
    const by = bubbleY + 49
    context.beginPath()
    context.moveTo(bx + badgeSize * 0.25, by + badgeSize * 0.06)
    context.lineTo(bx + badgeSize * 0.75, by + badgeSize * 0.06)
    context.lineTo(bx + badgeSize, by + badgeSize * 0.5)
    context.lineTo(bx + badgeSize * 0.75, by + badgeSize * 0.94)
    context.lineTo(bx + badgeSize * 0.25, by + badgeSize * 0.94)
    context.lineTo(bx, by + badgeSize * 0.5)
    context.closePath()
    context.fillStyle = isPhotoMarker ? "#1d4ed8" : meta.hexColor
    context.fill()
    context.strokeStyle = "#ffffff"
    context.lineWidth = 2
    context.stroke()

    if (marker.showLetter || isPhotoMarker) {
      context.fillStyle = "#ffffff"
      context.font = "900 13px Arial"
      context.fillText(isPhotoMarker ? "F" : meta.shortLabel, centerX, by + badgeSize / 2 + 1)
    }

    if (severityVisual.showBang) {
      context.beginPath()
      context.arc(centerX + 36, bubbleY + 22, 12, 0, Math.PI * 2)
      context.fillStyle = "#b91c1c"
      context.fill()
      context.fillStyle = "#ffffff"
      context.font = "900 13px Arial"
      context.fillText("!", centerX + 36, bubbleY + 23)
    }

    if (statusVisual.type !== "none") {
      context.beginPath()
      context.arc(centerX + 34, bubbleY + 63, 9, 0, Math.PI * 2)
      context.fillStyle = statusVisual.color
      context.fill()
      if (statusVisual.type === "check") {
        context.fillStyle = "#ffffff"
        context.font = "900 13px Arial"
        context.fillText("✓", centerX + 34, bubbleY + 63)
      }
    }

    context.restore()
  }

  function getCropAspect(marker: PlanIssueMarker) {
    const base = marker.paperSize === "A5" ? { w: 210, h: 148 } : marker.paperSize === "A3" ? { w: 420, h: 297 } : { w: 297, h: 210 }
    return marker.orientation === "portrait" ? base.h / base.w : base.w / base.h
  }

  function getPaperFrameAspect(paperSize: PlanMarkerPaperSize, orientation: PlanMarkerOrientation) {
    const option = planMarkerPaperSizeOptions.find((item) => item.value === paperSize)
    const base = option ? { w: option.widthMm, h: option.heightMm } : { w: 297, h: 210 }
    return orientation === "portrait" ? base.h / base.w : base.w / base.h
  }

  function getPaperFrameScale(paperSize: PlanMarkerPaperSize) {
    if (paperSize === "A5") return 0.56
    if (paperSize === "A3") return 0.82
    return 0.68
  }

  function normalizePdfPhysicalSizeMm(size: { widthMm: number; heightMm: number }) {
    const width = size.widthMm
    const height = size.heightMm
    const name = `${file.name || ""} ${file.url || ""}`.toLowerCase()
    if (name.includes("a3") && (name.includes("fekv") || name.includes("landscape"))) return { widthMm: 420, heightMm: 297 }
    if (name.includes("a3") && (name.includes("allo") || name.includes("álló") || name.includes("portrait"))) return { widthMm: 297, heightMm: 420 }
    if (name.includes("a4") && (name.includes("fekv") || name.includes("landscape"))) return { widthMm: 297, heightMm: 210 }
    if (name.includes("a4") && (name.includes("allo") || name.includes("álló") || name.includes("portrait"))) return { widthMm: 210, heightMm: 297 }

    const longSide = Math.max(width, height)
    const shortSide = Math.min(width, height)
    const standardSizes = [
      { label: "A0", long: 1189, short: 841 },
      { label: "A1", long: 841, short: 594 },
      { label: "A2", long: 594, short: 420 },
      { label: "A3", long: 420, short: 297 },
      { label: "A4", long: 297, short: 210 },
      { label: "A5", long: 210, short: 148 },
    ]
    const matched = standardSizes.find((paper) => {
      const longDiff = Math.abs(longSide - paper.long) / paper.long
      const shortDiff = Math.abs(shortSide - paper.short) / paper.short
      return longDiff <= 0.22 && shortDiff <= 0.22
    })
    if (!matched) return size
    const landscape = width >= height
    return landscape ? { widthMm: matched.long, heightMm: matched.short } : { widthMm: matched.short, heightMm: matched.long }
  }

  function getPdfPagePhysicalSizeMm() {
    return pagePhysicalSizeMm ? normalizePdfPhysicalSizeMm(pagePhysicalSizeMm) : null
  }

  function getPaperSizeMm(paperSize: PlanMarkerPaperSize, orientation: PlanMarkerOrientation) {
    const option = planMarkerPaperSizeOptions.find((item) => item.value === paperSize)
    const base = option ? { widthMm: option.widthMm, heightMm: option.heightMm } : { widthMm: 297, heightMm: 210 }
    return orientation === "portrait" ? { widthMm: base.heightMm, heightMm: base.widthMm } : base
  }

  function clampExportFrame(frame: ExportFrame): ExportFrame {
    const widthPercent = Math.max(5, Math.min(100, frame.widthPercent))
    const heightPercent = Math.max(5, Math.min(100, frame.heightPercent))
    const xPercent = Math.max(0, Math.min(100 - widthPercent, frame.xPercent))
    const yPercent = Math.max(0, Math.min(100 - heightPercent, frame.yPercent))
    return { xPercent, yPercent, widthPercent, heightPercent }
  }

  function buildPaperExportFrame(paperSize: PlanMarkerPaperSize, orientation: PlanMarkerOrientation): ExportFrame {
    const pdfSize = getPdfPagePhysicalSizeMm()
    const paper = getPaperSizeMm(paperSize, orientation)
    if (!pdfSize) return clampExportFrame({ xPercent: 5, yPercent: 5, widthPercent: 90, heightPercent: 90 })

    const widthRatio = paper.widthMm / pdfSize.widthMm
    const heightRatio = paper.heightMm / pdfSize.heightMm
    const samePhysicalPage = Math.abs(widthRatio - 1) <= 0.03 && Math.abs(heightRatio - 1) <= 0.03
    if (samePhysicalPage) {
      return { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 }
    }

    const fitRatio = 1 / Math.max(1, widthRatio, heightRatio)
    const widthPercent = Math.min(100, Math.max(8, widthRatio * fitRatio * 100))
    const heightPercent = Math.min(100, Math.max(8, heightRatio * fitRatio * 100))

    return clampExportFrame({
      xPercent: (100 - widthPercent) / 2,
      yPercent: (100 - heightPercent) / 2,
      widthPercent,
      heightPercent,
    })
  }

  function placeExportFrameOnPage() {
    const paperSize = selectedMarker?.paperSize || markerPaperSize
    const orientation = selectedMarker?.orientation || markerOrientation
    setExportFrame(buildPaperExportFrame(paperSize, orientation))
    setExportFrameVisible(true)
    setExportPanelCollapsed(false)
  }

  function resizeExportFrameToPaper(paperSize: PlanMarkerPaperSize, orientation: PlanMarkerOrientation) {
    setExportFrame(buildPaperExportFrame(paperSize, orientation))
    setExportFrameVisible(true)
  }


  function getViewerPointerPercent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      xPercent: ((event.clientX - rect.left) / rect.width) * 100,
      yPercent: ((event.clientY - rect.top) / rect.height) * 100,
    }
  }

  function beginExportFrameDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragExportFrameRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFrame: exportFrame,
    }
  }

  function moveExportFrameDrag(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragExportFrameRef.current
    if (!dragState) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const deltaX = ((event.clientX - dragState.startClientX) / rect.width) * 100
    const deltaY = ((event.clientY - dragState.startClientY) / rect.height) * 100
    setExportFrame(clampExportFrame({
      ...dragState.startFrame,
      xPercent: dragState.startFrame.xPercent + deltaX,
      yPercent: dragState.startFrame.yPercent + deltaY,
    }))
  }

  function endExportFrameDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragExportFrameRef.current) {
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    }
    dragExportFrameRef.current = null
  }


  function getCropFrame(marker: PlanIssueMarker) {
    return exportFrame
  }

  function createMarkerCrop(marker: PlanIssueMarker) {
    const source = canvasRef.current
    if (!source || !pageSize || !exportFrameVisible) return marker
    const frame = getCropFrame(marker)
    const sourceX = (frame.xPercent / 100) * source.width
    const sourceY = (frame.yPercent / 100) * source.height
    const sourceWidth = (frame.widthPercent / 100) * source.width
    const sourceHeight = (frame.heightPercent / 100) * source.height
    const cropAspect = sourceWidth / sourceHeight
    const outputWidth = marker.paperSize === "A5" ? 1120 : marker.paperSize === "A3" ? 1800 : 1500
    const outputHeight = Math.round(outputWidth / cropAspect)
    const output = document.createElement("canvas")
    output.width = outputWidth
    output.height = outputHeight
    const context = output.getContext("2d")
    if (!context) return marker
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, output.width, output.height)
    context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height)
    const cropMarkers = (showOnlyActiveIssueMarkers ? markers.filter((item) => item.issueId === activeIssueId) : markers).filter((item) => (item.pageNumber || 1) === pageNumber)
    cropMarkers.forEach((item) => {
      const markerX = (item.xPercent / 100) * source.width
      const markerY = (item.yPercent / 100) * source.height
      const markerOutX = ((markerX - sourceX) / sourceWidth) * output.width
      const markerOutY = ((markerY - sourceY) / sourceHeight) * output.height
      if (markerOutX < 0 || markerOutX > output.width || markerOutY < 0 || markerOutY > output.height) return
      drawExportHexPin(context, item, markerOutX, markerOutY)
    })
    const generatedAt = new Date().toISOString()
    return {
      ...marker,
      cropImageDataUrl: output.toDataURL("image/jpeg", 0.9),
      cropImageGeneratedAt: generatedAt,
      cropHexpinExportVersion: PDF_HEXPIN_EXPORT_VERSION,
      pdfFileName: file.name,
      cropFrame: {
        xPercent: frame.xPercent,
        yPercent: frame.yPercent,
        widthPercent: frame.widthPercent,
        heightPercent: frame.heightPercent,
        paperSize: marker.paperSize,
        orientation: marker.orientation,
        pageNumber,
        pdfFileName: file.name,
        generatedAt,
        hexpinExportVersion: PDF_HEXPIN_EXPORT_VERSION,
      },
    }
  }

  function createFullPageExportForCurrentPage(nextMarkers = markers) {
    const source = canvasRef.current
    if (!source || !pageSize) return null
    const pageMarkersForExport = nextMarkers.filter((marker) => (marker.pageNumber || 1) === pageNumber)
    if (!pageMarkersForExport.length) return null
    const output = document.createElement("canvas")
    const maxSide = 1800
    const sourceDisplayWidth = source.offsetWidth || pageSize.width
    const sourceDisplayHeight = source.offsetHeight || pageSize.height
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
    output.width = Math.max(1, Math.round(source.width * scale))
    output.height = Math.max(1, Math.round(source.height * scale))
    const context = output.getContext("2d")
    if (!context) return null
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, output.width, output.height)
    context.drawImage(source, 0, 0, output.width, output.height)
    pageMarkersForExport.forEach((marker) => {
      const markerOutX = (marker.xPercent / 100) * output.width
      const markerOutY = (marker.yPercent / 100) * output.height
      drawExportHexPin(context, marker, markerOutX, markerOutY)
    })
    const generatedAt = new Date().toISOString()
    return {
      id: `${file.id || "plan"}-page-${pageNumber}`,
      pdfFileName: file.name,
      pageNumber,
      markerIds: pageMarkersForExport.map((marker) => marker.id),
      markerSerials: pageMarkersForExport.map((marker) => marker.serial),
      fullPageImageDataUrl: output.toDataURL("image/jpeg", 0.86),
      generatedAt,
    } satisfies PlanPageExport
  }

  function saveCurrentFullPageExport(nextMarkers = markers) {
    const pageExport = createFullPageExportForCurrentPage(nextMarkers)
    if (!pageExport) return null
    const nextExports = [
      ...planPageExports.filter((item) => !(item.pdfFileName === pageExport.pdfFileName && item.pageNumber === pageExport.pageNumber)),
      pageExport,
    ]
    commitPlanPageExports(nextExports)
    const nextMarkersWithSnapshot = nextMarkers.map((marker) => (marker.pageNumber || 1) === pageNumber
      ? { ...marker, fullPlanSnapshotDataUrl: pageExport.fullPageImageDataUrl, fullPlanSnapshotGeneratedAt: pageExport.generatedAt, fullPlanSnapshotHexpinExportVersion: PDF_HEXPIN_EXPORT_VERSION }
      : marker)
    commitMarkers(nextMarkersWithSnapshot)
    return { pageExport, nextMarkers: nextMarkersWithSnapshot }
  }

  function selectMarkerAfterCrop(marker: PlanIssueMarker, nextMarkers: PlanIssueMarker[]) {
    setSelectedMarkerId(marker.id)
    setActiveIssueId(marker.issueId || activeIssueId)
    file.onSelectedMarkerChange?.(marker.id)
    file.onActiveIssueChange?.(marker.issueId || activeIssueId)
    commitMarkers(nextMarkers)
    window.setTimeout(() => {
      focusMarkerOnStage(marker.id)
      triggerMarkerPulse(marker.id)
    }, 80)
  }

  function generateSelectedMarkerCrop() {
    if (!selectedMarker) return
    const updated = createMarkerCrop(selectedMarker)
    const nextMarkers = markers.map((marker) => marker.id === selectedMarker.id ? updated : marker)
    const fullPageResult = saveCurrentFullPageExport(nextMarkers)
    if (!fullPageResult) commitMarkers(nextMarkers)
  }

  function generateSelectedMarkerCropAndNext() {
    if (!selectedMarker) return
    const updated = createMarkerCrop(selectedMarker)
    const nextMarkers = markers.map((marker) => marker.id === selectedMarker.id ? updated : marker)
    const fullPageResult = saveCurrentFullPageExport(nextMarkers)
    const markersAfterPageExport = fullPageResult?.nextMarkers || nextMarkers
    const missingMarkers = markersAfterPageExport.filter((marker) => !marker.cropImageDataUrl || marker.cropHexpinExportVersion !== PDF_HEXPIN_EXPORT_VERSION)
    if (!missingMarkers.length) {
      commitMarkers(markersAfterPageExport)
      setSelectedMarkerId(updated.id)
      file.onSelectedMarkerChange?.(updated.id)
      triggerMarkerPulse(updated.id)
      return
    }
    const currentIndex = missingMarkers.findIndex((marker) => marker.id === selectedMarker.id)
    const nextMarker = missingMarkers[(currentIndex + 1 + missingMarkers.length) % missingMarkers.length]
    selectMarkerAfterCrop(nextMarker, markersAfterPageExport)
  }

  function generateAllMarkerCrops() {
    if (!markers.length) return
    const nextMarkers = markers.map((marker) => (marker.pageNumber || 1) === pageNumber ? createMarkerCrop(marker) : marker)
    const fullPageResult = saveCurrentFullPageExport(nextMarkers)
    if (!fullPageResult) commitMarkers(nextMarkers)
  }

  function updateMarkerPositionFromPointer(markerId: string, event: React.PointerEvent<HTMLElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const xPercent = Math.min(99, Math.max(1, ((event.clientX - rect.left) / rect.width) * 100))
    const yPercent = Math.min(99, Math.max(1, ((event.clientY - rect.top) / rect.height) * 100))
    const nextMarkers = markers.map((marker) =>
      marker.id === markerId
        ? { ...marker, xPercent, yPercent, cropImageDataUrl: undefined, cropImageGeneratedAt: undefined }
        : marker,
    )
    commitMarkers(nextMarkers)
  }

  function getNextMarkerSerial(issueId?: string) {
    const nextNumber = markers.filter((marker) => marker.issueId === issueId && marker.markerKind !== "photo").length + 1
    return `HJ-${String(nextNumber).padStart(3, "0")}`
  }

  function getNextPhotoMarkerSerial(issueId?: string) {
    const count = (file.markers ?? []).filter((marker) => marker.markerKind === "photo" && (!issueId || marker.issueId === issueId)).length
    return `FHJ-${String(count + 1).padStart(3, "0")}`
  }

  function changeSelectedMarkerIssue(nextIssueId: string) {
    if (!selectedMarker) return
    const targetIssue = (file.issues || []).find((issue) => issue.id === nextIssueId)
    const nextSerial = getNextMarkerSerial(nextIssueId)
    updateSelectedMarker({
      ...buildMarkerIssuePatch(nextIssueId),
      issueId: nextIssueId,
      issueSerial: targetIssue?.serial || nextIssueId,
      issueTitle: targetIssue?.title || "Terepi hiba",
      serial: nextSerial,
    })
  }

  function beginMarkerDrag(markerId: string, event: React.PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const sourceMarker = markers.find((marker) => marker.id === markerId)
    if (!sourceMarker) return
    const cloneOnDrag = event.ctrlKey || event.metaKey
    let activeMarkerId = markerId
    if (cloneOnDrag) {
      const clonedMarkerId = `plan-marker-${Date.now()}`
      const clonedMarker: PlanIssueMarker = {
        ...sourceMarker,
        id: clonedMarkerId,
        serial: getNextMarkerSerial(sourceMarker.issueId),
        title: sourceMarker.title || `${sourceMarker.issueSerial || "TH"} másolt hibahely`,
        pageNumber,
        cropImageDataUrl: undefined,
        cropImageGeneratedAt: undefined,
      }
      commitMarkers([...markers, clonedMarker])
      activeMarkerId = clonedMarkerId
      dragMarkerRef.current = { markerId: activeMarkerId, moved: false, cloneOnDrag: true, clonedMarkerId }
    } else {
      dragMarkerRef.current = { markerId, moved: false, cloneOnDrag: false }
    }
    setSelectedMarkerId(activeMarkerId)
    file.onSelectedMarkerChange?.(activeMarkerId)
    triggerMarkerPulse(activeMarkerId)
  }

  function moveMarkerDrag(markerId: string, event: React.PointerEvent<HTMLElement>) {
    const drag = dragMarkerRef.current
    if (!drag || drag.markerId !== markerId) return
    event.preventDefault()
    event.stopPropagation()
    drag.moved = true
    updateMarkerPositionFromPointer(markerId, event)
  }

  function endMarkerDrag(markerId: string, event: React.PointerEvent<HTMLElement>) {
    const drag = dragMarkerRef.current
    if (!drag || drag.markerId !== markerId) return
    event.preventDefault()
    event.stopPropagation()
    dragMarkerRef.current = null
  }


  function beginPagePointer(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || dragMarkerRef.current) {
      pendingPageClickRef.current = null
      return
    }
    pendingPageClickRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button }
  }

  function movePagePointer(event: React.PointerEvent<HTMLElement>) {
    const pending = pendingPageClickRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    const moved = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY)
    if (moved > 6) pendingPageClickRef.current = null
  }

  function endPagePointer(event: React.PointerEvent<HTMLElement>) {
    const pending = pendingPageClickRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    pendingPageClickRef.current = null
    if (pending.button !== 0 || event.button !== 0) return
    const moved = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY)
    if (moved > 6) return
    addMarkerFromClientPoint(event.clientX, event.clientY)
  }

  function cancelPagePointer(event: React.PointerEvent<HTMLElement>) {
    const pending = pendingPageClickRef.current
    if (pending?.pointerId === event.pointerId) pendingPageClickRef.current = null
  }


  function addMarkerFromClientPoint(clientX: number, clientY: number) {
    const pending = pendingPageClickRef.current
    if (pending && pending.button !== 0) return
    if (!pageSize || !pageCount || dragMarkerRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const xPercent = Math.min(99, Math.max(1, ((clientX - rect.left) / rect.width) * 100))
    const yPercent = Math.min(99, Math.max(1, ((clientY - rect.top) / rect.height) * 100))
    const targetIssue = getActiveIssue()
    const targetIssueId = targetIssue?.id ?? file.issueId
    const selectedPhoto = selectedPhotoForMarker
    const isPhotoPlacement = markerPlacementMode === "photo" && Boolean(selectedPhoto)
    const nextMarker: PlanIssueMarker = isPhotoPlacement
      ? {
          id: `photo-marker-${Date.now()}`,
          markerKind: "photo",
          ...buildMarkerIssuePatch(targetIssueId),
          photoId: selectedPhoto?.id,
          photoSerial: selectedPhoto?.serial,
          photoName: selectedPhoto?.name,
          photoNote: selectedPhoto?.note,
          photoPreviewUrl: selectedPhoto?.url || selectedPhoto?.dataUrl,
          serial: getNextPhotoMarkerSerial(targetIssueId),
          title: `Fotóhely jelölés · ${selectedPhoto?.serial || "F"}`,
          note: selectedPhoto?.note || "Fotó készítésének helye a tervlapon.",
          issueSeverity: "Észrevétel",
          status: "Nyitott",
          issueStatus: "Nyitott",
          responsible: targetIssue?.responsible || "",
          dueDate: targetIssue?.deadline || formatDateInput(new Date()),
          discipline: "other",
          xPercent,
          yPercent,
          pageNumber,
          showLetter: true,
          paperSize: markerPaperSize,
          orientation: markerOrientation,
        }
      : {
          id: `plan-marker-${Date.now()}`,
          markerKind: "issue",
          ...buildMarkerIssuePatch(targetIssueId),
          serial: getNextMarkerSerial(targetIssueId),
          title: targetIssue?.title || file.issueTitle || `${targetIssue?.serial || file.issueSerial || "TH"} tervi hibajelölés`,
          note: targetIssue?.description || targetIssue?.note || "",
          issueSeverity: "Észrevétel",
          status: "Nyitott",
          issueStatus: "Nyitott",
          responsible: targetIssue?.responsible || "",
          dueDate: targetIssue?.deadline || formatDateInput(new Date()),
          discipline: activeDiscipline,
          xPercent,
          yPercent,
          pageNumber,
          showLetter: showMarkerLetters,
          paperSize: markerPaperSize,
          orientation: markerOrientation,
        }
    const nextMarkers = [...markers, nextMarker]
    commitMarkers(nextMarkers)
    setSelectedMarkerId(nextMarker.id)
    file.onSelectedMarkerChange?.(nextMarker.id)
    triggerMarkerPulse(nextMarker.id)
  }

  function updateSelectedMarker(patch: Partial<PlanIssueMarker>) {
    if (!selectedMarker) return
    const nextMarkers = markers.map((marker) =>
      marker.id === selectedMarker.id
        ? { ...marker, ...patch, cropImageDataUrl: undefined, cropImageGeneratedAt: undefined }
        : marker,
    )
    commitMarkers(nextMarkers)
  }

  function deleteSelectedMarker() {
    if (!selectedMarker) return
    const nextMarkers = markers.filter((marker) => marker.id !== selectedMarker.id)
    commitMarkers(nextMarkers)
    setSelectedMarkerId(nextMarkers[0]?.id ?? null)
    file.onSelectedMarkerChange?.(nextMarkers[0]?.id ?? null)
  }


  function clearMarkers() {
    commitMarkers([])
    setSelectedMarkerId(null)
    file.onSelectedMarkerChange?.(null)
  }

  const hasSource = Boolean(file.url)
  const busy = loading || rendering
  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId)
  const pageMarkers = markers.filter((marker) => (marker.pageNumber || 1) === pageNumber)
  const hiddenPageMarkerCount = markers.length - pageMarkers.length
  const issueGroups = (file.issues?.length ? file.issues : [{ id: file.issueId || "active-issue", serial: file.issueSerial || "TH", title: file.issueTitle || "Tervi hibahely" }]).map((issue) => ({
    issue,
    markers: markers.filter((marker) => marker.issueId === issue.id && marker.markerKind !== "photo"),
  }))
  const visibleMarkers = showOnlyActiveIssueMarkers ? markers.filter((marker) => marker.issueId === activeIssueId) : markers
  const hiddenMarkerCount = markers.length - visibleMarkers.length
  const selectedCropFrame = selectedMarker ? getCropFrame(selectedMarker) : null
  const savedCropCount = markers.filter((marker) => marker.cropImageDataUrl && marker.cropHexpinExportVersion === PDF_HEXPIN_EXPORT_VERSION).length
  const missingCropCount = markers.length - savedCropCount
  const markersInsideExportFrame = visibleMarkers.filter((marker) => {
    return marker.xPercent >= exportFrame.xPercent && marker.xPercent <= exportFrame.xPercent + exportFrame.widthPercent && marker.yPercent >= exportFrame.yPercent && marker.yPercent <= exportFrame.yPercent + exportFrame.heightPercent
  })
  const exportFrameMarkerCodes = markersInsideExportFrame.map((marker) => marker.serial).join(", ")
  const activeIssuePhotosForMarker = (file.photos || []).filter((photo) => !activeIssueId || photo.issueId === activeIssueId)
  const selectedPhotoForMarker = activeIssuePhotosForMarker.find((photo) => photo.id === selectedPhotoIdForMarker) || activeIssuePhotosForMarker[0] || null


  function beginPanelDrag(panel: "marker" | "export" | "photo", event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
    const current = panel === "marker" ? markerPanelPosition : panel === "photo" ? photoPanelPosition : exportPanelPosition
    dragPanelRef.current = { panel, startClientX: event.clientX, startClientY: event.clientY, startX: current.x, startY: current.y }
  }

  function movePanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragPanelRef.current
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    const panelWidth = drag.panel === "marker" ? 288 : drag.panel === "photo" ? 300 : 320
    const panelHeight = drag.panel === "marker" ? 260 : drag.panel === "photo" ? 340 : 220
    const maxX = Math.max(0, window.innerWidth - panelWidth - 12)
    const maxY = Math.max(0, window.innerHeight - panelHeight - 12)
    const nextX = Math.max(0, Math.min(maxX, drag.startX + event.clientX - drag.startClientX))
    const nextY = Math.max(0, Math.min(maxY, drag.startY + event.clientY - drag.startClientY))
    if (drag.panel === "marker") setMarkerPanelPosition({ x: nextX, y: nextY })
    if (drag.panel === "export") setExportPanelPosition({ x: nextX, y: nextY })
    if (drag.panel === "photo") setPhotoPanelPosition({ x: nextX, y: nextY })
  }

  function endPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragPanelRef.current) return
    event.preventDefault()
    event.stopPropagation()
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    dragPanelRef.current = null
  }


  function formatDateInput(date: Date) {
    return date.toISOString().slice(0, 10)
  }

  function getActiveIssue() {
    return file.issues?.find((issue) => issue.id === activeIssueId)
      ?? file.issues?.find((issue) => issue.id === file.issueId)
      ?? null
  }

  function getIssueById(issueId?: string) {
    if (!issueId) return null
    return file.issues?.find((issue) => issue.id === issueId)
      ?? (issueId === file.issueId ? { id: issueId, serial: file.issueSerial || "TH", title: file.issueTitle || "Tervi hibahely" } : null)
  }

  function buildMarkerIssuePatch(issueId?: string) {
    const issue = getIssueById(issueId)
    return {
      issueId: issue?.id ?? issueId ?? file.issueId,
      issueSerial: issue?.serial ?? file.issueSerial,
      issueTitle: issue?.title ?? file.issueTitle,
      issueLocation: issue?.location,
      issueDescription: issue?.description,
      issueSeverity: issue?.severity,
      issueResponsible: issue?.responsible,
      issueContractorRepresentative: issue?.contractorRepresentative,
      issueDeadline: issue?.deadline,
      issueStatus: issue?.status,
      issueNote: issue?.note,
    }
  }

  function getBaseDueDate() {
    if (selectedMarker?.dueDate) return new Date(`${selectedMarker.dueDate}T00:00:00`)
    return new Date()
  }

  function setDueDateOffset(days: number) {
    const base = new Date()
    base.setDate(base.getDate() + days)
    updateSelectedMarker({ dueDate: formatDateInput(base) })
  }

  function setDueDateToday() {
    updateSelectedMarker({ dueDate: formatDateInput(new Date()) })
  }

  function getPdfPagePhysicalInfo() {
    const normalizedSize = getPdfPagePhysicalSizeMm()
    if (!normalizedSize) return ""
    const widthCm = normalizedSize.widthMm / 10
    const heightCm = normalizedSize.heightMm / 10
    const orientationLabel = widthCm >= heightCm ? "fekvő" : "álló"
    const longSide = Math.max(widthCm, heightCm)
    const shortSide = Math.min(widthCm, heightCm)
    const standardSizes = [
      { label: "A0", long: 118.9, short: 84.1 },
      { label: "A1", long: 84.1, short: 59.4 },
      { label: "A2", long: 59.4, short: 42.0 },
      { label: "A3", long: 42.0, short: 29.7 },
      { label: "A4", long: 29.7, short: 21.0 },
      { label: "A5", long: 21.0, short: 14.8 },
    ]
    const matched = standardSizes.find((size) => {
      const longDiff = Math.abs(longSide - size.long) / size.long
      const shortDiff = Math.abs(shortSide - size.short) / size.short
      return longDiff <= 0.08 && shortDiff <= 0.08
    })
    const formatCm = (value: number) => value.toFixed(1).replace(".", ",")
    return `${matched?.label || "Egyedi"} ${orientationLabel} · ${formatCm(widthCm)} × ${formatCm(heightCm)} cm`
  }

  const pagePhysicalInfo = getPdfPagePhysicalInfo()
  const normalizedPagePhysicalSize = getPdfPagePhysicalSizeMm()
  const rulerWidthCm = normalizedPagePhysicalSize ? normalizedPagePhysicalSize.widthMm / 10 : 0
  const rulerHeightCm = normalizedPagePhysicalSize ? normalizedPagePhysicalSize.heightMm / 10 : 0
  const horizontalRulerCmMarks = Array.from({ length: Math.floor(rulerWidthCm) + 1 }, (_, index) => index)
  const verticalRulerCmMarks = Array.from({ length: Math.floor(rulerHeightCm) + 1 }, (_, index) => index)

  return (
    <div className="flex h-full min-h-0 flex-col border border-slate-300 bg-slate-100">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-700">PDF.js tervlap előnézet + HexPin hibahely</div>
          <div className="mt-1 truncate text-sm font-black text-slate-900">{file.name}</div>
          <div className="mt-1 text-[11px] font-bold text-slate-500">
            {pageCount ? `${pageNumber}. oldal / ${pageCount}` : "Oldalszám betöltés alatt"}
            {pagePhysicalInfo ? ` · ${pagePhysicalInfo}` : ""}
            {hasSource ? ` · ${sourceKind}` : ""}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => goToPage(pageNumber - 1)} disabled={!pageCount || pageNumber <= 1} className="border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-40">Előző</button>
          <div className="flex items-center border border-slate-200 bg-white">
            <input value={pageNumber} onChange={(event) => goToPage(Number(event.target.value) || 1)} className="h-9 w-14 bg-white px-2 text-center text-sm font-black text-slate-800 outline-none focus:bg-cyan-50" inputMode="numeric" />
            <span className="border-l border-slate-200 px-2 text-xs font-black text-slate-500">/ {pageCount || "?"}</span>
          </div>
          <button type="button" onClick={() => goToPage(pageNumber + 1)} disabled={!pageCount || pageNumber >= pageCount} className="border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-40">Következő</button>
          <span className="mx-1 h-7 w-px bg-slate-200" />
          <button type="button" onClick={() => changeZoom(-0.15)} disabled={!pageCount} className="border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-40">−</button>
          <button type="button" onClick={() => { captureZoomAnchor(); setAutoFitPage(false); setZoom(DEFAULT_ZOOM) }} disabled={!pageCount} className="border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-40">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(0.15)} disabled={!pageCount} className="border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-40">+</button>
          <button type="button" onClick={() => { setAutoFitPage(true); fitToPage() }} disabled={!pageCount} className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase text-emerald-800 disabled:opacity-40">Teljes lap</button>
          <button type="button" onClick={fitToWidth} disabled={!pageCount} className="border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 disabled:opacity-40">Szélességhez</button>
          <button type="button" onClick={() => setRotation((current) => (current + 90) % 360)} disabled={!pageCount} className="border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black uppercase text-cyan-800 disabled:opacity-40">Forgatás</button>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">TH hibalista</span>
          <select value={activeIssueId} onChange={(event) => { setActiveIssueId(event.target.value); file.onActiveIssueChange?.(event.target.value) }} className="h-9 border border-slate-200 bg-white px-2 text-xs font-black uppercase text-slate-700">
            {issueGroups.map(({ issue, markers: issueMarkers }) => <option key={issue.id} value={issue.id}>{issue.serial} · {issueMarkers.length} HJ</option>)}
          </select>
          <label className={`flex items-center gap-2 border px-3 py-2 text-xs font-black uppercase ${showOnlyActiveIssueMarkers ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            <input type="checkbox" checked={showOnlyActiveIssueMarkers} onChange={(event) => setShowOnlyActiveIssueMarkers(event.target.checked)} className="h-4 w-4 accent-cyan-600" />
            Csak aktív TH
          </label>
          {showOnlyActiveIssueMarkers ? <span className="border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] font-black uppercase text-amber-700">{hiddenMarkerCount} jelölő rejtve</span> : <span className="border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-black uppercase text-slate-500">Összes jelölő látszik</span>}
          <span className="mx-1 h-7 w-px bg-slate-200" />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Jelölés típusa</span>
          <button type="button" onClick={() => setMarkerPlacementMode("issue")} className={`border px-3 py-2 text-xs font-black uppercase ${markerPlacementMode === "issue" ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}>HJ hibahely</button>
          <button type="button" onClick={() => setMarkerPlacementMode("photo")} disabled={!activeIssuePhotosForMarker.length} className={`border px-3 py-2 text-xs font-black uppercase disabled:opacity-40 ${markerPlacementMode === "photo" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}>Fotóhely</button>
          {markerPlacementMode === "photo" ? <select value={selectedPhotoIdForMarker} onChange={(event) => setSelectedPhotoIdForMarker(event.target.value)} className="h-9 border border-blue-200 bg-white px-2 text-xs font-black uppercase text-blue-800">{activeIssuePhotosForMarker.map((photo) => <option key={photo.id} value={photo.id}>{photo.serial} · {photo.category === "plan-photo" ? "Tervfotó" : "Fotó"}</option>)}</select> : null}
          <span className="mx-1 h-7 w-px bg-slate-200" />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Szakág</span>
          {planIssueDisciplines.map((item) => (
            <button key={item.value} type="button" onClick={() => setActiveDiscipline(item.value)} className={`border px-3 py-2 text-xs font-black uppercase tracking-[0.08em] ${activeDiscipline === item.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${item.colorClass}`} />{item.label}
            </button>
          ))}
          <span className="mx-1 h-7 w-px bg-slate-200" />
          <label className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase text-slate-700">
            <input type="checkbox" checked={showMarkerLetters} onChange={(event) => setShowMarkerLetters(event.target.checked)} className="h-4 w-4 accent-cyan-600" />
            Betűjel
          </label>
          <select value={markerPaperSize} onChange={(event) => setMarkerPaperSize(event.target.value as PlanMarkerPaperSize)} className="h-9 border border-slate-200 bg-white px-2 text-xs font-black uppercase text-slate-700">
            {planMarkerPaperSizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={markerOrientation} onChange={(event) => setMarkerOrientation(event.target.value as PlanMarkerOrientation)} className="h-9 border border-slate-200 bg-white px-2 text-xs font-black uppercase text-slate-700">
            {planMarkerOrientationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" onClick={placeExportFrameOnPage} disabled={!pageCount} className="ml-auto border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-800 disabled:opacity-40">Exportkeret lapra</button>
          <button type="button" onClick={generateSelectedMarkerCrop} disabled={!selectedMarker || !pageCount || !exportFrameVisible} className="border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black uppercase text-cyan-800 disabled:opacity-40">Részletkép mentése</button>
          <button type="button" onClick={generateSelectedMarkerCropAndNext} disabled={!selectedMarker || !pageCount || !exportFrameVisible} className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black uppercase text-amber-800 disabled:opacity-40">Mentés + következő</button>
          <button type="button" onClick={generateAllMarkerCrops} disabled={!markers.length || !pageCount} className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase text-emerald-800 disabled:opacity-40">Összes részletkép{missingCropCount ? ` (${missingCropCount} hiányzik)` : ""}</button>
          {onSaveAndClose ? <button type="button" onClick={onSaveAndClose} className="border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-black uppercase text-white">Mentés és vissza</button> : null}
          <button type="button" onClick={clearMarkers} disabled={!markers.length} className="border border-red-200 bg-red-50 px-3 py-2 text-xs font-black uppercase text-red-700 disabled:opacity-40">Jelölők törlése</button>
        </div>
        <div className="mt-2 text-[11px] font-semibold text-slate-500">Kattints a PDF tervlapra: HJ módban hibahely HexPin, Fotóhely módban a kiválasztott fotó készítési helyét jelölő DIMPROVER hexagon marker kerül a tervre. A marker fölött a TH sorszám, a külső HexPin fejben a HJ sorszám, a belső szakági hexagonban pedig az É/G/E/T/X betűjel látszik. A tüske hegye a mentett PDF koordinátára van horgonyozva, ezért zoomoláskor ugyanarra a tervi pontra mutat. A Csak aktív TH kapcsolóval zsúfolt tervlapnál elrejthetők a többi TH markerei.</div>
      </div>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-300 bg-[linear-gradient(rgba(71,85,105,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(71,85,105,0.16)_1px,transparent_1px)] bg-[size:18px_18px] p-3">
        {!hasSource ? (
          <div className="grid min-h-[420px] place-items-center border border-dashed border-cyan-300 bg-white/80 p-6 text-center">
            <div>
              <div className="text-4xl font-black text-cyan-700">PDF</div>
              <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600">Nincs PDF URL megadva. A tervkártya akkor fog valódi előnézetet rajzolni, ha a feltöltött vagy tervtári PDF elérhető URL-ként érkezik.</p>
            </div>
          </div>
        ) : (
          <div className="inline-flex min-w-full justify-start px-10 py-8 text-left">
            <div className="relative inline-block bg-slate-100 pb-4 pl-10 pr-4 pt-8 shadow-[0_18px_45px_rgba(15,23,42,0.28)]">
              <div className="relative inline-block border border-slate-400 bg-white shadow-inner" onContextMenu={(event) => event.preventDefault()} onPointerDown={beginPagePointer} onPointerMove={movePagePointer} onPointerUp={endPagePointer} onPointerCancel={cancelPagePointer}>
                <canvas ref={canvasRef} className="block bg-white" />
                <div className="pointer-events-none absolute left-0 top-[-26px] h-6 w-full overflow-hidden border border-slate-300 bg-white/90 text-[9px] font-black text-slate-500">
                  {horizontalRulerCmMarks.map((mark) => (
                    <span key={`hr-${mark}`} className="absolute top-0 h-full border-l border-slate-400" style={{ left: `${rulerWidthCm ? (mark / rulerWidthCm) * 100 : 0}%` }}>
                      <span className="ml-1">{mark}</span>
                      {mark < rulerWidthCm ? <span className="absolute left-0 top-3 h-3 border-l border-slate-300" style={{ transform: `translateX(${rulerWidthCm ? (0.5 / rulerWidthCm) * (canvasRef.current?.offsetWidth || pageSize?.width || 0) : 0}px)` }} /> : null}
                    </span>
                  ))}
                </div>
                <div className="pointer-events-none absolute left-[-34px] top-0 h-full w-8 overflow-hidden border border-slate-300 bg-white/90 text-[9px] font-black text-slate-500">
                  {verticalRulerCmMarks.map((mark) => (
                    <span key={`vr-${mark}`} className="absolute left-0 w-full border-t border-slate-400" style={{ top: `${rulerHeightCm ? (mark / rulerHeightCm) * 100 : 0}%` }}>
                      <span className="ml-1">{mark}</span>
                      {mark < rulerHeightCm ? <span className="absolute left-4 top-0 w-4 border-t border-slate-300" style={{ transform: `translateY(${rulerHeightCm ? (0.5 / rulerHeightCm) * (canvasRef.current?.offsetHeight || pageSize?.height || 0) : 0}px)` }} /> : null}
                    </span>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-0">
                  {exportFrameVisible ? (
                  <div
                    className="pointer-events-auto absolute z-10 cursor-move border-2 border-dashed border-cyan-600 bg-slate-500/20"
                    style={{
                      left: `${exportFrame.xPercent}%`,
                      top: `${exportFrame.yPercent}%`,
                      width: `${exportFrame.widthPercent}%`,
                      height: `${exportFrame.heightPercent}%`,
                    }}
                    onPointerDown={beginExportFrameDrag}
                    onPointerMove={moveExportFrameDrag}
                    onPointerUp={endExportFrameDrag}
                    onPointerCancel={endExportFrameDrag}
                  >
                    <div className="absolute left-2 top-2 border border-cyan-700 bg-white/95 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-800 shadow">
                      Exportkeret · látható hibák: {exportFrameMarkerCodes || "nincs"}
                    </div>
                  </div>
                  ) : null}
                  {visibleMarkers.map((marker) => (
                    <PlanHexMarker
                      key={marker.id}
                      marker={marker}
                      zoom={zoom}
                      selected={marker.id === selectedMarkerId}
                      pulse={marker.id === pulseMarkerId}
                      onClick={() => { setSelectedMarkerId(marker.id); file.onSelectedMarkerChange?.(marker.id); focusMarkerOnStage(marker.id); triggerMarkerPulse(marker.id) }}
                      onPointerDown={(event) => beginMarkerDrag(marker.id, event)}
                      onPointerMove={(event) => moveMarkerDrag(marker.id, event)}
                      onPointerUp={(event) => endMarkerDrag(marker.id, event)}
                      onPointerCancel={(event) => endMarkerDrag(marker.id, event)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {busy ? <div className="absolute left-4 top-4 border border-cyan-200 bg-white/95 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-cyan-800 shadow">{loading ? "PDF betöltés..." : "Oldal renderelés..."}</div> : null}
        {hiddenPageMarkerCount ? <div className="absolute left-4 top-14 z-20 border border-slate-200 bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 shadow">Aktuális oldal: {pageMarkers.length} HJ · más oldalakon: {hiddenPageMarkerCount} HJ</div> : null}
        {markerPlacementMode === "photo" ? (
          <div className="fixed z-[10020] max-h-[calc(100vh-96px)] w-[300px] overflow-y-auto border border-blue-300 bg-blue-50 p-3 text-left shadow-xl" style={{ left: `${photoPanelPosition.x}px`, top: `${photoPanelPosition.y}px` }} onPointerMove={movePanelDrag} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag}>
            <div onPointerDown={(event) => beginPanelDrag("photo", event)} className="flex cursor-move items-center justify-between gap-2 border-b border-blue-200 pb-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-800">
              <span>Fotóhely választó · húzható</span>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPhotoPanelCollapsed((current) => !current)} className="border border-blue-200 bg-white px-2 py-1 text-[10px] font-black text-blue-800">{photoPanelCollapsed ? "Nyit" : "Csuk"}</button>
            </div>
            {!photoPanelCollapsed ? <>
              <div className="mt-2 border border-blue-200 bg-white px-3 py-2 text-[11px] font-bold leading-4 text-blue-900">
                Válaszd ki a fotót, majd kattints a PDF tervlapra. A képből nem kerül rá semmi a tervre, csak a fotó készítési helyét jelölő kék HexPin marker.
              </div>
              {activeIssuePhotosForMarker.length ? (
                <div className="mt-3 grid gap-2">
                  {activeIssuePhotosForMarker.map((photo) => {
                    const selected = selectedPhotoForMarker?.id === photo.id
                    const thumbUrl = photo.url || photo.dataUrl
                    return (
                      <button key={photo.id} type="button" onClick={() => setSelectedPhotoIdForMarker(photo.id)} className={`grid grid-cols-[64px_minmax(0,1fr)] gap-2 border p-2 text-left ${selected ? "border-blue-700 bg-white shadow" : "border-blue-100 bg-white/70 hover:bg-white"}`}>
                        <span className="grid h-14 w-16 place-items-center bg-slate-100 bg-cover bg-center text-[10px] font-black text-slate-400" style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}>{!thumbUrl ? "FOTÓ" : ""}</span>
                        <span className="min-w-0">
                          <span className="block text-xs font-black text-blue-900">{photo.serial}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-700">{photo.name}</span>
                          <span className="mt-1 block text-[10px] font-bold text-slate-500">{photo.category === "plan-photo" ? "Tervfotó" : "Hibafotó"}</span>
                          {selected ? <span className="mt-1 inline-block border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-800">Kijelölve</span> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-800">Ehhez az aktív TH hibához még nincs feltöltött fotó. Először a 3. Fotók / tervfotók munkakártyán tölts fel képet.</div>
              )}
            </> : <div className="mt-2 text-xs font-black text-blue-900">{selectedPhotoForMarker?.serial || "Nincs kiválasztott fotó"}</div>}
          </div>
        ) : null}
        {selectedMarker ? (
          <div className="fixed z-[10020] max-h-[calc(100vh-96px)] w-80 overflow-y-auto border border-slate-300 bg-slate-200 p-3 text-left shadow-xl" style={{ left: `${markerPanelPosition.x}px`, top: `${markerPanelPosition.y}px` }} onPointerMove={movePanelDrag} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag}>
            <div onPointerDown={(event) => beginPanelDrag("marker", event)} className="flex cursor-move items-center justify-between gap-2 border-b border-slate-300 pb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              <span>Kijelölt marker szerkesztése · húzható</span>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setMarkerPanelCollapsed((current) => !current)} className="border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-700">{markerPanelCollapsed ? "Nyit" : "Csuk"}</button>
            </div>
            {!markerPanelCollapsed ? <>
            <div className="mt-1 text-sm font-black text-slate-950">{selectedMarker.markerKind === "photo" ? selectedMarker.photoSerial || selectedMarker.serial : selectedMarker.serial}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{selectedMarker.markerKind === "photo" ? "Fotóhely marker" : "HJ hibahely marker"} · {selectedMarker.pageNumber || 1}. oldal · X {selectedMarker.xPercent.toFixed(2)}% · Y {selectedMarker.yPercent.toFixed(2)}%</div>
            {selectedMarker.markerKind === "photo" ? <div className="mt-2 border border-blue-200 bg-blue-50 px-2 py-2 text-[11px] font-bold leading-4 text-blue-900">Ez a jelölő FHJ fotóhely jelölés, nem HJ hibahely. Fotó: {selectedMarker.photoSerial || "F"} · {selectedMarker.photoName || "fotó"}</div> : null}

            <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Terepi hiba / TH
              <select
                value={selectedMarker.issueId || file.issueId || ""}
                onChange={(event) => changeSelectedMarkerIssue(event.target.value)}
                className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
              >
                {issueGroups.map(({ issue, markers: issueMarkers }) => (
                  <option key={issue.id} value={issue.id}>{issue.serial} · {issue.title} · {issueMarkers.length} HJ</option>
                ))}
              </select>
            </label>

            <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Szakág
              <select
                value={selectedMarker.discipline}
                onChange={(event) => updateSelectedMarker({ discipline: event.target.value as PlanIssueDiscipline })}
                className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
              >
                {planIssueDisciplines.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <MarkerPresetSelect label="Hiba megnevezése" options={markerTitlePresets} onSelect={(value) => updateSelectedMarker({ title: value })} />
            <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Hiba megnevezése
              <input
                value={selectedMarker.title || ""}
                onChange={(event) => updateSelectedMarker({ title: event.target.value })}
                className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-cyan-500"
                placeholder="Hiba megnevezése"
              />
            </label>
            <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Helyszín
              <input
                value={selectedMarker.note?.startsWith("Helyszín:") ? selectedMarker.note.replace(/^Helyszín:\s*/, "") : ""}
                onChange={(event) => updateSelectedMarker({ note: `Helyszín: ${event.target.value}` })}
                className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-cyan-500"
                placeholder="Pl.: A épület / földszint / főbejárat"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                Súlyosság
                <select
                  value={selectedMarker.issueSeverity || "Észrevétel"}
                  onChange={(event) => updateSelectedMarker({ issueSeverity: event.target.value })}
                  className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
                >
                  {planMarkerSeverityOptions.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                Érintett személy / kapcsolattartó
                <input
                  value={selectedMarker.responsible || ""}
                  onChange={(event) => updateSelectedMarker({ responsible: event.target.value })}
                  className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-cyan-500"
                  placeholder="Pl.: Kovács Péter művezető"
                />
              </label>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                Státusz
                <select
                  value={selectedMarker.status || "Nyitott"}
                  onChange={(event) => updateSelectedMarker({ status: event.target.value, issueStatus: event.target.value })}
                  className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
                >
                  <option value="Nyitott">Nyitott</option>
                  <option value="Folyamatban">Folyamatban</option>
                  <option value="Ellenőrzésre vár">Ellenőrzésre vár</option>
                  <option value="Lezárt">Lezárt</option>
                </select>
              </label>
              <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                Határidő
                <input
                  type="date"
                  value={selectedMarker.dueDate || ""}
                  onChange={(event) => updateSelectedMarker({ dueDate: event.target.value })}
                  className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" onClick={() => setDueDateOffset(3)} className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">+3 nap</button>
              <button type="button" onClick={() => setDueDateOffset(7)} className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">+7 nap</button>
              <button type="button" onClick={setDueDateToday} className="border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase text-slate-700">Jkv. napja</button>
            </div>
            <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Érintett vállalkozó
              <input
                value={selectedMarker.responsible || ""}
                onChange={(event) => updateSelectedMarker({ responsible: event.target.value })}
                className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-cyan-500"
                placeholder="Pl.: Generálkivitelező Kft."
              />
            </label>
            <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
              Leírás
              <textarea
                value={selectedMarker.note || ""}
                onChange={(event) => updateSelectedMarker({ note: event.target.value })}
                className="mt-1 h-16 w-full resize-none border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-cyan-500"
                placeholder="Részletes hiba leírása"
              />
            </label>

            <label className="mt-2 flex items-center gap-2 border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
              <input
                type="checkbox"
                checked={selectedMarker.showLetter}
                onChange={(event) => updateSelectedMarker({ showLetter: event.target.checked })}
                className="h-4 w-4 accent-cyan-600"
              />
              Betűjel megjelenítése
            </label>

            <div className="mt-3 border-t border-slate-200 pt-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Marker műveletek</div>
            <div className="mt-1 text-[10px] font-bold text-slate-400">A hibapontot egérrel megfogva X és Y irányban is áthelyezheted.</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button type="button" onClick={deleteSelectedMarker} className="border border-red-200 bg-red-50 px-2 py-2 text-[10px] font-black uppercase text-red-700">Marker törlés</button>
            </div>
            </> : <div className="mt-2 text-xs font-black text-slate-900">{selectedMarker.serial}</div>}
          </div>
        ) : null}
        {pageCount ? (
          <div className="fixed z-[10020] w-80 border border-slate-300 bg-slate-200 p-3 text-left shadow-xl" style={{ left: `${exportPanelPosition.x}px`, top: `${exportPanelPosition.y}px` }} onPointerMove={movePanelDrag} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag}>
            <div onPointerDown={(event) => beginPanelDrag("export", event)} className="flex cursor-move items-center justify-between gap-2 border-b border-slate-300 pb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              <span>PDF export kivágás / részletkép · húzható</span>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setExportPanelCollapsed((current) => !current)} className="border border-cyan-200 bg-white px-2 py-1 text-[10px] font-black text-cyan-800">{exportPanelCollapsed ? "Nyit" : "Csuk"}</button>
            </div>
            {!exportPanelCollapsed ? <>
            <div className="mt-2 text-xs font-bold text-slate-600">Közös mozgatható exportkeret</div>
            <div className="mt-1 text-[10px] font-bold text-slate-400">Az exportkeret külön gombbal kerül a PDF lapra. A keret A5/A4/A3 és álló/fekvő arány szerint méreteződik.</div>
            <button type="button" onClick={placeExportFrameOnPage} className="mt-2 w-full border border-slate-700 bg-slate-700 px-2 py-2 text-[10px] font-black uppercase text-white">Exportkeret lapra helyezése</button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                Méret
                <select
                  value={selectedMarker?.paperSize || markerPaperSize}
                  onChange={(event) => {
                    const nextPaperSize = event.target.value as PlanMarkerPaperSize
                    if (selectedMarker) updateSelectedMarker({ paperSize: nextPaperSize })
                    else setMarkerPaperSize(nextPaperSize)
                    resizeExportFrameToPaper(nextPaperSize, selectedMarker?.orientation || markerOrientation)
                  }}
                  className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
                >
                  {planMarkerPaperSizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                Tájolás
                <select
                  value={selectedMarker?.orientation || markerOrientation}
                  onChange={(event) => {
                    const nextOrientation = event.target.value as PlanMarkerOrientation
                    if (selectedMarker) updateSelectedMarker({ orientation: nextOrientation })
                    else setMarkerOrientation(nextOrientation)
                    resizeExportFrameToPaper(selectedMarker?.paperSize || markerPaperSize, nextOrientation)
                  }}
                  className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500"
                >
                  {planMarkerOrientationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            {!exportFrameVisible ? <div className="mt-2 border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Exportkeret még nincs a PDF lapon</div> : null}
            <div className={`mt-2 border px-2 py-1 text-[10px] font-black uppercase ${selectedMarker?.cropImageDataUrl && selectedMarker.cropHexpinExportVersion === PDF_HEXPIN_EXPORT_VERSION ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{selectedMarker?.cropImageDataUrl && selectedMarker.cropHexpinExportVersion === PDF_HEXPIN_EXPORT_VERSION ? "Kijelölt részletkép mentve" : selectedMarker?.cropImageDataUrl ? "Kijelölt részletkép elavult · mentsd újra" : "Kijelölt részletkép még nincs"}</div>
            {exportFrameVisible ? <div className="mt-2 border border-cyan-100 bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase text-cyan-800">Látható hibák: {exportFrameMarkerCodes || "nincs"}</div> : null}
            {showOnlyActiveIssueMarkers ? <div className="mt-1 border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Szűrés aktív: {hiddenMarkerCount} HJ rejtve</div> : null}
            <div className="mt-2 text-[10px] font-bold leading-4 text-slate-500">Exportkeret: {exportFrameVisible ? `${exportFrame.widthPercent.toFixed(1)}% × ${exportFrame.heightPercent.toFixed(1)}%` : "nincs a lapon"}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={generateSelectedMarkerCrop} disabled={!selectedMarker || !exportFrameVisible} className="border border-cyan-700 bg-cyan-700 px-2 py-2 text-[10px] font-black uppercase text-white disabled:opacity-40">Kijelölt mentése</button>
              <button type="button" onClick={generateSelectedMarkerCropAndNext} disabled={!selectedMarker || !exportFrameVisible} className="border border-amber-600 bg-amber-500 px-2 py-2 text-[10px] font-black uppercase text-white disabled:opacity-40">Mentés + következő</button>
              <button type="button" onClick={generateAllMarkerCrops} disabled={!markers.length || !exportFrameVisible} className="border border-emerald-700 bg-emerald-700 px-2 py-2 text-[10px] font-black uppercase text-white disabled:opacity-40">Összes mentése</button>
              <button type="button" onClick={() => saveCurrentFullPageExport()} disabled={!pageMarkers.length} className="col-span-2 border border-slate-700 bg-slate-700 px-2 py-2 text-[10px] font-black uppercase text-white disabled:opacity-40">Teljes tervlap melléklet mentése</button>
            </div>
            </> : <div className="mt-2 text-xs font-black text-cyan-800">Részletkép panel összecsukva</div>}
          </div>
        ) : null}
        {error ? <div className="absolute bottom-4 left-4 right-4 border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 shadow">{error}</div> : null}
      </div>
    </div>
  )
}
