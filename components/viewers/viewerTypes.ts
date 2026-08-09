import type { PlanIssueMarker, PlanPageExport, PlanViewerIssueSummary, PlanViewerPhotoSummary } from "./PlanMarkerTypes"

export type PlanViewerFileType = "pdf" | "ifc" | "dwg" | "image" | "unknown"

export type PlanViewerFile = {
  id: string
  name: string
  url?: string
  type: PlanViewerFileType
  pageNumber?: number
  issueId?: string
  issueSerial?: string
  issueTitle?: string
  issues?: PlanViewerIssueSummary[]
  photos?: PlanViewerPhotoSummary[]
  markers?: PlanIssueMarker[]
  planPageExports?: PlanPageExport[]
  activeIssueId?: string
  selectedMarkerId?: string | null
  focusMarkerRequest?: number
  onActiveIssueChange?: (issueId: string) => void
  onSelectedMarkerChange?: (markerId: string | null) => void
  onMarkersChange?: (markers: PlanIssueMarker[]) => void
  onPlanPageExportsChange?: (exports: PlanPageExport[]) => void
}

export function getPlanViewerFileType(fileName: string): PlanViewerFileType {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith(".pdf")) return "pdf"
  if (lowerName.endsWith(".ifc")) return "ifc"
  if (lowerName.endsWith(".dwg") || lowerName.endsWith(".dxf")) return "dwg"
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".png") || lowerName.endsWith(".webp")) return "image"
  return "unknown"
}
