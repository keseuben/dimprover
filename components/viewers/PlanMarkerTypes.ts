export type PlanIssueDiscipline = "architecture" | "mechanical" | "electrical" | "technology" | "other"

export type PlanMarkerPaperSize = "A5" | "A4" | "A3"
export type PlanMarkerOrientation = "portrait" | "landscape"
export type PlanMarkerKind = "issue" | "photo"

export type IfcMarkerWorldPosition = {
  x: number
  y: number
  z: number
}

export type IfcMarkerCameraSnapshot = {
  position: IfcMarkerWorldPosition
  target?: IfcMarkerWorldPosition
  zoom?: number
}

export type IfcMarkerElementReference = {
  modelFileName?: string
  modelUrl?: string
  modelId?: string
  expressId?: number
  globalId?: string
  entityType?: string
  elementName?: string
  levelName?: string
  propertySource?: string
  propertiesLoadedAt?: string
  worldPosition?: IfcMarkerWorldPosition
  cameraSnapshot?: IfcMarkerCameraSnapshot
  screenPosition?: {
    xPercent: number
    yPercent: number
  }
}

export type PlanMarkerCropFrame = {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  paperSize: PlanMarkerPaperSize
  orientation: PlanMarkerOrientation
  pageNumber: number
  pdfFileName?: string
  generatedAt?: string
  hexpinExportVersion?: string
}

export type PlanPageExport = {
  id: string
  pdfFileName: string
  pageNumber: number
  markerIds: string[]
  markerSerials: string[]
  fullPageImageDataUrl: string
  generatedAt: string
}

export type PlanIssueMarker = {
  id: string
  sourceType?: "pdf" | "ifc" | "image" | "unknown"
  ifcReference?: IfcMarkerElementReference
  markerKind?: PlanMarkerKind
  photoId?: string
  photoSerial?: string
  photoName?: string
  photoNote?: string
  photoPreviewUrl?: string
  issueId?: string
  issueSerial?: string
  issueTitle?: string
  issueLocation?: string
  issueDescription?: string
  issueSeverity?: string
  issueResponsible?: string
  issueContractorRepresentative?: string
  issueDeadline?: string
  issueStatus?: string
  issueNote?: string
  serial: string
  title: string
  note?: string
  status?: string
  responsible?: string
  dueDate?: string
  discipline: PlanIssueDiscipline
  xPercent: number
  yPercent: number
  pageNumber?: number
  showLetter: boolean
  paperSize: PlanMarkerPaperSize
  orientation: PlanMarkerOrientation
  cropImageDataUrl?: string
  cropImageGeneratedAt?: string
  cropFrame?: PlanMarkerCropFrame
  pdfFileName?: string
  fullPlanSnapshotDataUrl?: string
  fullPlanSnapshotGeneratedAt?: string
  cropHexpinExportVersion?: string
  fullPlanSnapshotHexpinExportVersion?: string
}

export type PlanViewerPhotoSummary = {
  id: string
  issueId: string
  serial: string
  name: string
  note?: string
  category?: string
  url?: string
  dataUrl?: string
}

export type PlanViewerIssueSummary = {
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
}

export const planIssueDisciplines: Array<{
  value: PlanIssueDiscipline
  label: string
  shortLabel: string
  colorClass: string
  hexColor: string
  lightHexColor: string
}> = [
  { value: "architecture", label: "Építészet", shortLabel: "É", colorClass: "bg-emerald-500", hexColor: "#10b981", lightHexColor: "#a7f3d0" },
  { value: "mechanical", label: "Gépészet", shortLabel: "G", colorClass: "bg-cyan-500", hexColor: "#06b6d4", lightHexColor: "#a5f3fc" },
  { value: "electrical", label: "Elektromos", shortLabel: "E", colorClass: "bg-amber-400", hexColor: "#f59e0b", lightHexColor: "#fde68a" },
  { value: "technology", label: "Technológia", shortLabel: "T", colorClass: "bg-slate-500", hexColor: "#64748b", lightHexColor: "#cbd5e1" },
  { value: "other", label: "Egyéb", shortLabel: "X", colorClass: "bg-violet-500", hexColor: "#8b5cf6", lightHexColor: "#ddd6fe" },
]

export const planMarkerPaperSizeOptions: Array<{ value: PlanMarkerPaperSize; label: string; widthMm: number; heightMm: number }> = [
  { value: "A5", label: "A5", widthMm: 210, heightMm: 148 },
  { value: "A4", label: "A4", widthMm: 297, heightMm: 210 },
  { value: "A3", label: "A3", widthMm: 420, heightMm: 297 },
]

export const planMarkerOrientationOptions: Array<{ value: PlanMarkerOrientation; label: string }> = [
  { value: "portrait", label: "Álló" },
  { value: "landscape", label: "Fekvő" },
]

export function getPlanIssueDisciplineMeta(value: PlanIssueDiscipline) {
  return planIssueDisciplines.find((item) => item.value === value) ?? planIssueDisciplines[0]
}

export function getMarkerViewportSize(zoom: number) {
  if (zoom <= 0.75) return 56
  if (zoom <= 1.25) return 46
  if (zoom <= 2) return 38
  if (zoom <= 3) return 32
  return 28
}

export const planMarkerSeverityOptions = [
  "Észrevétel",
  "Javítandó hiba",
  "Súlyos hiba",
  "Azonnali intézkedést igényel",
] as const

export function normalizeMarkerSeverity(value?: string) {
  if (value === "Alacsony") return "Észrevétel"
  if (value === "Közepes") return "Javítandó hiba"
  if (value === "Magas") return "Súlyos hiba"
  if (value === "Kritikus") return "Azonnali intézkedést igényel"
  if (value && planMarkerSeverityOptions.includes(value as typeof planMarkerSeverityOptions[number])) return value
  return "Javítandó hiba"
}

export function getMarkerSeverityVisual(value?: string) {
  const severity = normalizeMarkerSeverity(value)
  if (severity === "Észrevétel") return { severity, strokeColor: "rgba(107,114,128,0.95)", strokeWidth: 2, showBang: false, bangColor: "transparent", showRepairMark: false }
  if (severity === "Javítandó hiba") return { severity, strokeColor: "#f97316", strokeWidth: 3, showBang: false, bangColor: "transparent", showRepairMark: true }
  if (severity === "Súlyos hiba") return { severity, strokeColor: "#f97316", strokeWidth: 4, showBang: true, bangColor: "#f97316", showRepairMark: false }
  return { severity, strokeColor: "#b91c1c", strokeWidth: 5, showBang: true, bangColor: "#b91c1c", showRepairMark: false }
}

export function getMarkerStatusVisual(value?: string) {
  const status = value || "Nyitott"
  if (status === "Folyamatban") return { status, type: "dots", color: "#15803d", label: "Folyamatban" }
  if (status === "Lezárt") return { status, type: "check", color: "#16a34a", label: "Lezárt" }
  if (status === "Ellenőrzésre vár") return { status, type: "dot", color: "#f97316", label: "Ellenőrzésre vár" }
  return { status, type: "none", color: "transparent", label: "Nyitott" }
}