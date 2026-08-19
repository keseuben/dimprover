"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Compass, Fan, Grid3X3, LocateFixed, Maximize2, Minus, Move, PencilRuler, Plus, RotateCcw, Ruler, Scaling, X } from "lucide-react";
import PlanHexMarker from "@/components/viewers/PlanHexMarker";
import SurveyNorthMark from "@/components/viewers/SurveyNorthMark";
import { resolveSurveyRoomDimensions, type SurveyRoomDimensionSource } from "@/components/property-survey/propertySurveyRoomDimensions";
import {
  getPaperDimensionsMm,
  getWallOrientationLabel,
  getWallSegmentGeometry,
  surveyOpeningKindLabels,
  surveyWallBoundaryLabels,
  type SurveyPlanSheetSettings,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";
import {
  propertySurveyIssueToPlanMarker,
  type PropertySurveyIssue,
  type PropertySurveyIssuePlacementMode,
} from "@/components/property-survey/propertySurveyIssueTypes";
import {
  snapIndustrialPoint,
  type SurveyIndustrialBackground,
  type SurveyIndustrialBuildingContour,
  type SurveyIndustrialDrawKind,
  type SurveyIndustrialMarkup,
  type SurveyIndustrialMarkupKind,
  type SurveyIndustrialPoint,
  type SurveyIndustrialSettings,
  type SurveyIndustrialTool,
  type SurveyPillar,
} from "@/components/property-survey/propertySurveyIndustrialModel";
import { getSurveyThermalBoundarySegments } from "@/components/property-survey/propertySurveyThermalBoundary";
import type { SurveySectionDrawingConstraint, SurveySectionLine } from "@/components/property-survey/propertySurveySectionModel";
import {
  photoPointToPlanMarker,
  getRoomUsableHeight,
  surveyMechanicalKindLabels,
  type SurveyMechanicalDevice,
  type SurveyMechanicalPlacementMode,
  type SurveyPhotoPlacementMode,
  type SurveyPhotoPoint,
  type SurveyThermalBoundarySettings,
} from "@/components/property-survey/propertySurveyEnergyModel";

export type SurveyRoom = {
  id: string;
  levelId?: string;
  name: string;
  function: string;
  area: number;
  height: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  heated: boolean;
  externalWallType: string;
  floorType: string;
  ceilingType: string;
  windowCount: number;
  windowType: string;
  orientation: string;
  note: string;
  lengthMeters?: number;
  widthMeters?: number;
  dimensionSource?: SurveyRoomDimensionSource;
  measuredAt?: string;
  measurementDevice?: string;
  lengthSource?: SurveyRoomDimensionSource;
  widthSource?: SurveyRoomDimensionSource;
  heightSource?: SurveyRoomDimensionSource;
  lengthMeasuredAt?: string;
  widthMeasuredAt?: string;
  heightMeasuredAt?: string;
  lengthDevice?: string;
  widthDevice?: string;
  heightDevice?: string;
  floorFinishMaterial?: string;
  wallFinishMaterial?: string;
  ceilingFinishMaterial?: string;
  suspendedCeilingEnabled?: boolean;
  suspendedCeilingDropMeters?: number;
  floorAssemblyId?: string;
  ceilingAssemblyId?: string;
  plinthAssemblyId?: string;
  polygon?: Array<{ x: number; y: number }>;
  planDataSource?: string;
  planRecognitionStatus?: string;
  planConfidence?: string;
  planDocumentId?: string;
  planPageId?: string;
  planSuggestionId?: string;
};

type SurveyFloorPlanEngineProps = {
  rooms: SurveyRoom[];
  activeRoomId: string;
  levelName?: string;
  northAngle: number;
  planSheet: SurveyPlanSheetSettings;
  effectiveScale: number;
  projectName?: string;
  surveyName?: string;
  surveyType?: string;
  surveyLocation?: string;
  surveyDate?: string;
  surveyCreator?: string;
  clientName?: string;
  drawingRevision?: string;
  wallSegments?: SurveyWallSegment[];
  wallOpenings?: SurveyWallOpening[];
  activeWallSegmentId?: string | null;
  activeOpeningId?: string | null;
  wallSelectionMode?: boolean;
  thermalBoundary?: SurveyThermalBoundarySettings;
  thermalLayerAvailable?: boolean;
  orientationControlsOpen?: boolean;
  onOrientationControlsOpenChange?: (open: boolean) => void;
  photoPoints?: SurveyPhotoPoint[];
  activePhotoPointId?: string | null;
  photoPlacementMode?: SurveyPhotoPlacementMode;
  mechanicalDevices?: SurveyMechanicalDevice[];
  activeMechanicalDeviceId?: string | null;
  mechanicalPlacementMode?: SurveyMechanicalPlacementMode;
  industrialMode?: boolean;
  focusMode?: boolean;
  focusLayout?: "full" | "split";
  industrialSettings?: SurveyIndustrialSettings;
  industrialBackground?: SurveyIndustrialBackground | null;
  industrialTool?: SurveyIndustrialTool;
  industrialBuildingContours?: SurveyIndustrialBuildingContour[];
  activeIndustrialBuildingContourId?: string | null;
  pillars?: SurveyPillar[];
  activePillarId?: string | null;
  industrialMarkups?: SurveyIndustrialMarkup[];
  activeIndustrialMarkupId?: string | null;
  activeIndustrialPointIndex?: number | null;
  issues?: PropertySurveyIssue[];
  activeIssueId?: string | null;
  issuePlacementMode?: PropertySurveyIssuePlacementMode;
  sectionLines?: SurveySectionLine[];
  activeSectionLineId?: string | null;
  sectionDrawingMode?: boolean;
  sectionDrawingConstraint?: SurveySectionDrawingConstraint;
  roomDrawingMode?: boolean;
  onRoomSelect: (roomId: string) => void;
  onNorthAngleChange: (angle: number) => void;
  onRoomDrawingStart?: () => void;
  onRoomDrawingCancel?: () => void;
  onRoomDraw?: (rectangle: { x: number; y: number; width: number; depth: number }) => void;
  onRoomMove?: (roomId: string, position: { x: number; y: number }) => void;
  onWallSelect?: (wallSegmentId: string) => void;
  onOpeningSelect?: (openingId: string) => void;
  onOpeningMove?: (openingId: string, offsetRatio: number) => void;
  onPhotoSelect?: (photoId: string) => void;
  onPhotoPlace?: (position: { xPercent: number; yPercent: number; roomId: string }) => void;
  onPhotoPlacementCancel?: () => void;
  onMechanicalSelect?: (deviceId: string) => void;
  onMechanicalPlace?: (position: { roomId: string; xRatio: number; yRatio: number }) => void;
  onMechanicalPlacementCancel?: () => void;
  onPillarPlace?: (position: SurveyIndustrialPoint) => void;
  onPillarSelect?: (pillarId: string) => void;
  onPillarMove?: (pillarId: string, position: SurveyIndustrialPoint) => void;
  onIndustrialBuildingContourSelect?: (contourId: string) => void;
  onIndustrialBuildingContourCreate?: (points: SurveyIndustrialPoint[]) => void;
  onIndustrialBuildingContourPointMove?: (contourId: string, pointIndex: number, position: SurveyIndustrialPoint) => void;
  onIndustrialMarkupSelect?: (markupId: string) => void;
  onIndustrialMarkupCreate?: (kind: SurveyIndustrialMarkupKind, points: SurveyIndustrialPoint[]) => void;
  onIndustrialMarkupPointMove?: (markupId: string, pointIndex: number, position: SurveyIndustrialPoint) => void;
  onIndustrialVectorPointSelect?: (entityType: "markup" | "building", entityId: string, pointIndex: number) => void;
  onIndustrialBackgroundTransform?: (patch: Pick<SurveyIndustrialBackground, "offsetXMeters" | "offsetYMeters">) => void;
  onIndustrialVectorEditStart?: () => void;
  onIndustrialVectorEditEnd?: () => void;
  onIndustrialBackgroundCalibrationPointAdd?: (position: SurveyIndustrialPoint) => void;
  onIssueSelect?: (issueId: string) => void;
  onIssuePlace?: (position: { xPercent: number; yPercent: number; roomId: string }) => void;
  onIssuePlacementCancel?: () => void;
  onSectionLineSelect?: (lineId: string) => void;
  onSectionLineDraw?: (line: { start: { x: number; y: number }; end: { x: number; y: number } }) => void;
  onSectionDrawingCancel?: () => void;
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 4;
const MODEL_BOUNDS = { x: 72, y: 72, width: 756, height: 455 };
const SURVEY_VIRTUAL_BOUNDS = { minX: -7200, minY: -7200, maxX: 7200, maxY: 7200 };
const ROOM_SNAP_DISTANCE = 16;
const ROOM_SNAP_MIN_OVERLAP = 10;

type StageTouchPoint = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

type StagePinchState = {
  pointerIds: [number, number];
  startDistance: number;
  startCenterX: number;
  startCenterY: number;
  startZoom: number;
  startPanX: number;
  startPanY: number;
};

type RoomSnapGuide = {
  axis: "x" | "y";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  candidateRoomId: string;
};

type RoomSnapResult = {
  x: number;
  y: number;
  guides: RoomSnapGuide[];
  key: string;
};

function rangeOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function snapRoomPosition(room: SurveyRoom, x: number, y: number, rooms: SurveyRoom[]): RoomSnapResult {
  const others = rooms.filter((candidate) => candidate.id !== room.id);
  let snappedX = x;
  let snappedY = y;
  let bestX: { distance: number; target: number; candidate: SurveyRoom } | null = null;
  let bestY: { distance: number; target: number; candidate: SurveyRoom } | null = null;

  for (const candidate of others) {
    const verticalOverlap = rangeOverlap(y, y + room.depth, candidate.y, candidate.y + candidate.depth);
    if (verticalOverlap >= ROOM_SNAP_MIN_OVERLAP) {
      const targets = [candidate.x + candidate.width, candidate.x - room.width];
      for (const target of targets) {
        const distance = Math.abs(x - target);
        if (distance <= ROOM_SNAP_DISTANCE && (!bestX || distance < bestX.distance)) bestX = { distance, target, candidate };
      }
    }

    const horizontalOverlap = rangeOverlap(x, x + room.width, candidate.x, candidate.x + candidate.width);
    if (horizontalOverlap >= ROOM_SNAP_MIN_OVERLAP) {
      const targets = [candidate.y + candidate.depth, candidate.y - room.depth];
      for (const target of targets) {
        const distance = Math.abs(y - target);
        if (distance <= ROOM_SNAP_DISTANCE && (!bestY || distance < bestY.distance)) bestY = { distance, target, candidate };
      }
    }
  }

  if (bestX) snappedX = bestX.target;
  if (bestY) snappedY = bestY.target;

  const guides: RoomSnapGuide[] = [];
  if (bestX) {
    const overlapStart = Math.max(snappedY, bestX.candidate.y);
    const overlapEnd = Math.min(snappedY + room.depth, bestX.candidate.y + bestX.candidate.depth);
    if (overlapEnd - overlapStart >= ROOM_SNAP_MIN_OVERLAP) {
      const edgeX = bestX.target === bestX.candidate.x + bestX.candidate.width ? snappedX : snappedX + room.width;
      guides.push({ axis: "x", x1: edgeX, y1: overlapStart, x2: edgeX, y2: overlapEnd, candidateRoomId: bestX.candidate.id });
    }
  }
  if (bestY) {
    const overlapStart = Math.max(snappedX, bestY.candidate.x);
    const overlapEnd = Math.min(snappedX + room.width, bestY.candidate.x + bestY.candidate.width);
    if (overlapEnd - overlapStart >= ROOM_SNAP_MIN_OVERLAP) {
      const edgeY = bestY.target === bestY.candidate.y + bestY.candidate.depth ? snappedY : snappedY + room.depth;
      guides.push({ axis: "y", x1: overlapStart, y1: edgeY, x2: overlapEnd, y2: edgeY, candidateRoomId: bestY.candidate.id });
    }
  }

  const key = guides.map((guide) => `${guide.axis}:${guide.candidateRoomId}:${guide.x1.toFixed(1)}:${guide.y1.toFixed(1)}`).join("|");
  return { x: snappedX, y: snappedY, guides, key };
}

type SurveyCompassDirection = {
  short: "É" | "ÉK" | "K" | "DK" | "D" | "DNy" | "Ny" | "ÉNy";
  label: string;
  azimuth: number;
};

const surveyCompassDirections: SurveyCompassDirection[] = [
  { short: "É", label: "Észak", azimuth: 0 },
  { short: "ÉK", label: "Északkelet", azimuth: 45 },
  { short: "K", label: "Kelet", azimuth: 90 },
  { short: "DK", label: "Délkelet", azimuth: 135 },
  { short: "D", label: "Dél", azimuth: 180 },
  { short: "DNy", label: "Délnyugat", azimuth: 225 },
  { short: "Ny", label: "Nyugat", azimuth: 270 },
  { short: "ÉNy", label: "Északnyugat", azimuth: 315 },
];

function getRoomContentBounds(rooms: SurveyRoom[]) {
  if (!rooms.length) return { x: MODEL_BOUNDS.x, y: MODEL_BOUNDS.y, maxX: MODEL_BOUNDS.x + MODEL_BOUNDS.width, maxY: MODEL_BOUNDS.y + MODEL_BOUNDS.height };
  return {
    x: Math.min(...rooms.map((room) => room.x)),
    y: Math.min(...rooms.map((room) => room.y)),
    maxX: Math.max(...rooms.map((room) => room.x + room.width)),
    maxY: Math.max(...rooms.map((room) => room.y + room.depth)),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeAngle360(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeSignedAngle(value: number) {
  const normalized = normalizeAngle360(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function getCompassDirection(azimuth: number) {
  const index = Math.round(normalizeAngle360(azimuth) / 45) % surveyCompassDirections.length;
  return surveyCompassDirections[index];
}

function getAngularDistance(left: number, right: number) {
  return Math.abs(normalizeSignedAngle(left - right));
}

function wallColor(segment: SurveyWallSegment, selected: boolean) {
  if (selected) return "#0891b2";
  if (segment.boundaryType === "external") return "#f97316";
  if (segment.boundaryType === "unheated") return "#eab308";
  if (segment.boundaryType === "ground") return "#92400e";
  if (segment.boundaryType === "adjacent") return "#8b5cf6";
  return "#94a3b8";
}

function splitSurveySheetText(value: string | undefined, maxCharacters: number) {
  const text = (value || "Nincs megadva").replace(/\s+/g, " ").trim();
  if (text.length <= maxCharacters) return [text];
  const firstLimit = Math.max(8, maxCharacters);
  const firstBreak = text.lastIndexOf(" ", firstLimit);
  const splitAt = firstBreak >= Math.round(firstLimit * 0.55) ? firstBreak : firstLimit;
  const first = text.slice(0, splitAt).trim();
  let second = text.slice(splitAt).trim();
  if (second.length > maxCharacters) second = `${second.slice(0, Math.max(1, maxCharacters - 1)).trim()}…`;
  return [first, second];
}

function SurveySheetTitleCell({ x, y, width, height, label, value, pixelsPerMillimeter, maxCharacters }: { x: number; y: number; width: number; height: number; label: string; value: string; pixelsPerMillimeter: number; maxCharacters: number }) {
  const lines = splitSurveySheetText(value, maxCharacters);
  const labelSize = Math.max(3.6, pixelsPerMillimeter * 1.65);
  const valueSize = Math.max(5.2, pixelsPerMillimeter * 2.35);
  const paddingX = Math.max(4, pixelsPerMillimeter * 2);
  const labelY = y + Math.max(6, pixelsPerMillimeter * 3.2);
  const valueStartY = y + Math.max(14, pixelsPerMillimeter * 7.6);
  const lineHeight = Math.max(6.4, pixelsPerMillimeter * 3.8);
  return <g data-survey-title-cell={label}>
    <rect x={x} y={y} width={width} height={height} fill="#ffffff" fillOpacity="0.96" stroke="#14b8a6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    <text x={x + paddingX} y={labelY} fill="#0f766e" fontSize={labelSize} fontWeight="900">{label}</text>
    <text x={x + paddingX} y={valueStartY} fill="#0f172a" fontSize={valueSize} fontWeight="800">
      {lines.map((line, index) => <tspan key={`${label}-${index}`} x={x + paddingX} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>)}
    </text>
  </g>;
}

export function SurveyFloorPlanEngine({
  rooms,
  activeRoomId,
  levelName = "Földszint",
  northAngle,
  planSheet,
  effectiveScale,
  projectName = "DIMPRO projekt",
  surveyName = "Felmérés",
  surveyType = "Felmérés",
  surveyLocation = "Nincs megadva",
  surveyDate = "Nincs megadva",
  surveyCreator = "Nincs megadva",
  clientName = "Nincs megadva",
  drawingRevision = "v001",
  wallSegments = [],
  wallOpenings = [],
  activeWallSegmentId = null,
  activeOpeningId = null,
  wallSelectionMode = false,
  thermalBoundary,
  thermalLayerAvailable = true,
  orientationControlsOpen = false,
  onOrientationControlsOpenChange,
  photoPoints = [],
  activePhotoPointId = null,
  photoPlacementMode = null,
  mechanicalDevices = [],
  activeMechanicalDeviceId = null,
  mechanicalPlacementMode = null,
  industrialMode = false,
  focusMode = false,
  focusLayout = "full",
  industrialSettings,
  industrialBackground = null,
  industrialTool = "select",
  industrialBuildingContours = [],
  activeIndustrialBuildingContourId = null,
  pillars = [],
  activePillarId = null,
  industrialMarkups = [],
  activeIndustrialMarkupId = null,
  activeIndustrialPointIndex = null,
  issues = [],
  activeIssueId = null,
  issuePlacementMode = null,
  sectionLines = [],
  activeSectionLineId = null,
  sectionDrawingMode = false,
  sectionDrawingConstraint = "free",
  roomDrawingMode = false,
  onRoomSelect,
  onNorthAngleChange,
  onRoomDrawingStart,
  onRoomDrawingCancel,
  onRoomDraw,
  onRoomMove,
  onWallSelect,
  onOpeningSelect,
  onOpeningMove,
  onPhotoSelect,
  onPhotoPlace,
  onPhotoPlacementCancel,
  onMechanicalSelect,
  onMechanicalPlace,
  onMechanicalPlacementCancel,
  onPillarPlace,
  onPillarSelect,
  onPillarMove,
  onIndustrialBuildingContourSelect,
  onIndustrialBuildingContourCreate,
  onIndustrialBuildingContourPointMove,
  onIndustrialMarkupSelect,
  onIndustrialMarkupCreate,
  onIndustrialMarkupPointMove,
  onIndustrialVectorPointSelect,
  onIndustrialBackgroundTransform,
  onIndustrialVectorEditStart,
  onIndustrialVectorEditEnd,
  onIndustrialBackgroundCalibrationPointAdd,
  onIssueSelect,
  onIssuePlace,
  onIssuePlacementCancel,
  onSectionLineSelect,
  onSectionLineDraw,
  onSectionDrawingCancel,
}: SurveyFloorPlanEngineProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fitRevision, setFitRevision] = useState(0);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const activeTouchPointersRef = useRef<Map<number, StageTouchPoint>>(new Map());
  const pinchStateRef = useRef<StagePinchState | null>(null);
  const [dragState, setDragState] = useState<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showThermalLayer, setShowThermalLayer] = useState(thermalLayerAvailable);
  const [showIssueMarkers, setShowIssueMarkers] = useState(true);

  useEffect(() => {
    setShowThermalLayer(thermalLayerAvailable);
  }, [thermalLayerAvailable]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const preventNativeTouchScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    stage.addEventListener("touchmove", preventNativeTouchScroll, { passive: false });
    return () => stage.removeEventListener("touchmove", preventNativeTouchScroll);
  }, []);
  const [roomDrawState, setRoomDrawState] = useState<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const roomDrawStateRef = useRef<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [sectionDrawState, setSectionDrawState] = useState<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const sectionDrawStateRef = useRef<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [roomMoveState, setRoomMoveState] = useState<{ pointerId: number; roomId: string; offsetX: number; offsetY: number } | null>(null);
  const [openingMoveState, setOpeningMoveState] = useState<{ pointerId: number; openingId: string } | null>(null);
  const [pillarMoveState, setPillarMoveState] = useState<{ pointerId: number; pillarId: string } | null>(null);
  const pillarMoveStateRef = useRef<{ pointerId: number; pillarId: string } | null>(null);
  const vectorPointMoveStateRef = useRef<{ pointerId: number; entityType: "markup" | "building"; entityId: string; pointIndex: number } | null>(null);
  const backgroundMoveStateRef = useRef<{ pointerId: number; start: SurveyIndustrialPoint; offsetXMeters: number; offsetYMeters: number } | null>(null);
  const [industrialDrawState, setIndustrialDrawState] = useState<{ pointerId: number; kind: SurveyIndustrialDrawKind; points: SurveyIndustrialPoint[] } | null>(null);
  const suppressIndustrialClickRef = useRef(false);
  const [roomSnapGuides, setRoomSnapGuides] = useState<RoomSnapGuide[]>([]);
  const lastRoomSnapKeyRef = useRef("");

  const totalArea = useMemo(() => rooms.reduce((sum, room) => sum + room.area, 0), [rooms]);
  const heatedArea = useMemo(() => rooms.filter((room) => room.heated).reduce((sum, room) => sum + room.area, 0), [rooms]);
  const unheatedArea = useMemo(() => rooms.filter((room) => !room.heated).reduce((sum, room) => sum + room.area, 0), [rooms]);
  const roomFitSignature = rooms.map((room) => `${room.id}:${room.width.toFixed(2)}:${room.depth.toFixed(2)}`).join("|");
  // A helyiségek x/y mozgatása önmagában nem indít automatikus újraillesztést.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableContentBounds = useMemo(() => getRoomContentBounds(rooms), [fitRevision, roomFitSignature]);
  const topEdgeAzimuth = normalizeAngle360(-northAngle);
  const topEdgeDirection = getCompassDirection(topEdgeAzimuth);
  const paperFrame = useMemo(() => {
    const paper = getPaperDimensionsMm(planSheet);
    const aspect = paper.width / paper.height;
    const maxWidth = 840;
    const maxHeight = 560;
    const width = aspect > maxWidth / maxHeight ? maxWidth : maxHeight * aspect;
    const height = aspect > maxWidth / maxHeight ? maxWidth / aspect : maxHeight;
    const x = (900 - width) / 2;
    const y = (610 - height) / 2;
    const pixelsPerMillimeter = width / paper.width;
    const frameInset = 5 * pixelsPerMillimeter;
    const titleBlockWidth = Math.min(200 * pixelsPerMillimeter, Math.max(0, width - frameInset * 2));
    const titleBlockHeight = 34 * pixelsPerMillimeter;
    const titleBlock = {
      x: x + width - frameInset - titleBlockWidth,
      y: y + height - frameInset - titleBlockHeight,
      width: titleBlockWidth,
      height: titleBlockHeight,
      rowHeight: titleBlockHeight / 2,
    };
    const planInfoVisible = rooms.length > 0;
    const planInfoHeight = planInfoVisible ? 24 * pixelsPerMillimeter : 0;
    const planInfoGap = planInfoVisible ? 3 * pixelsPerMillimeter : 0;
    const planInfoBlock = {
      x: titleBlock.x,
      y: titleBlock.y - planInfoGap - planInfoHeight,
      width: titleBlock.width,
      height: planInfoHeight,
      visible: planInfoVisible,
    };
    const marginMillimeters = 15;
    const margin = marginMillimeters * pixelsPerMillimeter;
    const printableTop = y + margin;
    const reservedBottomTop = planInfoVisible ? planInfoBlock.y : titleBlock.y;
    const printableBottom = Math.min(y + height - margin, reservedBottomTop - 3 * pixelsPerMillimeter);
    const printable = { x: x + margin, y: printableTop, width: width - margin * 2, height: Math.max(40, printableBottom - printableTop) };
    const content = stableContentBounds;
    const fit = (1000 / Math.max(1, effectiveScale) * pixelsPerMillimeter) / 60;
    const contentCenterX = (content.x + content.maxX) / 2;
    const contentCenterY = (content.y + content.maxY) / 2;
    const tx = printable.x + printable.width / 2 - contentCenterX * fit;
    const ty = printable.y + printable.height / 2 - contentCenterY * fit;
    const contentDisplayWidth = (content.maxX - content.x) * fit;
    const contentDisplayHeight = (content.maxY - content.y) * fit;
    const overflows = contentDisplayWidth > printable.width + 0.5 || contentDisplayHeight > printable.height + 0.5;
    return { x, y, width, height, printable, fit, tx, ty, paper, overflows, pixelsPerMillimeter, frameInset, titleBlock, planInfoBlock };
  }, [effectiveScale, planSheet, rooms.length, stableContentBounds]);

  const activeWall = wallSegments.find((segment) => segment.id === activeWallSegmentId) || null;

  useEffect(() => {
    function stopDrag() {
      activeTouchPointersRef.current.clear();
      pinchStateRef.current = null;
      setDragState(null);
      setRoomMoveState(null);
      setOpeningMoveState(null);
      pillarMoveStateRef.current = null;
      vectorPointMoveStateRef.current = null;
      backgroundMoveStateRef.current = null;
      setPillarMoveState(null);
      setIndustrialDrawState(null);
      sectionDrawStateRef.current = null;
      setSectionDrawState(null);
      setRoomSnapGuides([]);
      lastRoomSnapKeyRef.current = "";
    }
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("blur", stopDrag);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      window.removeEventListener("blur", stopDrag);
    };
  }, []);

  useEffect(() => {
    if (!issuePlacementMode && !photoPlacementMode && !mechanicalPlacementMode && !roomDrawingMode && !sectionDrawingMode) return;
    function cancelPlacement(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (issuePlacementMode) onIssuePlacementCancel?.();
      if (photoPlacementMode) onPhotoPlacementCancel?.();
      if (mechanicalPlacementMode) onMechanicalPlacementCancel?.();
      if (roomDrawingMode) {
        roomDrawStateRef.current = null;
        setRoomDrawState(null);
        onRoomDrawingCancel?.();
      }
      if (sectionDrawingMode) {
        sectionDrawStateRef.current = null;
        setSectionDrawState(null);
        onSectionDrawingCancel?.();
      }
    }
    window.addEventListener("keydown", cancelPlacement);
    return () => window.removeEventListener("keydown", cancelPlacement);
  }, [issuePlacementMode, photoPlacementMode, mechanicalPlacementMode, onIssuePlacementCancel, onPhotoPlacementCancel, onMechanicalPlacementCancel, onRoomDrawingCancel, onSectionDrawingCancel, roomDrawingMode, sectionDrawingMode]);

  function setZoomValue(value: number) {
    const next = Number(clamp(value, MIN_ZOOM, MAX_ZOOM).toFixed(3));
    zoomRef.current = next;
    setZoom(next);
  }

  function setPanValue(value: { x: number; y: number }) {
    panRef.current = value;
    setPan(value);
  }

  function changeZoom(delta: number) {
    setZoomValue(zoomRef.current + delta);
  }

  function fitPlan() {
    setFitRevision((current) => current + 1);
    setZoomValue(1);
    setPanValue({ x: 0, y: 0 });
  }

  function modelToDisplay(point: { x: number; y: number }) {
    return { x: point.x * paperFrame.fit + paperFrame.tx, y: point.y * paperFrame.fit + paperFrame.ty };
  }

  function displayToModel(point: { x: number; y: number }) {
    return {
      x: (point.x - paperFrame.tx) / paperFrame.fit,
      y: (point.y - paperFrame.ty) / paperFrame.fit,
    };
  }

  function cancelDirectManipulationForPinch() {
    const industrialEditWasActive = Boolean(pillarMoveStateRef.current || vectorPointMoveStateRef.current || backgroundMoveStateRef.current);
    setDragState(null);
    setRoomMoveState(null);
    setOpeningMoveState(null);
    pillarMoveStateRef.current = null;
    vectorPointMoveStateRef.current = null;
    backgroundMoveStateRef.current = null;
    setPillarMoveState(null);
    setIndustrialDrawState(null);
    roomDrawStateRef.current = null;
    setRoomDrawState(null);
    sectionDrawStateRef.current = null;
    setSectionDrawState(null);
    setRoomSnapGuides([]);
    lastRoomSnapKeyRef.current = "";
    if (industrialEditWasActive) onIndustrialVectorEditEnd?.();
  }

  function getTouchPair() {
    const touches = [...activeTouchPointersRef.current.values()];
    return touches.length >= 2 ? [touches[0], touches[1]] as const : null;
  }

  function beginStageTouchCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (event.cancelable) event.preventDefault();
    activeTouchPointersRef.current.set(event.pointerId, { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    const pair = getTouchPair();
    if (!pair || pinchStateRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    const [first, second] = pair;
    const startDistance = Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
    cancelDirectManipulationForPinch();
    pinchStateRef.current = {
      pointerIds: [first.pointerId, second.pointerId],
      startDistance,
      startCenterX: (first.clientX + second.clientX) / 2 - bounds.left,
      startCenterY: (first.clientY + second.clientY) / 2 - bounds.top,
      startZoom: zoomRef.current,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
  }

  function moveStageTouchCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (event.cancelable) event.preventDefault();
    if (activeTouchPointersRef.current.has(event.pointerId)) {
      activeTouchPointersRef.current.set(event.pointerId, { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    }
    const pinch = pinchStateRef.current;
    if (!pinch) return;
    const first = activeTouchPointersRef.current.get(pinch.pointerIds[0]);
    const second = activeTouchPointersRef.current.get(pinch.pointerIds[1]);
    const stage = stageRef.current;
    if (!first || !second || !stage) return;
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    const currentDistance = Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
    const nextZoom = Number(clamp(pinch.startZoom * (currentDistance / pinch.startDistance), MIN_ZOOM, MAX_ZOOM).toFixed(3));
    const actualRatio = nextZoom / Math.max(0.001, pinch.startZoom);
    const currentCenterX = (first.clientX + second.clientX) / 2 - bounds.left;
    const currentCenterY = (first.clientY + second.clientY) / 2 - bounds.top;
    const stageCenterX = bounds.width / 2;
    const stageCenterY = bounds.height / 2;
    const nextPan = {
      x: currentCenterX - stageCenterX - actualRatio * (pinch.startCenterX - stageCenterX - pinch.startPanX),
      y: currentCenterY - stageCenterY - actualRatio * (pinch.startCenterY - stageCenterY - pinch.startPanY),
    };
    setZoomValue(nextZoom);
    setPanValue(nextPan);
  }

  function endStageTouchCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    activeTouchPointersRef.current.delete(event.pointerId);
    const pinch = pinchStateRef.current;
    if (pinch?.pointerIds.includes(event.pointerId)) {
      pinchStateRef.current = null;
      setDragState(null);
    }
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (pinchStateRef.current || activeTouchPointersRef.current.size >= 2 || issuePlacementMode || photoPlacementMode || mechanicalPlacementMode || roomDrawingMode || sectionDrawingMode || roomMoveState || openingMoveState || pillarMoveState || industrialDrawState || (industrialMode && industrialTool !== "select")) return;
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-room-button='true']") || target.closest("[data-plan-marker='true']") || target.closest("[data-wall-segment='true']") || target.closest("[data-wall-opening='true']") || target.closest("[data-survey-section-line='true']") || target.closest("[data-industrial-pillar='true']") || target.closest("[data-industrial-markup='true']")) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture nélkül is működik */ }
    setDragState({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: panRef.current.x, panY: panRef.current.y });
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    if (pinchStateRef.current || !dragState || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPanValue({ x: dragState.panX + event.clientX - dragState.startX, y: dragState.panY + event.clientY - dragState.startY });
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer capture már megszűnhetett */ }
    setDragState(null);
  }

  function getDisplayPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    }
    const bounds = svg.getBoundingClientRect();
    return { x: ((clientX - bounds.left) / Math.max(1, bounds.width)) * 900, y: ((clientY - bounds.top) / Math.max(1, bounds.height)) * 610 };
  }

  function getPlanPointFromSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
    const model = displayToModel(getDisplayPoint(svg, clientX, clientY));
    if (industrialMode) {
      return {
        x: clamp(model.x, MODEL_BOUNDS.x, MODEL_BOUNDS.x + MODEL_BOUNDS.width),
        y: clamp(model.y, MODEL_BOUNDS.y, MODEL_BOUNDS.y + MODEL_BOUNDS.height),
      };
    }
    return {
      x: clamp(model.x, SURVEY_VIRTUAL_BOUNDS.minX, SURVEY_VIRTUAL_BOUNDS.maxX),
      y: clamp(model.y, SURVEY_VIRTUAL_BOUNDS.minY, SURVEY_VIRTUAL_BOUNDS.maxY),
    };
  }

  function getPlanPoint(event: React.PointerEvent<SVGSVGElement>) {
    return getPlanPointFromSvg(event.currentTarget, event.clientX, event.clientY);
  }

  function beginRoomMove(event: React.PointerEvent<SVGGElement>, room: SurveyRoom) {
    if (pinchStateRef.current || activeTouchPointersRef.current.size >= 2 || issuePlacementMode || photoPlacementMode || mechanicalPlacementMode || roomDrawingMode || sectionDrawingMode || wallSelectionMode || (industrialMode && industrialTool !== "select") || !onRoomMove) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    onRoomSelect(room.id);
    const point = getPlanPointFromSvg(svg, event.clientX, event.clientY);
    try { svg.setPointerCapture(event.pointerId); } catch { /* SVG pointer capture nélkül is működhet */ }
    setRoomMoveState({ pointerId: event.pointerId, roomId: room.id, offsetX: point.x - room.x, offsetY: point.y - room.y });
  }

  function moveRoomOnPlan(event: React.PointerEvent<SVGSVGElement>) {
    if (pinchStateRef.current || !roomMoveState || roomMoveState.pointerId !== event.pointerId || !onRoomMove) return;
    const room = rooms.find((item) => item.id === roomMoveState.roomId);
    if (!room) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPlanPoint(event);
    const rawX = clamp(point.x - roomMoveState.offsetX, SURVEY_VIRTUAL_BOUNDS.minX, SURVEY_VIRTUAL_BOUNDS.maxX - room.width);
    const rawY = clamp(point.y - roomMoveState.offsetY, SURVEY_VIRTUAL_BOUNDS.minY, SURVEY_VIRTUAL_BOUNDS.maxY - room.depth);
    const snapped = snapRoomPosition(room, rawX, rawY, rooms);
    const x = clamp(snapped.x, SURVEY_VIRTUAL_BOUNDS.minX, SURVEY_VIRTUAL_BOUNDS.maxX - room.width);
    const y = clamp(snapped.y, SURVEY_VIRTUAL_BOUNDS.minY, SURVEY_VIRTUAL_BOUNDS.maxY - room.depth);
    setRoomSnapGuides(snapped.guides);
    if (snapped.key && snapped.key !== lastRoomSnapKeyRef.current) {
      try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(18); } catch { /* haptikus jelzés opcionális */ }
    }
    lastRoomSnapKeyRef.current = snapped.key;
    onRoomMove(room.id, { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
  }

  function endRoomMoveOnPlan(event: React.PointerEvent<SVGSVGElement>) {
    if (!roomMoveState || roomMoveState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer capture már megszűnhetett */ }
    setRoomMoveState(null);
    setRoomSnapGuides([]);
    lastRoomSnapKeyRef.current = "";
  }

  function beginRoomDraw(event: React.PointerEvent<SVGSVGElement>) {
    if (!roomDrawingMode || !onRoomDraw) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPlanPoint(event);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture nélkül is folytatható */ }
    const nextState = { pointerId: event.pointerId, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y };
    roomDrawStateRef.current = nextState;
    setRoomDrawState(nextState);
  }

  function moveRoomDraw(event: React.PointerEvent<SVGSVGElement>) {
    const current = roomDrawStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPlanPoint(event);
    const nextState = { ...current, currentX: point.x, currentY: point.y };
    roomDrawStateRef.current = nextState;
    setRoomDrawState(nextState);
  }

  function endRoomDraw(event: React.PointerEvent<SVGSVGElement>) {
    const current = roomDrawStateRef.current;
    if (!current || current.pointerId !== event.pointerId || !onRoomDraw) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPlanPoint(event);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer capture már megszűnhetett */ }
    const x = Math.min(current.startX, point.x);
    const y = Math.min(current.startY, point.y);
    const width = Math.abs(point.x - current.startX);
    const depth = Math.abs(point.y - current.startY);
    roomDrawStateRef.current = null;
    setRoomDrawState(null);
    if (width < 48 || depth < 48) return;
    onRoomDraw({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), width: Number(width.toFixed(1)), depth: Number(depth.toFixed(1)) });
  }

  function constrainSectionPoint(startX: number, startY: number, point: { x: number; y: number }) {
    if (sectionDrawingConstraint === "horizontal") return { x: point.x, y: startY };
    if (sectionDrawingConstraint === "vertical") return { x: startX, y: point.y };
    return point;
  }

  function beginSectionDraw(event: React.PointerEvent<SVGSVGElement>) {
    if (!sectionDrawingMode || !onSectionLineDraw) return false;
    event.preventDefault();
    event.stopPropagation();
    const point = getPlanPoint(event);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture nélkül is folytatható */ }
    const nextState = { pointerId: event.pointerId, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y };
    sectionDrawStateRef.current = nextState;
    setSectionDrawState(nextState);
    return true;
  }

  function moveSectionDraw(event: React.PointerEvent<SVGSVGElement>) {
    const current = sectionDrawStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = constrainSectionPoint(current.startX, current.startY, getPlanPoint(event));
    const nextState = { ...current, currentX: point.x, currentY: point.y };
    sectionDrawStateRef.current = nextState;
    setSectionDrawState(nextState);
  }

  function endSectionDraw(event: React.PointerEvent<SVGSVGElement>) {
    const current = sectionDrawStateRef.current;
    if (!current || current.pointerId !== event.pointerId || !onSectionLineDraw) return;
    event.preventDefault();
    event.stopPropagation();
    const point = constrainSectionPoint(current.startX, current.startY, getPlanPoint(event));
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer capture már megszűnhetett */ }
    sectionDrawStateRef.current = null;
    setSectionDrawState(null);
    if (Math.hypot(point.x - current.startX, point.y - current.startY) < 36) return;
    onSectionLineDraw({
      start: { x: Number(current.startX.toFixed(1)), y: Number(current.startY.toFixed(1)) },
      end: { x: Number(point.x.toFixed(1)), y: Number(point.y.toFixed(1)) },
    });
  }

  function beginOpeningMove(event: React.PointerEvent<SVGGElement>, opening: SurveyWallOpening) {
    if (!onOpeningMove) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    onOpeningSelect?.(opening.id);
    try { svg.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
    setOpeningMoveState({ pointerId: event.pointerId, openingId: opening.id });
  }

  function moveOpeningOnPlan(event: React.PointerEvent<SVGSVGElement>) {
    if (!openingMoveState || openingMoveState.pointerId !== event.pointerId || !onOpeningMove) return;
    const opening = wallOpenings.find((item) => item.id === openingMoveState.openingId);
    const segment = opening ? wallSegments.find((item) => item.id === opening.wallSegmentId) : null;
    const room = opening ? rooms.find((item) => item.id === opening.roomId) : null;
    if (!opening || !segment || !room) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPlanPoint(event);
    const geometry = getWallSegmentGeometry(room, segment);
    const dx = geometry.x2 - geometry.x1;
    const dy = geometry.y2 - geometry.y1;
    const lengthSquared = Math.max(1, dx * dx + dy * dy);
    const projected = ((point.x - geometry.x1) * dx + (point.y - geometry.y1) * dy) / lengthSquared;
    const halfOpeningRatio = Math.min(0.45, Math.max(0, opening.widthMeters / Math.max(0.1, geometry.lengthMeters) / 2));
    onOpeningMove(opening.id, clamp(projected, halfOpeningRatio, 1 - halfOpeningRatio));
  }

  function endOpeningMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!openingMoveState || openingMoveState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* opcionális */ }
    setOpeningMoveState(null);
  }

  function industrialToModel(point: SurveyIndustrialPoint) {
    const settings = industrialSettings;
    if (!settings) return { x: MODEL_BOUNDS.x, y: MODEL_BOUNDS.y };
    return {
      x: MODEL_BOUNDS.x + clamp(point.xMeters / Math.max(0.1, settings.planWidthMeters), 0, 1) * MODEL_BOUNDS.width,
      y: MODEL_BOUNDS.y + clamp(point.yMeters / Math.max(0.1, settings.planHeightMeters), 0, 1) * MODEL_BOUNDS.height,
    };
  }

  function modelToIndustrial(point: { x: number; y: number }): SurveyIndustrialPoint {
    const settings = industrialSettings;
    if (!settings) return { xMeters: 0, yMeters: 0 };
    return {
      xMeters: Number((clamp((point.x - MODEL_BOUNDS.x) / MODEL_BOUNDS.width, 0, 1) * settings.planWidthMeters).toFixed(3)),
      yMeters: Number((clamp((point.y - MODEL_BOUNDS.y) / MODEL_BOUNDS.height, 0, 1) * settings.planHeightMeters).toFixed(3)),
    };
  }

  function beginIndustrialDraw(event: React.PointerEvent<SVGSVGElement>) {
    if (!industrialMode || !industrialSettings || !["buildingContour", "crack", "repairArea", "freehand"].includes(industrialTool)) return false;
    const kind = industrialTool as SurveyIndustrialDrawKind;
    if (kind === "buildingContour" ? !onIndustrialBuildingContourCreate : !onIndustrialMarkupCreate) return false;
    event.preventDefault();
    event.stopPropagation();
    const point = snapIndustrialPoint({ point: modelToIndustrial(getPlanPoint(event)), settings: industrialSettings });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
    setIndustrialDrawState({ pointerId: event.pointerId, kind, points: [point] });
    return true;
  }

  function moveIndustrialDraw(event: React.PointerEvent<SVGSVGElement>) {
    if (!industrialDrawState || industrialDrawState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const rawPoint = modelToIndustrial(getPlanPoint(event));
    setIndustrialDrawState((current) => {
      if (!current || !industrialSettings) return current;
      const previous = current.points[current.points.length - 1];
      const point = snapIndustrialPoint({ point: rawPoint, settings: industrialSettings, previousPoint: previous });
      if (previous && Math.hypot(point.xMeters - previous.xMeters, point.yMeters - previous.yMeters) < 0.035) return current;
      return { ...current, points: [...current.points, point] };
    });
  }

  function endIndustrialDraw(event: React.PointerEvent<SVGSVGElement>) {
    if (!industrialDrawState || industrialDrawState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* opcionális */ }
    const minimum = industrialDrawState.kind === "repairArea" || industrialDrawState.kind === "buildingContour" ? 3 : 2;
    if (industrialDrawState.points.length >= minimum) {
      if (industrialDrawState.kind === "buildingContour") onIndustrialBuildingContourCreate?.(industrialDrawState.points);
      else onIndustrialMarkupCreate?.(industrialDrawState.kind, industrialDrawState.points);
    }
    setIndustrialDrawState(null);
    suppressIndustrialClickRef.current = true;
  }

  function beginVectorPointMove(
    event: React.PointerEvent<SVGCircleElement>,
    entityType: "markup" | "building",
    entityId: string,
    pointIndex: number,
  ) {
    if (!industrialMode || industrialTool !== "select") return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    if (entityType === "markup") onIndustrialMarkupSelect?.(entityId);
    else onIndustrialBuildingContourSelect?.(entityId);
    onIndustrialVectorPointSelect?.(entityType, entityId, pointIndex);
    try { svg.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
    vectorPointMoveStateRef.current = { pointerId: event.pointerId, entityType, entityId, pointIndex };
    onIndustrialVectorEditStart?.();
  }

  function moveVectorPoint(event: React.PointerEvent<SVGSVGElement>) {
    const current = vectorPointMoveStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const position = modelToIndustrial(getPlanPoint(event));
    if (current.entityType === "markup") onIndustrialMarkupPointMove?.(current.entityId, current.pointIndex, position);
    else onIndustrialBuildingContourPointMove?.(current.entityId, current.pointIndex, position);
  }

  function endVectorPointMove(event: React.PointerEvent<SVGSVGElement>) {
    const current = vectorPointMoveStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* opcionális */ }
    vectorPointMoveStateRef.current = null;
    onIndustrialVectorEditEnd?.();
  }

  function beginPillarMove(event: React.PointerEvent<SVGGElement>, pillar: SurveyPillar) {
    if (!industrialMode || industrialTool !== "select" || !onPillarMove) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    onPillarSelect?.(pillar.id);
    try { svg.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
    const nextState = { pointerId: event.pointerId, pillarId: pillar.id };
    pillarMoveStateRef.current = nextState;
    onIndustrialVectorEditStart?.();
    setPillarMoveState(nextState);
  }

  function movePillar(event: React.PointerEvent<SVGSVGElement>) {
    const current = pillarMoveStateRef.current;
    if (!current || current.pointerId !== event.pointerId || !onPillarMove) return;
    event.preventDefault();
    event.stopPropagation();
    onPillarMove(current.pillarId, modelToIndustrial(getPlanPoint(event)));
  }

  function endPillarMove(event: React.PointerEvent<SVGSVGElement>) {
    const current = pillarMoveStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* opcionális */ }
    pillarMoveStateRef.current = null;
    setPillarMoveState(null);
    onIndustrialVectorEditEnd?.();
  }

  function beginIndustrialBackgroundMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!industrialMode || industrialTool !== "transformBackground" || !industrialBackground || !onIndustrialBackgroundTransform) return false;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
    backgroundMoveStateRef.current = {
      pointerId: event.pointerId,
      start: modelToIndustrial(getPlanPoint(event)),
      offsetXMeters: industrialBackground.offsetXMeters,
      offsetYMeters: industrialBackground.offsetYMeters,
    };
    onIndustrialVectorEditStart?.();
    return true;
  }

  function moveIndustrialBackground(event: React.PointerEvent<SVGSVGElement>) {
    const current = backgroundMoveStateRef.current;
    if (!current || current.pointerId !== event.pointerId || !onIndustrialBackgroundTransform) return;
    event.preventDefault();
    event.stopPropagation();
    const position = modelToIndustrial(getPlanPoint(event));
    onIndustrialBackgroundTransform({
      offsetXMeters: Number((current.offsetXMeters + position.xMeters - current.start.xMeters).toFixed(3)),
      offsetYMeters: Number((current.offsetYMeters + position.yMeters - current.start.yMeters).toFixed(3)),
    });
  }

  function endIndustrialBackgroundMove(event: React.PointerEvent<SVGSVGElement>) {
    const current = backgroundMoveStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* opcionális */ }
    backgroundMoveStateRef.current = null;
    onIndustrialVectorEditEnd?.();
  }

  function handlePlanPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (beginSectionDraw(event)) return;
    if (beginIndustrialBackgroundMove(event)) return;
    if (beginIndustrialDraw(event)) return;
    beginRoomDraw(event);
  }

  function handlePlanPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    moveSectionDraw(event);
    moveRoomDraw(event);
    moveRoomOnPlan(event);
    moveOpeningOnPlan(event);
    moveIndustrialDraw(event);
    movePillar(event);
    moveVectorPoint(event);
    moveIndustrialBackground(event);
  }

  function handlePlanPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    endSectionDraw(event);
    endRoomDraw(event);
    endRoomMoveOnPlan(event);
    endOpeningMove(event);
    endIndustrialDraw(event);
    endPillarMove(event);
    endVectorPointMove(event);
    endIndustrialBackgroundMove(event);
  }

  function handlePlanPointerCancel(event: React.PointerEvent<SVGSVGElement>) {
    sectionDrawStateRef.current = null;
    setSectionDrawState(null);
    roomDrawStateRef.current = null;
    setRoomDrawState(null);
    endRoomMoveOnPlan(event);
    endOpeningMove(event);
    endPillarMove(event);
    endVectorPointMove(event);
    endIndustrialBackgroundMove(event);
    setIndustrialDrawState(null);
  }

  function handlePlanClick(event: React.MouseEvent<SVGSVGElement>) {
    if (suppressIndustrialClickRef.current) { suppressIndustrialClickRef.current = false; return; }
    if (roomDrawingMode || sectionDrawingMode || wallSelectionMode || openingMoveState || industrialDrawState) return;
    if (industrialMode && industrialTool === "pillar" && onPillarPlace) {
      onPillarPlace(modelToIndustrial(getPlanPointFromSvg(event.currentTarget, event.clientX, event.clientY)));
      return;
    }
    if (industrialMode && industrialTool === "calibrateBackground" && onIndustrialBackgroundCalibrationPointAdd) {
      onIndustrialBackgroundCalibrationPointAdd(modelToIndustrial(getPlanPointFromSvg(event.currentTarget, event.clientX, event.clientY)));
      return;
    }
    if (!issuePlacementMode && !photoPlacementMode && !mechanicalPlacementMode) return;
    const display = getDisplayPoint(event.currentTarget, event.clientX, event.clientY);
    const model = displayToModel(display);
    const room = rooms.find((item) => model.x >= item.x && model.x <= item.x + item.width && model.y >= item.y && model.y <= item.y + item.depth);
    if (issuePlacementMode && onIssuePlace) {
      onIssuePlace({ xPercent: Number(clamp((model.x / 900) * 100, 2, 98).toFixed(3)), yPercent: Number(clamp((model.y / 610) * 100, 2, 98).toFixed(3)), roomId: room?.id || "" });
      return;
    }
    if (photoPlacementMode && onPhotoPlace) {
      onPhotoPlace({ xPercent: Number(clamp((model.x / 900) * 100, 2, 98).toFixed(3)), yPercent: Number(clamp((model.y / 610) * 100, 2, 98).toFixed(3)), roomId: room?.id || "" });
      return;
    }
    if (mechanicalPlacementMode && onMechanicalPlace && room) {
      onMechanicalPlace({ roomId: room.id, xRatio: clamp((model.x - room.x) / Math.max(1, room.width), 0.05, 0.95), yRatio: clamp((model.y - room.y) / Math.max(1, room.depth), 0.05, 0.95) });
    }
  }

  function getOpeningGeometry(opening: SurveyWallOpening) {
    const segment = wallSegments.find((item) => item.id === opening.wallSegmentId);
    const room = rooms.find((item) => item.id === opening.roomId);
    if (!segment || !room) return null;
    const geometry = getWallSegmentGeometry(room, segment);
    const dx = geometry.x2 - geometry.x1;
    const dy = geometry.y2 - geometry.y1;
    const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / length;
    const uy = dy / length;
    const centerRatio = clamp(opening.offsetRatio, 0, 1);
    const centerX = geometry.x1 + dx * centerRatio;
    const centerY = geometry.y1 + dy * centerRatio;
    const half = Math.min(length * 0.45, Math.max(8, opening.widthMeters * 60 / 2));
    return { x1: centerX - ux * half, y1: centerY - uy * half, x2: centerX + ux * half, y2: centerY + uy * half };
  }

  const thermalSegments = useMemo(() => getSurveyThermalBoundarySegments({
    rooms,
    wallSegments,
    settings: thermalBoundary,
  }), [rooms, thermalBoundary, wallSegments]);

  const overallDimensions = useMemo(() => {
    if (!rooms.length) return null;
    const x = Math.min(...rooms.map((room) => room.x));
    const y = Math.min(...rooms.map((room) => room.y));
    const maxX = Math.max(...rooms.map((room) => room.x + room.width));
    const maxY = Math.max(...rooms.map((room) => room.y + room.depth));
    return { x, y, maxX, maxY, widthMeters: (maxX - x) / 60, heightMeters: (maxY - y) / 60 };
  }, [rooms]);

  return (
    <section data-survey-focus-engine={focusMode ? "true" : "false"} data-survey-focus-layout={focusMode ? focusLayout : "normal"} className={focusMode ? "flex h-full min-h-0 flex-col overflow-hidden border-0 bg-[var(--survey-panel)] shadow-none" : "flex min-h-[670px] flex-col overflow-hidden rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] shadow-[0_20px_60px_rgba(15,23,42,0.10)] lg:min-h-[720px]"}>
      <header className={`flex flex-col gap-2 border-b border-[var(--survey-border)] bg-[var(--survey-panel-strong)] lg:flex-row lg:items-center lg:justify-between ${focusMode ? focusLayout === "split" ? "px-3 py-2" : "px-14 pb-2 pt-[62px] sm:px-16" : "px-4 py-3"}`}>
        <div className={focusMode ? focusLayout === "split" ? "hidden" : "hidden xl:block" : "block"}>
          <div className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--survey-accent)]">{industrialMode ? "DIMPRO épület- és csarnokfelmérő motor" : "DIMPRO közös alaprajzi motor"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black text-[var(--survey-text)]"><span>{levelName} · {rooms.length} helyiség · {totalArea.toFixed(1).replace(".", ",")} m²</span><span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[9px] uppercase text-cyan-800">{planSheet.paperSize} {planSheet.orientation === "landscape" ? "fekvő" : "álló"} · 1:{effectiveScale}</span></div>
          <div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">{industrialMode ? "Kalibrált SVG munkatér pillér-, repedés-, térbeton- és szabadkézi vektorréteggel." : "Lapra illesztett SVG munkatér, falszakasz- és nyílászáró-overlay réteggel."}</div>
        </div>
        <div className={`flex items-center gap-2 ${focusMode && focusLayout === "split" ? "w-full flex-nowrap justify-end overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : focusMode ? "flex-wrap justify-center lg:justify-end" : "flex-wrap"}`}>
          <button type="button" onClick={() => changeZoom(-0.12)} className="survey-tool-button" aria-label="Kicsinyítés"><Minus size={16} /></button>
          <button type="button" onClick={() => setZoom(1)} className="survey-tool-button min-w-16">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(0.12)} className="survey-tool-button" aria-label="Nagyítás"><Plus size={16} /></button>
          <button type="button" onClick={fitPlan} className="survey-tool-button"><Maximize2 size={16} /> <span>Teljes rajz</span></button>
          <button type="button" onClick={() => setShowGrid((current) => !current)} className={showGrid ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Grid3X3 size={16} /> <span>Rács</span></button>
          <button type="button" onClick={() => setShowDimensions((current) => !current)} className={showDimensions ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Ruler size={16} /> <span>Méretek</span></button>
          {thermalLayerAvailable ? <button type="button" onClick={() => setShowThermalLayer((current) => !current)} className={showThermalLayer ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><LocateFixed size={16} /> <span>Hőhatár</span></button> : null}
          {!focusMode ? <button type="button" onClick={() => onOrientationControlsOpenChange?.(!orientationControlsOpen)} className={orientationControlsOpen ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Compass size={16} /> <span>Tájolás</span></button> : null}
          <button type="button" onClick={() => setShowIssueMarkers((current) => !current)} className={showIssueMarkers ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><AlertTriangle size={16} /> <span>Hibák {issues.length}</span></button>
        </div>
      </header>

      <div
        ref={stageRef}
        data-survey-gesture-stage="true"
        data-survey-zoom={zoom.toFixed(3)}
        className={`relative min-h-0 flex-1 overflow-hidden bg-[var(--survey-canvas)] ${issuePlacementMode || photoPlacementMode || mechanicalPlacementMode || roomDrawingMode || sectionDrawingMode || (industrialMode && industrialTool !== "select") ? "cursor-crosshair" : wallSelectionMode ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${showGrid ? "survey-grid" : ""}`}
        style={{ touchAction: "none", overscrollBehavior: "contain", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDownCapture={beginStageTouchCapture}
        onPointerMoveCapture={moveStageTouchCapture}
        onPointerUpCapture={endStageTouchCapture}
        onPointerCancelCapture={endStageTouchCapture}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={(event) => { event.preventDefault(); if (Math.abs(event.deltaY) >= 1) changeZoom(event.deltaY > 0 ? -0.08 : 0.08); }}
      >
        <div className={`absolute inset-0 grid place-items-center ${focusMode ? "p-1 sm:p-2" : "p-3 sm:p-6"}`}>
          <div data-survey-view-transform="true" className={focusMode ? "relative max-w-none transition-transform duration-75" : "relative h-[500px] w-[760px] max-w-none transition-transform duration-75"} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center", ...(focusMode ? { width: focusLayout === "split" ? "min(95%, calc((100vh - 230px) * 1.52))" : "min(95%, calc((100vh - 190px) * 1.52))", aspectRatio: "1.52 / 1" } : {}) }}>
            <svg
              viewBox="0 0 900 610"
              data-survey-export-svg="true"
              className="h-full w-full touch-none overflow-visible drop-shadow-[0_18px_34px_rgba(15,23,42,0.18)]"
              style={{ touchAction: "none" }}
              role="img"
              aria-label="Energetikai felmérési alaprajz"
              onClick={handlePlanClick}
              onPointerDown={handlePlanPointerDown}
              onPointerMove={handlePlanPointerMove}
              onPointerUp={handlePlanPointerUp}
              onPointerCancel={handlePlanPointerCancel}
            >
              <defs>
                <linearGradient id="surveyPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--survey-paper-top)" /><stop offset="100%" stopColor="var(--survey-paper-bottom)" /></linearGradient>
                <filter id="roomShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.12" /></filter>
                <clipPath id="surveyPaperClip"><rect x={paperFrame.x + 1} y={paperFrame.y + 1} width={paperFrame.width - 2} height={paperFrame.height - 2} rx="11" /></clipPath>
                <pattern id="industrialRepairHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#fef3c7" fillOpacity="0.72" /><line x1="0" y1="0" x2="0" y2="12" stroke="#92400e" strokeWidth="4" /></pattern>
              </defs>

              <rect data-survey-paper-frame="true" data-paper-size={planSheet.paperSize} data-paper-orientation={planSheet.orientation} data-paper-scale={effectiveScale} x={paperFrame.x} y={paperFrame.y} width={paperFrame.width} height={paperFrame.height} rx="12" fill="url(#surveyPaper)" stroke="var(--survey-border)" strokeWidth="2" />
              <rect
                data-survey-sheet-frame="true"
                data-frame-inset-mm="5"
                x={paperFrame.x + paperFrame.frameInset}
                y={paperFrame.y + paperFrame.frameInset}
                width={paperFrame.width - paperFrame.frameInset * 2}
                height={paperFrame.height - paperFrame.frameInset * 2}
                fill="none"
                stroke="#14b8a6"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              <g
                data-survey-title-block="true"
                data-title-block-rows="2"
                data-title-block-width-mm="200"
                data-title-block-height-mm="34"
              >
                {(() => {
                  const block = paperFrame.titleBlock;
                  const topY = block.y;
                  const bottomY = block.y + block.rowHeight;
                  const topWidths = [block.width * 0.28, block.width * 0.25, block.width * 0.29, block.width * 0.18];
                  const bottomWidths = [block.width * 0.12, block.width * 0.21, block.width * 0.30, block.width * 0.12, block.width * 0.14, block.width * 0.11];
                  let topX = block.x;
                  let bottomX = block.x;
                  const topCells = [
                    ["PROJEKT NEVE", projectName, 28],
                    ["MEGRENDELŐ", clientName, 24],
                    ["FELMÉRÉS NEVE", surveyName, 28],
                    ["RAJZVERZIÓ", drawingRevision, 14],
                  ] as const;
                  const bottomCells = [
                    ["SZINT", levelName, 12],
                    ["FELMÉRÉS TÍPUSA", surveyType, 20],
                    ["HELYSZÍN", surveyLocation, 28],
                    ["DÁTUM", surveyDate, 12],
                    ["KÉSZÍTŐ", surveyCreator, 15],
                    ["LÉPTÉK", `M=1:${effectiveScale}`, 10],
                  ] as const;
                  return <>
                    {topCells.map(([label, value, maxCharacters], index) => {
                      const cell = <SurveySheetTitleCell key={label} x={topX} y={topY} width={topWidths[index]} height={block.rowHeight} label={label} value={value} pixelsPerMillimeter={paperFrame.pixelsPerMillimeter} maxCharacters={maxCharacters} />;
                      topX += topWidths[index];
                      return cell;
                    })}
                    {bottomCells.map(([label, value, maxCharacters], index) => {
                      const cell = <SurveySheetTitleCell key={label} x={bottomX} y={bottomY} width={bottomWidths[index]} height={block.rowHeight} label={label} value={value} pixelsPerMillimeter={paperFrame.pixelsPerMillimeter} maxCharacters={maxCharacters} />;
                      bottomX += bottomWidths[index];
                      return cell;
                    })}
                  </>;
                })()}
              </g>

              {paperFrame.planInfoBlock.visible ? (() => {
                const info = paperFrame.planInfoBlock;
                const legendWidth = info.width * 0.64;
                const summaryWidth = info.width - legendWidth;
                const padding = Math.max(4, paperFrame.pixelsPerMillimeter * 2);
                const headerSize = Math.max(4.2, paperFrame.pixelsPerMillimeter * 1.8);
                const itemSize = Math.max(4.1, paperFrame.pixelsPerMillimeter * 1.65);
                const legendItems = [
                  { label: "Külső fal", color: "#f97316", dash: undefined },
                  { label: "Belső fal", color: "#94a3b8", dash: undefined },
                  { label: "Fűtetlen határ", color: "#eab308", dash: "5 3" },
                  { label: "Nyílászáró", color: "#0ea5e9", dash: undefined },
                  { label: "Hőhatár", color: "#10b981", dash: "5 3" },
                  { label: "Metszetvonal", color: "#a21caf", dash: "5 3" },
                  { label: "Fotópont", color: "#2563eb", dash: "dot" },
                  { label: "Hibapont", color: "#dc2626", dash: "dot" },
                ] as const;
                const summaryRows = [
                  ["Fűtött", `${heatedArea.toFixed(1).replace(".", ",")} m²`],
                  ["Fűtetlen", `${unheatedArea.toFixed(1).replace(".", ",")} m²`],
                  ["Összesen", `${totalArea.toFixed(1).replace(".", ",")} m²`],
                  ["Helyiségek", `${rooms.length} db`],
                ] as const;
                return <g data-survey-plan-info-block="true">
                  <rect x={info.x} y={info.y} width={legendWidth} height={info.height} fill="#ffffff" fillOpacity="0.96" stroke="#14b8a6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <text x={info.x + padding} y={info.y + padding * 1.6} fill="#0f766e" fontSize={headerSize} fontWeight="950">JELMAGYARÁZAT</text>
                  {legendItems.map((item, index) => {
                    const column = index % 4;
                    const row = Math.floor(index / 4);
                    const cellWidth = (legendWidth - padding * 2) / 4;
                    const itemX = info.x + padding + column * cellWidth;
                    const itemY = info.y + info.height * (row === 0 ? 0.54 : 0.82);
                    return <g key={item.label} data-survey-legend-item={item.label}>
                      {item.dash === "dot" ? <circle cx={itemX + 5} cy={itemY - 2} r="3.6" fill={item.color} stroke="#ffffff" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : <line x1={itemX} y1={itemY - 2} x2={itemX + 12} y2={itemY - 2} stroke={item.color} strokeWidth="3.5" strokeDasharray={item.dash} vectorEffect="non-scaling-stroke" />}
                      <text x={itemX + 16} y={itemY} fill="#334155" fontSize={itemSize} fontWeight="800">{item.label}</text>
                    </g>;
                  })}
                  <rect x={info.x + legendWidth} y={info.y} width={summaryWidth} height={info.height} fill="#ffffff" fillOpacity="0.96" stroke="#14b8a6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <text x={info.x + legendWidth + padding} y={info.y + padding * 1.6} fill="#0f766e" fontSize={headerSize} fontWeight="950">ALAPTERÜLET-ÖSSZESÍTŐ · {levelName}</text>
                  {summaryRows.map(([label, value], index) => {
                    const column = index % 2;
                    const row = Math.floor(index / 2);
                    const cellWidth = (summaryWidth - padding * 2) / 2;
                    const cellX = info.x + legendWidth + padding + column * cellWidth;
                    const cellY = info.y + info.height * (row === 0 ? 0.55 : 0.84);
                    return <g key={label} data-survey-area-summary={label}>
                      <text x={cellX} y={cellY} fill="#64748b" fontSize={itemSize} fontWeight="800">{label}</text>
                      <text x={cellX + cellWidth - 4} y={cellY} textAnchor="end" fill="#0f172a" fontSize={itemSize + 0.5} fontWeight="950">{value}</text>
                    </g>;
                  })}
                </g>;
              })() : null}

              <SurveyNorthMark northAngle={northAngle} x={paperFrame.x + paperFrame.width - 48} y={paperFrame.y + 58} />

              {orientationControlsOpen ? surveyCompassDirections.map((direction) => {
                const screenAngle = normalizeAngle360(direction.azimuth + northAngle);
                const radians = screenAngle * Math.PI / 180;
                const left = paperFrame.x + paperFrame.width / 2 + Math.sin(radians) * (paperFrame.width / 2 - 14);
                const top = paperFrame.y + paperFrame.height / 2 - Math.cos(radians) * (paperFrame.height / 2 - 14);
                return <g key={direction.short} transform={`translate(${left} ${top})`} pointerEvents="none"><rect x="-17" y="-12" width="34" height="24" rx="6" fill={direction.short === "É" ? "#fff1f2" : "#ffffff"} stroke={direction.short === "É" ? "#ef4444" : "#94a3b8"} strokeWidth="1.5" /><text x="0" y="4" textAnchor="middle" fill={direction.short === "É" ? "#dc2626" : "#334155"} fontSize="10" fontWeight="900">{direction.short}</text></g>;
              }) : null}

              <g clipPath="url(#surveyPaperClip)"><g data-survey-model-transform="true" transform={`translate(${paperFrame.tx} ${paperFrame.ty}) scale(${paperFrame.fit})`}>
                {industrialMode && industrialBackground?.visible && industrialSettings ? (() => {
                  const offsetX = industrialBackground.offsetXMeters / industrialSettings.planWidthMeters * MODEL_BOUNDS.width;
                  const offsetY = industrialBackground.offsetYMeters / industrialSettings.planHeightMeters * MODEL_BOUNDS.height;
                  const centerX = MODEL_BOUNDS.x + MODEL_BOUNDS.width / 2;
                  const centerY = MODEL_BOUNDS.y + MODEL_BOUNDS.height / 2;
                  const scale = industrialBackground.scalePercent / 100;
                  const transform = `translate(${offsetX} ${offsetY}) translate(${centerX} ${centerY}) rotate(${industrialBackground.rotationDegrees}) scale(${scale}) translate(${-centerX} ${-centerY})`;
                  return <g data-industrial-background-transform="true" transform={transform} pointerEvents="none"><image data-industrial-background="true" data-background-page={industrialBackground.activePageIndex + 1} href={industrialBackground.dataUrl} x={MODEL_BOUNDS.x} y={MODEL_BOUNDS.y} width={MODEL_BOUNDS.width} height={MODEL_BOUNDS.height} preserveAspectRatio="none" opacity={industrialBackground.opacity} style={{ filter: industrialBackground.grayscale ? "grayscale(1)" : undefined }} /></g>;
                })() : null}
                {industrialMode && industrialBackground?.calibrationPoints?.length ? <g data-industrial-background-calibration="true" pointerEvents="none">{industrialBackground.calibrationPoints.map((point, index) => { const display = industrialToModel(point); return <g key={`cal-${index}`} transform={`translate(${display.x} ${display.y})`}><circle r="13" fill="#ffffff" stroke="#7c3aed" strokeWidth="4" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#5b21b6" fontSize="10" fontWeight="900">{index + 1}</text></g>; })}</g> : null}

                {industrialMode && industrialSettings?.showAxisGrid ? <g data-industrial-axis-grid="true" pointerEvents="none" opacity="0.55">
                  {Array.from({ length: Math.floor(industrialSettings.planWidthMeters / Math.max(0.1, industrialSettings.gridSpacingXMeters)) + 1 }, (_, index) => index * industrialSettings.gridSpacingXMeters).map((value) => { const point = industrialToModel({ xMeters: value, yMeters: 0 }); const bottom = industrialToModel({ xMeters: value, yMeters: industrialSettings.planHeightMeters }); return <g key={`gx-${value}`}><line x1={point.x} y1={point.y} x2={bottom.x} y2={bottom.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="7 7" vectorEffect="non-scaling-stroke" /><text x={point.x + 3} y={point.y + 13} fill="#64748b" fontSize="8" fontWeight="800">{value.toFixed(1)}</text></g>; })}
                  {Array.from({ length: Math.floor(industrialSettings.planHeightMeters / Math.max(0.1, industrialSettings.gridSpacingYMeters)) + 1 }, (_, index) => index * industrialSettings.gridSpacingYMeters).map((value) => { const point = industrialToModel({ xMeters: 0, yMeters: value }); const right = industrialToModel({ xMeters: industrialSettings.planWidthMeters, yMeters: value }); return <g key={`gy-${value}`}><line x1={point.x} y1={point.y} x2={right.x} y2={right.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="7 7" vectorEffect="non-scaling-stroke" /><text x={point.x + 3} y={point.y - 4} fill="#64748b" fontSize="8" fontWeight="800">{value.toFixed(1)}</text></g>; })}
                </g> : null}

                {thermalLayerAvailable && showThermalLayer && thermalSegments.length ? <g data-survey-thermal-boundary="true" pointerEvents="none">{thermalSegments.map((segment) => <g key={segment.id} data-survey-thermal-segment={segment.id}><line x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke="#059669" strokeWidth="8" strokeLinecap="round" opacity="0.28" vectorEffect="non-scaling-stroke" /><line x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke="#10b981" strokeWidth="3" strokeDasharray="12 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></g>)}</g> : null}

                {roomDrawState ? <rect x={Math.min(roomDrawState.startX, roomDrawState.currentX)} y={Math.min(roomDrawState.startY, roomDrawState.currentY)} width={Math.abs(roomDrawState.currentX - roomDrawState.startX)} height={Math.abs(roomDrawState.currentY - roomDrawState.startY)} fill="#cffafe" fillOpacity="0.72" stroke="#0891b2" strokeWidth="4" strokeDasharray="10 7" vectorEffect="non-scaling-stroke" /> : null}

                {sectionLines.map((line) => {
                  const active = line.id === activeSectionLineId;
                  const startLabel = line.serial.split("-")[0] || "A";
                  const endLabel = line.serial.split("-")[1] || startLabel;
                  const middleX = (line.x1 + line.x2) / 2;
                  const middleY = (line.y1 + line.y2) / 2;
                  return <g key={line.id} data-survey-section-line="true" data-survey-section-serial={line.serial} className={sectionDrawingMode ? "pointer-events-none" : "cursor-pointer"} onPointerDown={(event) => { if (sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { if (sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); onSectionLineSelect?.(line.id); }} role="button" aria-label={`${line.serial} metszetvonal`}>
                    <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={active ? "#7e22ce" : "#a21caf"} strokeWidth={active ? 6 : 4} strokeDasharray="14 8" vectorEffect="non-scaling-stroke" />
                    <circle cx={line.x1} cy={line.y1} r={active ? 15 : 12} fill="#ffffff" stroke={active ? "#7e22ce" : "#a21caf"} strokeWidth="4" vectorEffect="non-scaling-stroke" />
                    <circle cx={line.x2} cy={line.y2} r={active ? 15 : 12} fill="#ffffff" stroke={active ? "#7e22ce" : "#a21caf"} strokeWidth="4" vectorEffect="non-scaling-stroke" />
                    <text x={line.x1} y={line.y1 + 4} textAnchor="middle" fill="#581c87" fontSize="10" fontWeight="950">{startLabel}</text>
                    <text x={line.x2} y={line.y2 + 4} textAnchor="middle" fill="#581c87" fontSize="10" fontWeight="950">{endLabel}</text>
                    <g transform={`translate(${middleX} ${middleY - 18})`} pointerEvents="none"><rect x="-38" y="-11" width="76" height="22" rx="7" fill="#faf5ff" stroke="#a21caf" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#701a75" fontSize="9" fontWeight="950">{line.serial} METSZET</text></g>
                  </g>;
                })}
                {sectionDrawState ? <g data-survey-section-preview="true" pointerEvents="none"><line x1={sectionDrawState.startX} y1={sectionDrawState.startY} x2={sectionDrawState.currentX} y2={sectionDrawState.currentY} stroke="#7e22ce" strokeWidth="5" strokeDasharray="14 8" vectorEffect="non-scaling-stroke" /><circle cx={sectionDrawState.startX} cy={sectionDrawState.startY} r="13" fill="#ffffff" stroke="#7e22ce" strokeWidth="4" vectorEffect="non-scaling-stroke" /><circle cx={sectionDrawState.currentX} cy={sectionDrawState.currentY} r="13" fill="#ffffff" stroke="#7e22ce" strokeWidth="4" vectorEffect="non-scaling-stroke" /></g> : null}

                {rooms.map((room) => {
                  const selected = room.id === activeRoomId;
                  const moving = roomMoveState?.roomId === room.id;
                  const dimensions = resolveSurveyRoomDimensions(room);
                  const roomFill = room.heated ? (selected ? "#cffafe" : "#f8fafc") : (selected ? "#fde68a" : "#fef3c7");
                  return (
                    <g key={room.id} data-room-button="true" data-survey-room-id={room.id} data-room-x={room.x.toFixed(1)} data-room-y={room.y.toFixed(1)} onPointerDown={(event) => beginRoomMove(event, room)} className={issuePlacementMode || photoPlacementMode || mechanicalPlacementMode || roomDrawingMode || sectionDrawingMode ? "cursor-crosshair" : wallSelectionMode ? "cursor-default" : moving ? "cursor-grabbing" : "cursor-move"} filter={selected ? "url(#roomShadow)" : undefined} role="button" aria-label={`${room.name} helyiség. Kijelöléshez koppints, mozgatáshoz húzd.`}>
                      {room.polygon && room.polygon.length >= 3 ? <polygon points={room.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill={roomFill} stroke={selected ? "#0891b2" : "#334155"} strokeWidth={selected ? 4 : 2.5} vectorEffect="non-scaling-stroke" /> : <rect x={room.x} y={room.y} width={room.width} height={room.depth} fill={roomFill} stroke={selected ? "#0891b2" : "#334155"} strokeWidth={selected ? 4 : 2.5} vectorEffect="non-scaling-stroke" />}
                      <text x={room.x + room.width / 2} y={room.y + room.depth / 2 - 24} textAnchor="middle" fill="#0f172a" fontSize="19" fontWeight="900">{room.name}</text>
                      <text x={room.x + room.width / 2} y={room.y + room.depth / 2 + 1} textAnchor="middle" fill="#334155" fontSize="13" fontWeight="800">{dimensions.lengthMeters.toFixed(2).replace(".", ",")} × {dimensions.widthMeters.toFixed(2).replace(".", ",")} m</text>
                      <text x={room.x + room.width / 2} y={room.y + room.depth / 2 + 23} textAnchor="middle" fill="#475569" fontSize="13" fontWeight="700">{room.area.toFixed(1).replace(".", ",")} m² · {getRoomUsableHeight(room).toFixed(2).replace(".", ",")} m hasznos</text>
                      <text x={room.x + room.width / 2} y={room.y + room.depth / 2 + 44} textAnchor="middle" fill={room.heated ? "#047857" : "#b45309"} fontSize="11" fontWeight="900">{room.heated ? "FŰTÖTT TÉR" : "FŰTETLEN TÉR"}</text>
                      {selected && showDimensions ? <g pointerEvents="none" fill="#0f172a" stroke="#0891b2" strokeWidth="1.5" fontSize="12" fontWeight="900" vectorEffect="non-scaling-stroke"><line x1={room.x} y1={room.y - 18} x2={room.x + room.width} y2={room.y - 18} /><line x1={room.x} y1={room.y - 24} x2={room.x} y2={room.y - 12} /><line x1={room.x + room.width} y1={room.y - 24} x2={room.x + room.width} y2={room.y - 12} /><rect x={room.x + room.width / 2 - 38} y={room.y - 31} width="76" height="22" rx="6" fill="#ecfeff" stroke="#67e8f9" /><text x={room.x + room.width / 2} y={room.y - 16} textAnchor="middle" stroke="none">{dimensions.lengthMeters.toFixed(2).replace(".", ",")} m</text><line x1={room.x - 18} y1={room.y} x2={room.x - 18} y2={room.y + room.depth} /><line x1={room.x - 24} y1={room.y} x2={room.x - 12} y2={room.y} /><line x1={room.x - 24} y1={room.y + room.depth} x2={room.x - 12} y2={room.y + room.depth} /><g transform={`translate(${room.x - 18} ${room.y + room.depth / 2}) rotate(-90)`}><rect x="-38" y="-11" width="76" height="22" rx="6" fill="#ecfeff" stroke="#67e8f9" /><text x="0" y="4" textAnchor="middle" stroke="none">{dimensions.widthMeters.toFixed(2).replace(".", ",")} m</text></g></g> : null}
                    </g>
                  );
                })}

                {industrialBuildingContours.map((contour) => {
                  const points = contour.points.map(industrialToModel);
                  if (points.length < 3) return null;
                  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
                  const active = contour.id === activeIndustrialBuildingContourId;
                  const middle = points[Math.floor(points.length / 2)];
                  return <g key={contour.id} data-industrial-building-contour="true" className={industrialTool === "select" ? "cursor-pointer" : "cursor-crosshair"} onPointerDown={(event) => { if (industrialTool !== "select" || sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { if (industrialTool !== "select" || sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); onIndustrialBuildingContourSelect?.(contour.id); }} role="button" aria-label={`${contour.serial} épületkontúr`}><polygon points={pointString} fill={active ? "#cffafe" : "#ffffff"} fillOpacity={active ? 0.2 : 0.08} stroke={active ? "#0891b2" : "#0f172a"} strokeWidth={active ? 6 : 4} vectorEffect="non-scaling-stroke" /><text x={middle.x + 8} y={middle.y - 8} fill={active ? "#0e7490" : "#0f172a"} fontSize="11" fontWeight="900">{contour.title}</text></g>;
                })}

                {industrialMarkups.map((markup) => {
                  const points = markup.points.map(industrialToModel);
                  if (!points.length) return null;
                  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
                  const active = markup.id === activeIndustrialMarkupId;
                  const middle = points[Math.floor(points.length / 2)];
                  if (markup.kind === "repairArea") return <g key={markup.id} data-industrial-markup="true" data-industrial-kind={markup.kind} className={industrialTool === "select" ? "cursor-pointer" : "cursor-crosshair"} onPointerDown={(event) => { if (industrialTool !== "select" || sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { if (industrialTool !== "select" || sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); onIndustrialMarkupSelect?.(markup.id); }} role="button" aria-label={`${markup.serial} hibás térbetonfelület`}><polygon points={pointString} fill="url(#industrialRepairHatch)" stroke={active ? "#0891b2" : "#92400e"} strokeWidth={active ? 5 : 3} vectorEffect="non-scaling-stroke" /><g transform={`translate(${middle.x} ${middle.y})`}><rect x="-31" y="-12" width="62" height="24" rx="7" fill="#fff7ed" stroke={active ? "#0891b2" : "#92400e"} vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#7c2d12" fontSize="10" fontWeight="900">{markup.serial}</text></g></g>;
                  return <g key={markup.id} data-industrial-markup="true" data-industrial-kind={markup.kind} className={industrialTool === "select" ? "cursor-pointer" : "cursor-crosshair"} onPointerDown={(event) => { if (industrialTool !== "select" || sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { if (industrialTool !== "select" || sectionDrawingMode) return; event.preventDefault(); event.stopPropagation(); onIndustrialMarkupSelect?.(markup.id); }} role="button" aria-label={`${markup.serial} ${markup.kind === "crack" ? "repedés" : "szabadkézi jelölés"}`}><polyline points={pointString} fill="none" stroke={active ? "#0891b2" : markup.kind === "crack" ? "#dc2626" : "#2563eb"} strokeWidth={active ? 6 : markup.kind === "crack" ? 4 : 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /><text x={middle.x + 6} y={middle.y - 7} fill={markup.kind === "crack" ? "#b91c1c" : "#1d4ed8"} fontSize="9" fontWeight="900">{markup.serial}</text></g>;
                })}

                {industrialDrawState ? (() => { const points = industrialDrawState.points.map(industrialToModel); const pointString = points.map((point) => `${point.x},${point.y}`).join(" "); return industrialDrawState.kind === "repairArea" || industrialDrawState.kind === "buildingContour" ? <polygon data-industrial-drawing-preview="true" points={pointString} fill="url(#industrialRepairHatch)" stroke="#0891b2" strokeWidth="4" strokeDasharray="8 5" vectorEffect="non-scaling-stroke" /> : <polyline data-industrial-drawing-preview="true" points={pointString} fill="none" stroke={industrialDrawState.kind === "crack" ? "#dc2626" : "#2563eb"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />; })() : null}

                {pillars.map((pillar) => {
                  const point = industrialToModel({ xMeters: pillar.xMeters, yMeters: pillar.yMeters });
                  const selected = pillar.id === activePillarId;
                  const width = industrialSettings ? pillar.widthMeters / industrialSettings.planWidthMeters * MODEL_BOUNDS.width : 12;
                  const depth = industrialSettings ? pillar.depthMeters / industrialSettings.planHeightMeters * MODEL_BOUNDS.height : 12;
                  const radius = industrialSettings ? pillar.diameterMeters / industrialSettings.planWidthMeters * MODEL_BOUNDS.width / 2 : 6;
                  return <g key={pillar.id} data-industrial-pillar="true" className={industrialTool === "select" ? "cursor-move" : "cursor-crosshair"} transform={`translate(${point.x} ${point.y}) rotate(${pillar.rotationDegrees})`} onPointerDown={(event) => beginPillarMove(event, pillar)} onClick={(event) => { if (industrialTool !== "select") return; event.preventDefault(); event.stopPropagation(); onPillarSelect?.(pillar.id); }} role="button" aria-label={`${pillar.label} pillér`}><circle data-industrial-pillar-hit="true" r="24" fill="transparent" stroke="transparent" pointerEvents="all" />{pillar.shape === "circle" ? <circle r={Math.max(5, radius)} fill="#f8fafc" stroke={selected ? "#0891b2" : "#0f172a"} strokeWidth={selected ? 5 : 3} vectorEffect="non-scaling-stroke" /> : <rect x={-Math.max(5, width / 2)} y={-Math.max(5, depth / 2)} width={Math.max(10, width)} height={Math.max(10, depth)} fill="#f8fafc" stroke={selected ? "#0891b2" : "#0f172a"} strokeWidth={selected ? 5 : 3} vectorEffect="non-scaling-stroke" />}<line x1="-7" y1="0" x2="7" y2="0" stroke="#0f172a" strokeWidth="2" vectorEffect="non-scaling-stroke" /><line x1="0" y1="-7" x2="0" y2="7" stroke="#0f172a" strokeWidth="2" vectorEffect="non-scaling-stroke" /><text x="9" y="-8" fill="#0f172a" fontSize="9" fontWeight="900">{pillar.label}</text></g>;
                })}

                {industrialTool === "select" ? <g data-industrial-vector-handle-layer="true" pointerEvents={sectionDrawingMode ? "none" : undefined}>
                  {industrialBuildingContours.find((contour) => contour.id === activeIndustrialBuildingContourId)?.points.map((point, pointIndex) => {
                    const contourId = activeIndustrialBuildingContourId as string;
                    const display = industrialToModel(point);
                    return <g key={`top-building-${contourId}-${pointIndex}`} transform={`translate(${display.x} ${display.y})`}><circle data-industrial-vector-handle="building" data-entity-id={contourId} data-point-index={pointIndex} r="18" fill="transparent" stroke="transparent" pointerEvents="all" onPointerDown={(event) => beginVectorPointMove(event, "building", contourId, pointIndex)} /><circle r={pointIndex === activeIndustrialPointIndex ? 8 : 6} fill={pointIndex === activeIndustrialPointIndex ? "#fef08a" : "#ecfeff"} stroke={pointIndex === activeIndustrialPointIndex ? "#ca8a04" : "#0891b2"} strokeWidth="3" pointerEvents="none" vectorEffect="non-scaling-stroke" /></g>;
                  })}
                  {industrialMarkups.find((markup) => markup.id === activeIndustrialMarkupId)?.points.map((point, pointIndex) => {
                    const markupId = activeIndustrialMarkupId as string;
                    const display = industrialToModel(point);
                    return <g key={`top-markup-${markupId}-${pointIndex}`} transform={`translate(${display.x} ${display.y})`}><circle data-industrial-vector-handle="markup" data-entity-id={markupId} data-point-index={pointIndex} r="18" fill="transparent" stroke="transparent" pointerEvents="all" onPointerDown={(event) => beginVectorPointMove(event, "markup", markupId, pointIndex)} /><circle r={pointIndex === activeIndustrialPointIndex ? 8 : 6} fill={pointIndex === activeIndustrialPointIndex ? "#fef08a" : "#ecfeff"} stroke={pointIndex === activeIndustrialPointIndex ? "#ca8a04" : "#0891b2"} strokeWidth="3" pointerEvents="none" vectorEffect="non-scaling-stroke" /></g>;
                  })}
                </g> : null}

                {mechanicalDevices.map((device) => {
                  const room = rooms.find((item) => item.id === device.roomId);
                  if (!room) return null;
                  const x = room.x + room.width * device.xRatio;
                  const y = room.y + room.depth * device.yRatio;
                  const selected = device.id === activeMechanicalDeviceId;
                  const short = device.kind === "boiler" ? "K" : device.kind === "heatPump" ? "HSZ" : device.kind === "radiator" ? "R" : device.kind === "underfloorHeating" ? "PF" : device.kind === "airConditioner" ? "KL" : device.kind === "waterHeater" ? "HMV" : device.kind === "ventilation" ? "SZ" : device.kind === "solar" ? "N" : "G";
                  return <g key={device.id} data-mechanical-device="true" data-mechanical-kind={device.kind} transform={`translate(${x} ${y})`} className={mechanicalPlacementMode ? "cursor-crosshair" : "cursor-pointer"} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMechanicalSelect?.(device.id); }} role="button" aria-label={`${surveyMechanicalKindLabels[device.kind]} · ${device.name}`}>
                    <circle r={selected ? 23 : 19} fill={selected ? "#1d4ed8" : "#dbeafe"} stroke={selected ? "#f97316" : "#2563eb"} strokeWidth={selected ? 5 : 3} vectorEffect="non-scaling-stroke" />
                    <text x="0" y="4" textAnchor="middle" fill={selected ? "#ffffff" : "#1e3a8a"} fontSize={short.length > 2 ? 8 : 11} fontWeight="900">{short}</text>
                  </g>;
                })}

                {roomSnapGuides.length ? <g data-room-snap-guides="true" pointerEvents="none">
                  {roomSnapGuides.map((guide, index) => {
                    const middleX = (guide.x1 + guide.x2) / 2;
                    const middleY = (guide.y1 + guide.y2) / 2;
                    return <g key={`${guide.axis}-${guide.candidateRoomId}-${index}`}><line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} stroke="#10b981" strokeWidth="8" strokeLinecap="round" opacity="0.9" vectorEffect="non-scaling-stroke" /><line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} stroke="#ecfdf5" strokeWidth="2" strokeDasharray="8 5" vectorEffect="non-scaling-stroke" /><g transform={`translate(${middleX} ${middleY - 18})`}><rect x="-58" y="-12" width="116" height="24" rx="8" fill="#ecfdf5" stroke="#10b981" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#047857" fontSize="9" fontWeight="900">MÁGNESES ILLESZTÉS</text></g></g>;
                  })}
                </g> : null}

                {wallSegments.map((segment) => {
                  const room = rooms.find((item) => item.id === segment.roomId);
                  if (!room) return null;
                  const geometry = getWallSegmentGeometry(room, segment);
                  const selected = segment.id === activeWallSegmentId;
                  const orientation = getWallOrientationLabel(segment.side, northAngle);
                  const middleX = (geometry.x1 + geometry.x2) / 2;
                  const middleY = (geometry.y1 + geometry.y2) / 2;
                  const labelOffset = segment.side === "top" ? { x: 0, y: -18 } : segment.side === "right" ? { x: 34, y: 0 } : segment.side === "bottom" ? { x: 0, y: 22 } : { x: -34, y: 0 };
                  return <g key={segment.id} data-wall-segment="true" className={wallSelectionMode ? "cursor-pointer" : "pointer-events-none"} onPointerDown={(event) => { if (!wallSelectionMode) return; event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { if (!wallSelectionMode) return; event.preventDefault(); event.stopPropagation(); onRoomSelect(room.id); onWallSelect?.(segment.id); }} role="button" aria-label={`${room.name} · ${surveyWallBoundaryLabels[segment.boundaryType]} · ${geometry.lengthMeters.toFixed(2)} m · ${segment.thicknessCm} cm`}>
                    <line x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2} stroke="transparent" strokeWidth="20" vectorEffect="non-scaling-stroke" />
                    <line x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2} stroke={wallColor(segment, selected)} strokeWidth={selected ? Math.max(10, segment.thicknessCm * 0.6 + 4) : Math.max(4, segment.thicknessCm * 0.6)} strokeOpacity={segment.boundaryType === "internal" ? 0.62 : 0.95} strokeDasharray={segment.boundaryType === "unheated" ? "10 5" : segment.boundaryType === "adjacent" ? "4 4" : undefined} />
                    {showDimensions && segment.boundaryType === "external" && geometry.lengthMeters >= 0.2 ? <g data-external-wall-length-label={segment.id} pointerEvents="none" transform={`translate(${middleX + labelOffset.x} ${middleY + labelOffset.y})`}><rect x="-35" y="-10" width="70" height="20" rx="6" fill="#fff7ed" stroke="#f97316" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#9a3412" fontSize="9" fontWeight="900">{geometry.lengthMeters.toFixed(2).replace(".", ",")} m · {orientation.label}</text></g> : null}
                    {selected ? <g pointerEvents="none"><circle cx={geometry.x1} cy={geometry.y1} r="6" fill="#0891b2" vectorEffect="non-scaling-stroke" /><circle cx={geometry.x2} cy={geometry.y2} r="6" fill="#0891b2" vectorEffect="non-scaling-stroke" /><rect x={middleX - 42} y={middleY - 28} width="84" height="21" rx="6" fill="#ecfeff" stroke="#0891b2" vectorEffect="non-scaling-stroke" /><text x={middleX} y={middleY - 14} textAnchor="middle" fill="#155e75" fontSize="10" fontWeight="900">{geometry.lengthMeters.toFixed(2).replace(".", ",")} m · {segment.thicknessCm} cm</text></g> : null}
                  </g>;
                })}

                {wallOpenings.map((opening) => {
                  const geometry = getOpeningGeometry(opening);
                  if (!geometry) return null;
                  const selected = opening.id === activeOpeningId;
                  return <g key={opening.id} data-wall-opening="true" data-opening-offset-ratio={opening.offsetRatio.toFixed(4)} className={wallSelectionMode ? selected ? "cursor-grab active:cursor-grabbing" : "cursor-pointer" : "pointer-events-none"} onPointerDown={(event) => { if (!wallSelectionMode) return; if (selected) beginOpeningMove(event, opening); else { event.preventDefault(); event.stopPropagation(); } }} onClick={(event) => { if (!wallSelectionMode) return; event.preventDefault(); event.stopPropagation(); onOpeningSelect?.(opening.id); }} role="button" aria-label={`${surveyOpeningKindLabels[opening.kind]} · ${opening.widthMeters.toFixed(2)} × ${opening.heightMeters.toFixed(2)} m`}>
                    <line x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2} stroke="#ffffff" strokeWidth="14" vectorEffect="non-scaling-stroke" />
                    <line x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2} stroke={selected ? "#f97316" : opening.kind === "window" ? "#0ea5e9" : "#2563eb"} strokeWidth={selected ? 8 : opening.kind === "door" ? 7 : 5} vectorEffect="non-scaling-stroke" />
                    {selected ? <circle cx={(geometry.x1 + geometry.x2) / 2} cy={(geometry.y1 + geometry.y2) / 2} r="8" fill="#f97316" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
                  </g>;
                })}

                {showDimensions && overallDimensions ? <g fill="#475569" stroke="#64748b" strokeWidth="1.5" fontSize="13" fontWeight="800" pointerEvents="none" vectorEffect="non-scaling-stroke"><line x1={overallDimensions.x} y1={overallDimensions.y - 38} x2={overallDimensions.maxX} y2={overallDimensions.y - 38} /><line x1={overallDimensions.x} y1={overallDimensions.y - 45} x2={overallDimensions.x} y2={overallDimensions.y - 31} /><line x1={overallDimensions.maxX} y1={overallDimensions.y - 45} x2={overallDimensions.maxX} y2={overallDimensions.y - 31} /><rect x={(overallDimensions.x + overallDimensions.maxX) / 2 - 40} y={overallDimensions.y - 50} width="80" height="24" rx="6" fill="var(--survey-paper-top)" stroke="var(--survey-border)" /><text x={(overallDimensions.x + overallDimensions.maxX) / 2} y={overallDimensions.y - 34} textAnchor="middle" stroke="none">{overallDimensions.widthMeters.toFixed(2).replace(".", ",")} m</text><line x1={overallDimensions.x - 38} y1={overallDimensions.y} x2={overallDimensions.x - 38} y2={overallDimensions.maxY} /><g transform={`translate(${overallDimensions.x - 38} ${(overallDimensions.y + overallDimensions.maxY) / 2}) rotate(-90)`}><rect x="-40" y="-12" width="80" height="24" rx="6" fill="var(--survey-paper-top)" stroke="var(--survey-border)" /><text x="0" y="4" textAnchor="middle" stroke="none">{overallDimensions.heightMeters.toFixed(2).replace(".", ",")} m</text></g></g> : null}
              </g></g>
              {paperFrame.overflows ? <g pointerEvents="none"><rect x={paperFrame.x + 5} y={paperFrame.y + paperFrame.height - 30} width="210" height="22" rx="6" fill="#fff7ed" stroke="#f97316" /><text x={paperFrame.x + 110} y={paperFrame.y + paperFrame.height - 15} textAnchor="middle" fill="#9a3412" fontSize="10" fontWeight="900">A rajz túllóg a választott léptékben</text></g> : null}
            </svg>

            {photoPoints.length ? <div className="pointer-events-none absolute inset-0 z-20">{photoPoints.map((point) => {
              const roomName = rooms.find((room) => room.id === point.roomId)?.name;
              const marker = photoPointToPlanMarker(point, roomName);
              const modelX = marker.xPercent / 100 * 900;
              const modelY = marker.yPercent / 100 * 610;
              const display = modelToDisplay({ x: modelX, y: modelY });
              const svgCssScale = Math.min(760 / 900, 500 / 610);
              const svgCssOffsetX = (760 - 900 * svgCssScale) / 2;
              const svgCssOffsetY = (500 - 610 * svgCssScale) / 2;
              const xPercent = (svgCssOffsetX + display.x * svgCssScale) / 760 * 100;
              const yPercent = (svgCssOffsetY + display.y * svgCssScale) / 500 * 100;
              return <PlanHexMarker key={point.id} marker={{ ...marker, xPercent, yPercent }} zoom={zoom} sizeScale={0.58} selected={point.id === activePhotoPointId} onClick={() => onPhotoSelect?.(point.id)} />;
            })}</div> : null}

            {showIssueMarkers ? <div className="pointer-events-none absolute inset-0 z-20">{issues.map((issue) => {
              const roomName = rooms.find((room) => room.id === issue.roomId)?.name;
              const marker = propertySurveyIssueToPlanMarker(issue, roomName);
              const modelX = marker.xPercent / 100 * 900;
              const modelY = marker.yPercent / 100 * 610;
              const display = modelToDisplay({ x: modelX, y: modelY });
              const svgCssScale = Math.min(760 / 900, 500 / 610);
              const svgCssOffsetX = (760 - 900 * svgCssScale) / 2;
              const svgCssOffsetY = (500 - 610 * svgCssScale) / 2;
              const xPercent = (svgCssOffsetX + display.x * svgCssScale) / 760 * 100;
              const yPercent = (svgCssOffsetY + display.y * svgCssScale) / 500 * 100;
              return <PlanHexMarker key={issue.id} marker={{ ...marker, xPercent, yPercent }} zoom={zoom} sizeScale={0.52} selected={issue.id === activeIssueId} onClick={() => onIssueSelect?.(issue.id)} />;
            })}</div> : null}
          </div>
        </div>

        {rooms.length === 0 && !roomDrawingMode ? <div className="absolute inset-0 z-20 grid place-items-center p-6"><div className="max-w-md rounded-[1.75rem] border border-cyan-300 bg-white/95 p-6 text-center text-slate-950 shadow-2xl backdrop-blur"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-100 text-cyan-800"><PencilRuler size={27} /></span><div className="mt-4 text-xl font-black">Üres {levelName.toLowerCase()} alaprajz</div><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Nyomd meg a helyiségrajzolást, majd húzz egy téglalapot a lapra. Ezzel létrejön az első helyiség ezen a szinten.</p><button type="button" onClick={onRoomDrawingStart} className="survey-action-primary mt-4"><PencilRuler size={18} /> Első helyiség rajzolása</button></div></div> : null}

        {!roomDrawingMode && !issuePlacementMode && rooms.length && !wallSelectionMode ? <div className={`pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.05em] shadow-lg backdrop-blur ${roomSnapGuides.length ? "border border-emerald-400 bg-emerald-50/95 text-emerald-900" : "border border-slate-300 bg-white/90 text-slate-700"}`}><Move size={15} className={roomSnapGuides.length ? "text-emerald-700" : "text-cyan-700"} /> {roomSnapGuides.length ? "Mágneses illesztés aktív · falak pontosan összeérnek" : "Egy ujjal helyiségmozgatás · két ujjal nagyítás és pásztázás"}</div> : null}
        {wallSelectionMode ? <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-orange-300 bg-orange-50/95 px-3 py-2 text-[10px] font-black uppercase tracking-[0.05em] text-orange-900 shadow-lg backdrop-blur"><Scaling size={15} /> Falszakasz kijelölése aktív · kattints a falra vagy nyílászáróra</div> : null}
        {industrialMode && industrialTool !== "select" ? <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-indigo-950 shadow-xl"><PencilRuler size={20} className="shrink-0 text-indigo-700" /><div className="min-w-0 text-xs font-black leading-5">{industrialTool === "pillar" ? "Koppints a pillér helyére. A pillér kijelölés módban később húzható." : industrialTool === "buildingContour" ? "Tartsd lenyomva, és rajzold körbe az épület külső kontúrját." : industrialTool === "transformBackground" ? "Tartsd lenyomva és húzd a hátteret a kívánt helyre." : industrialTool === "calibrateBackground" ? `Kattints a háttéren az ismert ${industrialBackground?.calibrationDistanceMeters || 0} m-es szakasz két végpontjára.` : industrialTool === "repairArea" ? "Tartsd lenyomva, és rajzold körbe a hibás térbetonfelületet." : industrialTool === "crack" ? "Tartsd lenyomva, és rajzold végig a repedés vonalát." : "Tartsd lenyomva, és készíts szabadkézi vektoros jelölést."}</div></div> : null}
        {sectionDrawingMode ? <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-fuchsia-300 bg-fuchsia-50 px-4 py-3 text-fuchsia-950 shadow-xl"><Ruler size={20} className="shrink-0 text-fuchsia-700" /><div className="min-w-0 text-xs font-black leading-5">Tartsd lenyomva a rajzlapot, és húzd végig a metszetvonalat az épületen. Iránysegéd: {sectionDrawingConstraint === "horizontal" ? "vízszintes" : sectionDrawingConstraint === "vertical" ? "függőleges" : "szabad"}.</div><button type="button" onClick={() => { sectionDrawStateRef.current = null; setSectionDrawState(null); onSectionDrawingCancel?.(); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-fuchsia-300 bg-white text-fuchsia-800" aria-label="Metszetrajzolás megszakítása"><X size={16} /></button></div> : null}
        {roomDrawingMode ? <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-cyan-950 shadow-xl"><PencilRuler size={20} className="shrink-0 text-cyan-700" /><div className="min-w-0 text-xs font-black leading-5">Érintsd meg a lapot, és húzd ki a helyiség téglalapját.</div><button type="button" onClick={() => { roomDrawStateRef.current = null; setRoomDrawState(null); onRoomDrawingCancel?.(); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300 bg-white text-cyan-800" aria-label="Helyiségrajzolás megszakítása"><X size={16} /></button></div> : null}
        {photoPlacementMode ? <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-cyan-950 shadow-xl"><Camera size={20} className="shrink-0 text-cyan-700" /><div className="min-w-0 text-xs font-black leading-5">{photoPlacementMode === "create" ? "Koppints oda, ahonnan a fotó készül." : "Koppints a fotópont új helyére."}</div><button type="button" onClick={onPhotoPlacementCancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300 bg-white text-cyan-800" aria-label="Fotópont elhelyezés megszakítása"><X size={16} /></button></div> : null}
        {mechanicalPlacementMode ? <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3 text-blue-950 shadow-xl"><Fan size={20} className="shrink-0 text-blue-700" /><div className="min-w-0 text-xs font-black leading-5">{mechanicalPlacementMode === "create" ? "Koppints a berendezés helyére egy helyiségen belül." : "Koppints a berendezés új helyére."}</div><button type="button" onClick={onMechanicalPlacementCancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-blue-300 bg-white text-blue-800" aria-label="Gépészeti elhelyezés megszakítása"><X size={16} /></button></div> : null}
        {issuePlacementMode ? <div className="absolute left-1/2 top-4 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-xl"><AlertTriangle size={20} className="shrink-0 text-amber-600" /><div className="min-w-0 text-xs font-black leading-5">{issuePlacementMode === "create" ? "Koppints az alaprajzon az új hiba pontos helyére." : "Koppints az alaprajzon a hibapont új helyére."}</div><button type="button" onClick={onIssuePlacementCancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber-300 bg-white text-amber-800" aria-label="Hibapont elhelyezés megszakítása"><X size={16} /></button></div> : null}

        {orientationControlsOpen ? <div data-survey-orientation-summary="true" className="absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)]/95 px-3 py-2 shadow-lg backdrop-blur"><Compass size={17} className="text-red-500" /><div><div className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--survey-muted)]">Tájolás</div><div className="text-xs font-black text-[var(--survey-text)]">É {northAngle > 0 ? "+" : ""}{northAngle}° · teteje {topEdgeDirection.short}</div></div><button type="button" onClick={() => onNorthAngleChange(0)} className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-accent)]" aria-label="Lap teteje északra"><RotateCcw size={13} /></button></div> : null}
        {activeWall ? <div className="absolute right-3 top-3 max-w-[260px] rounded-xl border border-orange-300 bg-orange-50/95 px-3 py-2 text-[10px] font-bold text-orange-950 shadow-lg backdrop-blur"><div className="flex items-center gap-2 font-black uppercase"><Scaling size={14} /> Aktív falszakasz</div><div className="mt-1">{surveyWallBoundaryLabels[activeWall.boundaryType]} · {activeWall.thicknessCm} cm</div></div> : null}
      </div>

      {orientationControlsOpen ? focusMode ? <div data-survey-orientation-panel="focus" className="survey-no-print absolute bottom-[92px] left-1/2 z-40 w-[min(720px,calc(100%-120px))] -translate-x-1/2 rounded-2xl border border-cyan-300 bg-[var(--survey-panel)]/95 p-3 shadow-2xl backdrop-blur"><div className="mb-2 flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--survey-accent)]">Tájolás beállítása</div><div className="text-sm font-black text-[var(--survey-text)]">Lap felső oldala: {topEdgeDirection.short} · {Math.round(topEdgeAzimuth)}°</div></div><button type="button" onClick={() => onOrientationControlsOpenChange?.(false)} className="survey-icon-button"><X size={15} /></button></div><div className="grid grid-cols-8 gap-1">{surveyCompassDirections.map((direction) => { const targetNorthAngle = normalizeSignedAngle(-direction.azimuth); const active = getAngularDistance(northAngle, targetNorthAngle) <= 1; return <button key={direction.short} type="button" onClick={() => onNorthAngleChange(targetNorthAngle)} className={`min-h-10 rounded-lg border px-1 text-[10px] font-black ${active ? "border-cyan-500 bg-cyan-100 text-cyan-900" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}>{direction.short}</button>; })}</div><div className="mt-3 flex items-center gap-3"><input type="range" min="-180" max="180" step="1" value={northAngle} onChange={(event) => onNorthAngleChange(Number(event.target.value))} className="min-w-0 flex-1 accent-cyan-600" aria-label="Északi tájolás finomhangolási szöge" /><span className="min-w-14 text-right text-xs font-black">{northAngle > 0 ? "+" : ""}{northAngle}°</span></div></div> : <footer data-survey-orientation-panel="normal" className="border-t border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-2 sm:px-4"><div className="flex flex-col gap-2 xl:flex-row xl:items-center"><div className="flex shrink-0 items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.10em] text-[var(--survey-muted)]">Lap felső oldala</div><div className="text-sm font-black text-[var(--survey-text)]">{topEdgeDirection.short} · {Math.round(topEdgeAzimuth)}°</div></div><button type="button" onClick={() => onOrientationControlsOpenChange?.(false)} className="survey-icon-button"><X size={15} /></button></div><div className="grid min-w-0 flex-1 grid-cols-8 gap-1">{surveyCompassDirections.map((direction) => { const targetNorthAngle = normalizeSignedAngle(-direction.azimuth); const active = getAngularDistance(northAngle, targetNorthAngle) <= 1; return <button key={direction.short} type="button" onClick={() => onNorthAngleChange(targetNorthAngle)} className={`min-h-8 rounded-lg border px-1 text-[10px] font-black ${active ? "border-cyan-500 bg-cyan-100 text-cyan-900" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-text)]"}`}>{direction.short}</button>; })}</div><div className="flex min-w-[240px] items-center gap-3"><input type="range" min="-180" max="180" step="1" value={northAngle} onChange={(event) => onNorthAngleChange(Number(event.target.value))} className="min-w-0 flex-1 accent-cyan-600" /><span className="min-w-14 text-right text-xs font-black">{northAngle > 0 ? "+" : ""}{northAngle}°</span></div></div></footer> : null}
    </section>
  );
}
