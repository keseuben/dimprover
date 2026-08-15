"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Contrast,
  Check,
  ClipboardList,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Layers3,
  Loader2,
  Maximize2,
  Move,
  Plus,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Scan,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  analyzeSharedPdfPage,
  loadSharedPdfDocument,
  loadSharedPdfJs,
  renderSharedPdfPage,
  type SharedPdfDocument,
} from "@/components/viewers/pdfDocumentEngine";
import { buildDriveAutoAlignmentPairProposals, type DriveAutoAlignmentSource } from "./driveAutoAlignment";
import type { DriveDocument } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type CompareMode = "SIDE_BY_SIDE" | "OVERLAY" | "DIFFERENCE";
type PreviewKind = "PDF" | "IMAGE" | "UNSUPPORTED";
type Side = "left" | "right";
type PointAlignmentMode = 2 | 3 | null;
type PointSide = "A" | "B";
type AlignmentPoint = { x: number; y: number };
type AlignmentPick = { side: PointSide; pairIndex: number; point: AlignmentPoint };
type SimilarityAlignment = { offsetX: number; offsetY: number; scalePercent: number; rotationDegrees: number; rmsError: number };
type AutoAlignmentPairMeta = {
  key: string;
  weight: number;
  manual: boolean;
};

type AutoAlignmentSuggestion = SimilarityAlignment & {
  pairCount: 2 | 3;
  picks: AlignmentPick[];
  pairMeta: AutoAlignmentPairMeta[];
  source: DriveAutoAlignmentSource;
  evidenceCount: number;
  confidenceScore: number;
  summary: string;
};

type VisualDifferenceZone = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  mismatchPixels: number;
  inkPixels: number;
};

type AutoCandidateVisualQuality = {
  score: number;
  matchedA: number;
  matchedB: number;
  inkPixelsA: number;
  inkPixelsB: number;
  zones: VisualDifferenceZone[];
};

type CompareFindingStatus = "REVIEW" | "ACCEPTED_DIFFERENCE" | "FIX_REQUIRED";
type CompareFindingPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type CompareFindingLink = {
  id: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  relationType: string;
  createdAt: string;
  createdBy: string;
};

type CompareFinding = {
  id: string;
  contextKey: string;
  zoneLabel: string;
  sourceZoneIndex: number;
  status: CompareFindingStatus;
  priority: CompareFindingPriority;
  note: string;
  assigneeUserId: string | null;
  assigneeName: string;
  dueAt: string | null;
  version: number;
  createdByName: string;
  updatedByName: string;
  links: CompareFindingLink[];
  score: number;
  mismatchPixels: number;
  inkPixels: number;
  pageNumber: number;
  createdAt: string;
  updatedAt: string;
  zone: { x: number; y: number; width: number; height: number };
  left: { documentId: string; documentName: string; versionId: string; versionNumber: number | null; revisionCode: string };
  right: { documentId: string; documentName: string; versionId: string; versionNumber: number | null; revisionCode: string };
  alignment: {
    offsetX: number;
    offsetY: number;
    scalePercent: number;
    rotationDegrees: number;
    source: DriveAutoAlignmentSource;
    confidenceScore: number;
  };
};

type CompareFindingServer = {
  id: string;
  leftDocumentId: string;
  leftVersionId: string;
  rightDocumentId: string;
  rightVersionId: string;
  pageNumber: number;
  sourceZoneIndex: number;
  zoneLabel: string;
  zone: { x: number; y: number; width: number; height: number };
  score: number;
  mismatchPixels: number;
  inkPixels: number;
  alignment: { offsetX: number; offsetY: number; scalePercent: number; rotationDegrees: number; source: DriveAutoAlignmentSource; confidenceScore: number };
  status: CompareFindingStatus;
  priority: CompareFindingPriority;
  note: string;
  assigneeUserId: string | null;
  assigneeName: string;
  dueAt: string | null;
  version: number;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  links: CompareFindingLink[];
};

type ProjectMemberOption = {
  userId: string;
  displayName: string;
  role: string;
  status: string;
};

type AutoPairReplacement = {
  pairIndex: number;
  side: PointSide;
  aPoint?: AlignmentPoint;
};

type PreviewPayload = {
  url: string;
  mimeType: string;
  fileName: string;
  expiresAt: string;
  kind: "PDF" | "IMAGE";
};

type Props = {
  projectId: string;
  leftDocument: DriveDocument;
  rightDocument: DriveDocument;
};

const rasterExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);

const compareFindingStatusLabels: Record<CompareFindingStatus, string> = {
  REVIEW: "ELLENŐRIZENDŐ",
  ACCEPTED_DIFFERENCE: "ELFOGADOTT ELTÉRÉS",
  FIX_REQUIRED: "JAVÍTANDÓ",
};

const compareFindingPriorityLabels: Record<CompareFindingPriority, string> = {
  LOW: "Alacsony",
  MEDIUM: "Közepes",
  HIGH: "Magas",
  CRITICAL: "Kritikus",
};

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function triggerTextDownload(fileName: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function documentKind(document: DriveDocument): PreviewKind {
  const extension = (document.extension || "").toLowerCase();
  if (extension === "pdf" || document.mimeType === "application/pdf") return "PDF";
  if (rasterExtensions.has(extension) || /^image\/(jpeg|png|webp|gif|bmp|avif)$/i.test(document.mimeType || "")) return "IMAGE";
  return "UNSUPPORTED";
}

function clampZoom(value: number) {
  return Math.max(0.25, Math.min(5, Number(value.toFixed(2))));
}

function clampAlignmentOffset(value: number) {
  return Math.max(-500, Math.min(500, Math.round(value)));
}

function clampAlignmentScale(value: number) {
  return Math.max(70, Math.min(130, Number(value.toFixed(1))));
}

function normalizeAlignmentRotation(value: number) {
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return Number(normalized.toFixed(3));
}

function rotatePoint(point: AlignmentPoint, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function applySimilarityAlignment(
  point: AlignmentPoint,
  offsetX: number,
  offsetY: number,
  scalePercent: number,
  rotationDegrees: number,
) {
  const scale = scalePercent / 100;
  const rotated = rotatePoint({ x: point.x * scale, y: point.y * scale }, rotationDegrees);
  return { x: rotated.x + offsetX, y: rotated.y + offsetY };
}

function invertSimilarityAlignment(
  point: AlignmentPoint,
  offsetX: number,
  offsetY: number,
  scalePercent: number,
  rotationDegrees: number,
) {
  const scale = Math.max(0.0001, scalePercent / 100);
  const translated = { x: point.x - offsetX, y: point.y - offsetY };
  const unrotated = rotatePoint(translated, -rotationDegrees);
  return { x: unrotated.x / scale, y: unrotated.y / scale };
}

function solveSimilarityAlignment(picks: AlignmentPick[], pairCount: 2 | 3): SimilarityAlignment | null {
  const pairs = Array.from({ length: pairCount }, (_, pairIndex) => {
    const a = picks.find((pick) => pick.pairIndex === pairIndex && pick.side === "A")?.point;
    const b = picks.find((pick) => pick.pairIndex === pairIndex && pick.side === "B")?.point;
    return a && b ? { a, b } : null;
  }).filter((pair): pair is { a: AlignmentPoint; b: AlignmentPoint } => Boolean(pair));
  if (pairs.length !== pairCount) return null;

  const centroidA = {
    x: pairs.reduce((sum, pair) => sum + pair.a.x, 0) / pairs.length,
    y: pairs.reduce((sum, pair) => sum + pair.a.y, 0) / pairs.length,
  };
  const centroidB = {
    x: pairs.reduce((sum, pair) => sum + pair.b.x, 0) / pairs.length,
    y: pairs.reduce((sum, pair) => sum + pair.b.y, 0) / pairs.length,
  };

  let dot = 0;
  let cross = 0;
  let denominator = 0;
  for (const pair of pairs) {
    const bx = pair.b.x - centroidB.x;
    const by = pair.b.y - centroidB.y;
    const ax = pair.a.x - centroidA.x;
    const ay = pair.a.y - centroidA.y;
    dot += bx * ax + by * ay;
    cross += bx * ay - by * ax;
    denominator += bx * bx + by * by;
  }
  if (denominator < 25) return null;

  const scale = Math.hypot(dot, cross) / denominator;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const rotationDegrees = normalizeAlignmentRotation(Math.atan2(cross, dot) * 180 / Math.PI);
  const rotatedCentroidB = rotatePoint({ x: centroidB.x * scale, y: centroidB.y * scale }, rotationDegrees);
  const offsetX = centroidA.x - rotatedCentroidB.x;
  const offsetY = centroidA.y - rotatedCentroidB.y;

  const squaredError = pairs.reduce((sum, pair) => {
    const mapped = applySimilarityAlignment(pair.b, offsetX, offsetY, scale * 100, rotationDegrees);
    const dx = mapped.x - pair.a.x;
    const dy = mapped.y - pair.a.y;
    return sum + dx * dx + dy * dy;
  }, 0);

  return {
    offsetX: Number(offsetX.toFixed(2)),
    offsetY: Number(offsetY.toFixed(2)),
    scalePercent: Number((scale * 100).toFixed(3)),
    rotationDegrees,
    rmsError: Number(Math.sqrt(squaredError / pairs.length).toFixed(2)),
  };
}

function autoAlignmentSourceLabel(source: DriveAutoAlignmentSource) {
  if (source === "TEXT_LABELS") return "azonos tervfeliratok";
  if (source === "GEOMETRIC_NODES") return "geometriai csomópontok";
  if (source === "VECTOR_SEGMENTS") return "nyitott CAD/PDF vektorvonalak";
  return "vektoros kontúrok";
}

function autoPairFeatureLabel(key: string) {
  const normalized = key.toLocaleLowerCase("hu-HU");
  if (normalized.includes("metszes") || normalized.includes("intersection")) return "Metszéspont";
  if (normalized.includes("sarok") || normalized.includes("corner")) return "Sarok";
  if (normalized.includes("kontur") || normalized.includes("contour")) return "Kontúr";
  if (normalized.includes("szegmens") || normalized.includes("segment")) return "Vektorvonal";
  return "Felirat";
}

function visualQualityLabel(score: number) {
  if (score >= 85) return "Erős fedés";
  if (score >= 70) return "Jó fedés";
  if (score >= 50) return "Közepes";
  return "Gyenge fedés";
}

function makeInkMask(image: ImageData, threshold = 218) {
  const mask = new Uint8Array(image.width * image.height);
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const alpha = image.data[offset + 3];
    if (alpha < 24) continue;
    const luminance = image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722;
    if (luminance <= threshold) {
      mask[index] = 1;
      count += 1;
    }
  }
  return { mask, count };
}

function dilateInkMask(mask: Uint8Array, width: number, height: number, radius = 1) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          output[yy * width + xx] = 1;
        }
      }
    }
  }
  return output;
}

function computeVisualAlignmentQuality(leftImage: ImageData, rightImage: ImageData): AutoCandidateVisualQuality | null {
  if (leftImage.width !== rightImage.width || leftImage.height !== rightImage.height) return null;
  const left = makeInkMask(leftImage);
  const right = makeInkMask(rightImage);
  if (left.count < 24 || right.count < 24) return null;
  const leftDilated = dilateInkMask(left.mask, leftImage.width, leftImage.height, 1);
  const rightDilated = dilateInkMask(right.mask, rightImage.width, rightImage.height, 1);
  let matchedA = 0;
  let matchedB = 0;
  for (let index = 0; index < left.mask.length; index += 1) {
    if (left.mask[index] && rightDilated[index]) matchedA += 1;
    if (right.mask[index] && leftDilated[index]) matchedB += 1;
  }
  const recallA = matchedA / left.count;
  const recallB = matchedB / right.count;
  const harmonic = recallA + recallB > 0 ? (2 * recallA * recallB) / (recallA + recallB) : 0;
  const gridColumns = 8;
  const gridRows = 5;
  const zones: VisualDifferenceZone[] = [];
  for (let row = 0; row < gridRows; row += 1) {
    for (let column = 0; column < gridColumns; column += 1) {
      const x0 = Math.floor(column * leftImage.width / gridColumns);
      const x1 = Math.floor((column + 1) * leftImage.width / gridColumns);
      const y0 = Math.floor(row * leftImage.height / gridRows);
      const y1 = Math.floor((row + 1) * leftImage.height / gridRows);
      let inkPixels = 0;
      let mismatchPixels = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = y * leftImage.width + x;
          const hasA = Boolean(left.mask[index]);
          const hasB = Boolean(right.mask[index]);
          if (!hasA && !hasB) continue;
          inkPixels += 1;
          if ((hasA && !rightDilated[index]) || (hasB && !leftDilated[index])) mismatchPixels += 1;
        }
      }
      if (inkPixels < 5) continue;
      const zoneScore = Math.round((mismatchPixels / inkPixels) * 100);
      if (zoneScore < 8) continue;
      zones.push({ x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), score: zoneScore, mismatchPixels, inkPixels });
    }
  }
  zones.sort((a, b) => b.score - a.score || b.mismatchPixels - a.mismatchPixels || b.inkPixels - a.inkPixels);
  return {
    score: Math.max(0, Math.min(100, Math.round(harmonic * 100))),
    matchedA: Number((recallA * 100).toFixed(1)),
    matchedB: Number((recallB * 100).toFixed(1)),
    inkPixelsA: left.count,
    inkPixelsB: right.count,
    zones: zones.slice(0, 5),
  };
}

function shortRevision(document: DriveDocument) {
  return document.currentVersion?.revisionCode || `V${document.currentVersionNumber || 0}`;
}

type AutoCandidateVisualPreviewProps = {
  candidate: AutoAlignmentSuggestion;
  index: number;
  leftCanvasRef: RefObject<HTMLCanvasElement | null>;
  rightCanvasRef: RefObject<HTMLCanvasElement | null>;
  onQuality: (index: number, quality: AutoCandidateVisualQuality | null) => void;
};

function AutoCandidateVisualPreview({ candidate, index, leftCanvasRef, rightCanvasRef, onQuality }: AutoCandidateVisualPreviewProps) {
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const target = previewRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!target || !leftCanvas?.width || !leftCanvas?.height || !rightCanvas?.width || !rightCanvas?.height) return;
    const context = target.getContext("2d");
    if (!context) return;

    const width = target.width;
    const height = target.height;
    const sourceWidth = Math.max(leftCanvas.width, rightCanvas.width);
    const sourceHeight = Math.max(leftCanvas.height, rightCanvas.height);
    const fitScale = Math.min(width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight));
    const originX = (width - sourceWidth * fitScale) / 2;
    const originY = (height - sourceHeight * fitScale) / 2;

    const leftLayer = document.createElement("canvas");
    const rightLayer = document.createElement("canvas");
    leftLayer.width = width;
    leftLayer.height = height;
    rightLayer.width = width;
    rightLayer.height = height;
    const leftLayerContext = leftLayer.getContext("2d", { willReadFrequently: true });
    const rightLayerContext = rightLayer.getContext("2d", { willReadFrequently: true });
    if (!leftLayerContext || !rightLayerContext) return;

    const clipAndTransform = (layerContext: CanvasRenderingContext2D) => {
      layerContext.clearRect(0, 0, width, height);
      layerContext.save();
      layerContext.beginPath();
      layerContext.rect(originX, originY, sourceWidth * fitScale, sourceHeight * fitScale);
      layerContext.clip();
      layerContext.setTransform(fitScale, 0, 0, fitScale, originX, originY);
    };

    clipAndTransform(leftLayerContext);
    leftLayerContext.drawImage(leftCanvas, 0, 0);
    leftLayerContext.restore();

    clipAndTransform(rightLayerContext);
    rightLayerContext.translate(candidate.offsetX, candidate.offsetY);
    rightLayerContext.rotate(candidate.rotationDegrees * Math.PI / 180);
    const candidateScale = candidate.scalePercent / 100;
    rightLayerContext.scale(candidateScale, candidateScale);
    rightLayerContext.drawImage(rightCanvas, 0, 0);
    rightLayerContext.restore();

    const rawQuality = computeVisualAlignmentQuality(
      leftLayerContext.getImageData(0, 0, width, height),
      rightLayerContext.getImageData(0, 0, width, height),
    );
    const mappedQuality = rawQuality ? {
      ...rawQuality,
      zones: rawQuality.zones.map((zone) => {
        const x = Math.max(0, Math.min(sourceWidth, (zone.x - originX) / Math.max(0.0001, fitScale)));
        const y = Math.max(0, Math.min(sourceHeight, (zone.y - originY) / Math.max(0.0001, fitScale)));
        const zoneWidth = Math.max(1, Math.min(sourceWidth - x, zone.width / Math.max(0.0001, fitScale)));
        const zoneHeight = Math.max(1, Math.min(sourceHeight - y, zone.height / Math.max(0.0001, fitScale)));
        return { ...zone, x, y, width: zoneWidth, height: zoneHeight };
      }),
    } : null;
    onQuality(index, mappedQuality);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f5f8fa";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 0.92;
    context.drawImage(leftLayer, 0, 0);
    context.globalCompositeOperation = "multiply";
    context.globalAlpha = 0.46;
    context.drawImage(rightLayer, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    if (rawQuality?.zones.length) {
      rawQuality.zones.forEach((zone, zoneIndex) => {
        const alpha = Math.min(0.36, 0.10 + zone.score / 420);
        context.fillStyle = `rgba(220,76,55,${alpha.toFixed(3)})`;
        context.fillRect(zone.x, zone.y, zone.width, zone.height);
        context.strokeStyle = zoneIndex === 0 ? "rgba(178,50,35,.88)" : "rgba(199,74,56,.58)";
        context.lineWidth = zoneIndex === 0 ? 1.6 : 1;
        context.strokeRect(zone.x + 0.5, zone.y + 0.5, Math.max(0, zone.width - 1), Math.max(0, zone.height - 1));
      });
    }

    context.save();
    context.strokeStyle = "rgba(57,91,120,.28)";
    context.lineWidth = 1;
    context.strokeRect(originX + 0.5, originY + 0.5, Math.max(0, sourceWidth * fitScale - 1), Math.max(0, sourceHeight * fitScale - 1));
    context.restore();
  }, [candidate.offsetX, candidate.offsetY, candidate.rotationDegrees, candidate.scalePercent, index, leftCanvasRef, onQuality, rightCanvasRef]);

  return (
    <canvas
      ref={previewRef}
      width={228}
      height={132}
      className={styles.visualCompareAutoCandidatePreviewCanvas}
      aria-label={`Illesztési alternatíva ${index + 1} vizuális előnézete`}
      data-auto-candidate-preview={index + 1}
      data-preview-offset-x={candidate.offsetX}
      data-preview-offset-y={candidate.offsetY}
      data-preview-scale={candidate.scalePercent}
      data-preview-rotation={candidate.rotationDegrees}
    />
  );
}

type DifferenceZoneInspectorProps = {
  candidate: Pick<SimilarityAlignment, "offsetX" | "offsetY" | "scalePercent" | "rotationDegrees">;
  zone: VisualDifferenceZone;
  zoneIndex: number;
  leftCanvasRef: RefObject<HTMLCanvasElement | null>;
  rightCanvasRef: RefObject<HTMLCanvasElement | null>;
};

function DifferenceZoneInspector({ candidate, zone, zoneIndex, leftCanvasRef, rightCanvasRef }: DifferenceZoneInspectorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const target = canvasRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!target || !leftCanvas?.width || !rightCanvas?.width) return;
    const context = target.getContext("2d");
    if (!context) return;
    const paddingX = Math.max(zone.width * 1.4, leftCanvas.width * 0.04);
    const paddingY = Math.max(zone.height * 1.4, leftCanvas.height * 0.04);
    const cropX = Math.max(0, zone.x - paddingX);
    const cropY = Math.max(0, zone.y - paddingY);
    const cropRight = Math.min(Math.max(leftCanvas.width, rightCanvas.width), zone.x + zone.width + paddingX);
    const cropBottom = Math.min(Math.max(leftCanvas.height, rightCanvas.height), zone.y + zone.height + paddingY);
    const cropWidth = Math.max(1, cropRight - cropX);
    const cropHeight = Math.max(1, cropBottom - cropY);
    const scale = Math.min(target.width / cropWidth, target.height / cropHeight);
    const offsetX = (target.width - cropWidth * scale) / 2;
    const offsetY = (target.height - cropHeight * scale) / 2;
    context.clearRect(0, 0, target.width, target.height);
    context.fillStyle = "#f4f7f9";
    context.fillRect(0, 0, target.width, target.height);
    context.save();
    context.beginPath();
    context.rect(offsetX, offsetY, cropWidth * scale, cropHeight * scale);
    context.clip();
    context.setTransform(scale, 0, 0, scale, offsetX - cropX * scale, offsetY - cropY * scale);
    context.globalAlpha = 0.94;
    context.globalCompositeOperation = "source-over";
    context.drawImage(leftCanvas, 0, 0);
    context.translate(candidate.offsetX, candidate.offsetY);
    context.rotate(candidate.rotationDegrees * Math.PI / 180);
    const candidateScale = candidate.scalePercent / 100;
    context.scale(candidateScale, candidateScale);
    context.globalAlpha = 0.48;
    context.globalCompositeOperation = "multiply";
    context.drawImage(rightCanvas, 0, 0);
    context.restore();
    context.save();
    const zx = offsetX + (zone.x - cropX) * scale;
    const zy = offsetY + (zone.y - cropY) * scale;
    const zw = zone.width * scale;
    const zh = zone.height * scale;
    context.fillStyle = "rgba(220,76,55,.18)";
    context.strokeStyle = "rgba(184,54,38,.92)";
    context.lineWidth = 2;
    context.fillRect(zx, zy, zw, zh);
    context.strokeRect(zx + 1, zy + 1, Math.max(0, zw - 2), Math.max(0, zh - 2));
    context.restore();
  }, [candidate.offsetX, candidate.offsetY, candidate.rotationDegrees, candidate.scalePercent, leftCanvasRef, rightCanvasRef, zone.height, zone.width, zone.x, zone.y]);
  return <canvas ref={canvasRef} width={360} height={200} className={styles.visualCompareDifferenceInspectorCanvas} data-difference-inspector={zoneIndex + 1} aria-label={`Eltérési zóna ${zoneIndex + 1} nagyított előnézete`} />;
}

export default function DriveVisualCompareViewer({ projectId, leftDocument, rightDocument }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const alignmentDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const leftPdfRef = useRef<SharedPdfDocument | null>(null);
  const rightPdfRef = useRef<SharedPdfDocument | null>(null);
  const renderRunRef = useRef(0);

  const leftKind = useMemo(() => documentKind(leftDocument), [leftDocument]);
  const rightKind = useMemo(() => documentKind(rightDocument), [rightDocument]);
  const compatible = leftKind !== "UNSUPPORTED" && rightKind !== "UNSUPPORTED" && leftKind === rightKind;
  const compareFindingContextKey = `${projectId}:${leftDocument.id}:${leftDocument.currentVersion?.id || "none"}:${rightDocument.id}:${rightDocument.currentVersion?.id || "none"}`;

  const [mode, setMode] = useState<CompareMode>("SIDE_BY_SIDE");
  const [leftPreview, setLeftPreview] = useState<PreviewPayload | null>(null);
  const [rightPreview, setRightPreview] = useState<PreviewPayload | null>(null);
  const [leftPageCount, setLeftPageCount] = useState(0);
  const [rightPageCount, setRightPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [alignmentEnabled, setAlignmentEnabled] = useState(false);
  const [alignmentOffsetX, setAlignmentOffsetX] = useState(0);
  const [alignmentOffsetY, setAlignmentOffsetY] = useState(0);
  const [alignmentScale, setAlignmentScale] = useState(100);
  const [alignmentRotation, setAlignmentRotation] = useState(0);
  const [pointAlignmentMode, setPointAlignmentMode] = useState<PointAlignmentMode>(null);
  const [alignmentPicks, setAlignmentPicks] = useState<AlignmentPick[]>([]);
  const [alignmentRmsError, setAlignmentRmsError] = useState<number | null>(null);
  const [alignmentMessage, setAlignmentMessage] = useState("");
  const [autoAlignmentAnalyzing, setAutoAlignmentAnalyzing] = useState(false);
  const [autoAlignmentSuggestion, setAutoAlignmentSuggestion] = useState<AutoAlignmentSuggestion | null>(null);
  const [autoAlignmentCandidates, setAutoAlignmentCandidates] = useState<AutoAlignmentSuggestion[]>([]);
  const [autoAlignmentCandidateIndex, setAutoAlignmentCandidateIndex] = useState(0);
  const [autoCandidateVisualQuality, setAutoCandidateVisualQuality] = useState<Record<number, AutoCandidateVisualQuality | null>>({});
  const [differenceHeatmapEnabled, setDifferenceHeatmapEnabled] = useState(false);
  const [selectedDifferenceZoneIndex, setSelectedDifferenceZoneIndex] = useState(0);
  const [compareFindings, setCompareFindings] = useState<CompareFinding[]>([]);
  const [focusedCompareFindingId, setFocusedCompareFindingId] = useState<string | null>(null);
  const [compareFindingsMessage, setCompareFindingsMessage] = useState("");
  const [compareFindingsLoading, setCompareFindingsLoading] = useState(false);
  const [compareFindingsSavingId, setCompareFindingsSavingId] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberOption[]>([]);
  const [autoAlignmentError, setAutoAlignmentError] = useState("");
  const [autoPairReplacement, setAutoPairReplacement] = useState<AutoPairReplacement | null>(null);
  const [showBase, setShowBase] = useState(true);
  const [showRevision, setShowRevision] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [stageWidth, setStageWidth] = useState(0);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });

  const sharedPageCount = leftKind === "PDF" && rightKind === "PDF"
    ? Math.min(leftPageCount || 0, rightPageCount || 0)
    : 0;

  const mapServerCompareFinding = useCallback((finding: CompareFindingServer): CompareFinding => ({
    id: finding.id,
    contextKey: compareFindingContextKey,
    zoneLabel: finding.zoneLabel,
    sourceZoneIndex: finding.sourceZoneIndex,
    status: finding.status,
    priority: finding.priority,
    note: finding.note,
    assigneeUserId: finding.assigneeUserId,
    assigneeName: finding.assigneeName,
    dueAt: finding.dueAt,
    version: finding.version,
    createdByName: finding.createdByName,
    updatedByName: finding.updatedByName,
    links: finding.links || [],
    score: finding.score,
    mismatchPixels: finding.mismatchPixels,
    inkPixels: finding.inkPixels,
    pageNumber: finding.pageNumber,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
    zone: finding.zone,
    left: {
      documentId: finding.leftDocumentId,
      documentName: leftDocument.name,
      versionId: finding.leftVersionId,
      versionNumber: leftDocument.currentVersion?.versionNumber ?? null,
      revisionCode: leftDocument.currentVersion?.revisionCode || "",
    },
    right: {
      documentId: finding.rightDocumentId,
      documentName: rightDocument.name,
      versionId: finding.rightVersionId,
      versionNumber: rightDocument.currentVersion?.versionNumber ?? null,
      revisionCode: rightDocument.currentVersion?.revisionCode || "",
    },
    alignment: finding.alignment,
  }), [compareFindingContextKey, leftDocument.name, leftDocument.currentVersion?.versionNumber, leftDocument.currentVersion?.revisionCode, rightDocument.name, rightDocument.currentVersion?.versionNumber, rightDocument.currentVersion?.revisionCode]);

  const loadCompareFindings = useCallback(async () => {
    const leftVersionId = leftDocument.currentVersion?.id;
    const rightVersionId = rightDocument.currentVersion?.id;
    setFocusedCompareFindingId(null);
    if (!leftVersionId || !rightVersionId) {
      setCompareFindings([]);
      return;
    }
    setCompareFindingsLoading(true);
    try {
      const params = new URLSearchParams({ leftVersionId, rightVersionId });
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/compare-findings?${params.toString()}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; code?: string; findings?: CompareFindingServer[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az eltérési jegyzék nem tölthető be.");
      setCompareFindings((payload.findings || []).map(mapServerCompareFinding));
      setCompareFindingsMessage(payload.findings?.length ? `${payload.findings.length} tartós eltérési tétel betöltve.` : "Ehhez az A/B verziópárhoz még nincs mentett eltérési tétel.");
    } catch (caught) {
      setCompareFindings([]);
      setCompareFindingsMessage(caught instanceof Error ? caught.message : "Az eltérési jegyzék nem tölthető be.");
    } finally {
      setCompareFindingsLoading(false);
    }
  }, [projectId, leftDocument.currentVersion?.id, rightDocument.currentVersion?.id, mapServerCompareFinding]);

  useEffect(() => {
    setCompareFindings([]);
    setFocusedCompareFindingId(null);
    setCompareFindingsMessage("");
    void loadCompareFindings();
  }, [compareFindingContextKey, loadCompareFindings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memberships`, { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json() as { ok?: boolean; memberships?: ProjectMemberOption[] };
        if (!cancelled && response.ok && payload.ok) setProjectMembers((payload.memberships || []).filter((member) => member.status === "ACTIVE"));
      } catch {
        if (!cancelled) setProjectMembers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const fetchPreview = useCallback(async (side: Side, document: DriveDocument) => {
    const versionId = document.currentVersion?.id;
    if (!versionId || document.currentVersion?.status !== "AVAILABLE") {
      throw new Error(`${side === "left" ? "A" : "B"} dokumentum aktuális verziója nem előnézhető.`);
    }
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/preview`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    const payload = await response.json() as { ok?: boolean; error?: string; preview?: PreviewPayload };
    if (!response.ok || !payload.ok || !payload.preview?.url) {
      throw new Error(payload.error || `${side === "left" ? "A" : "B"} dokumentum előnézete nem tölthető be.`);
    }
    return payload.preview;
  }, [projectId]);

  const reload = useCallback(async () => {
    if (!compatible) {
      setLeftPreview(null);
      setRightPreview(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [left, right] = await Promise.all([
        fetchPreview("left", leftDocument),
        fetchPreview("right", rightDocument),
      ]);
      setLeftPreview(left);
      setRightPreview(right);
    } catch (caught) {
      setLeftPreview(null);
      setRightPreview(null);
      setError(caught instanceof Error ? caught.message : "A vizuális összehasonlítás előnézete nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [compatible, fetchPreview, leftDocument, rightDocument]);

  useEffect(() => {
    setMode("SIDE_BY_SIDE");
    setPageNumber(1);
    setZoom(1);
    setFitWidth(true);
    setRotation(0);
    setOverlayOpacity(50);
    setAlignmentEnabled(false);
    setAlignmentOffsetX(0);
    setAlignmentOffsetY(0);
    setAlignmentScale(100);
    setAlignmentRotation(0);
    setPointAlignmentMode(null);
    setAlignmentPicks([]);
    setAlignmentRmsError(null);
    setAlignmentMessage("");
    setAutoAlignmentAnalyzing(false);
    setAutoAlignmentSuggestion(null);
    setAutoAlignmentCandidates([]);
    setAutoAlignmentCandidateIndex(0);
    setAutoCandidateVisualQuality({});
    setDifferenceHeatmapEnabled(false);
    setSelectedDifferenceZoneIndex(0);
    setAutoAlignmentError("");
    setAutoPairReplacement(null);
    setShowBase(true);
    setShowRevision(true);
    setLeftPageCount(0);
    setRightPageCount(0);
    void reload();
  }, [leftDocument.id, reload, rightDocument.id]);

  useEffect(() => {
    setAutoAlignmentSuggestion(null);
    setAutoAlignmentCandidates([]);
    setAutoAlignmentCandidateIndex(0);
    setAutoCandidateVisualQuality({});
    setDifferenceHeatmapEnabled(false);
    setSelectedDifferenceZoneIndex(0);
    setAutoAlignmentError("");
    setAutoPairReplacement(null);
  }, [fitWidth, pageNumber, rotation, zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageWidth(stage.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const previousLeft = leftPdfRef.current;
    const previousRight = rightPdfRef.current;
    leftPdfRef.current = null;
    rightPdfRef.current = null;
    setLeftPageCount(0);
    setRightPageCount(0);

    if (leftKind !== "PDF" || rightKind !== "PDF" || !leftPreview?.url || !rightPreview?.url) {
      return () => undefined;
    }

    setLoading(true);
    setError("");
    Promise.all([
      loadSharedPdfDocument(leftPreview.url),
      loadSharedPdfDocument(rightPreview.url),
    ]).then(([leftPdf, rightPdf]) => {
      if (cancelled) {
        void leftPdf.destroy?.();
        void rightPdf.destroy?.();
        return;
      }
      void previousLeft?.destroy?.();
      void previousRight?.destroy?.();
      leftPdfRef.current = leftPdf;
      rightPdfRef.current = rightPdf;
      setLeftPageCount(leftPdf.numPages);
      setRightPageCount(rightPdf.numPages);
      setPageNumber((current) => Math.max(1, Math.min(current, Math.min(leftPdf.numPages, rightPdf.numPages))));
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? `PDF.js: ${caught.message}` : "A két PDF nem tölthető be összehasonlításhoz.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [leftKind, leftPreview?.url, rightKind, rightPreview?.url]);

  useEffect(() => () => {
    const left = leftPdfRef.current;
    const right = rightPdfRef.current;
    leftPdfRef.current = null;
    rightPdfRef.current = null;
    void left?.destroy?.();
    void right?.destroy?.();
  }, []);

  useEffect(() => {
    const leftPdf = leftPdfRef.current;
    const rightPdf = rightPdfRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (leftKind !== "PDF" || rightKind !== "PDF" || !leftPdf || !rightPdf || !leftCanvas || !rightCanvas || !sharedPageCount) return;

    const run = ++renderRunRef.current;
    setRendering(true);
    setError("");

    Promise.all([leftPdf.getPage(pageNumber), rightPdf.getPage(pageNumber)])
      .then(async ([leftPage, rightPage]) => {
        const paneWidth = mode === "SIDE_BY_SIDE"
          ? Math.max(260, (stageWidth - 26) / 2)
          : Math.max(360, stageWidth - 20);
        const renderOne = async (page: Awaited<ReturnType<SharedPdfDocument["getPage"]>>, canvas: HTMLCanvasElement) => {
          const base = page.getViewport({ scale: 1, rotation });
          const fitScale = clampZoom(paneWidth / Math.max(1, base.width));
          const scale = clampZoom((fitWidth ? fitScale : 1) * zoom);
          await renderSharedPdfPage({ page, canvas, scale, rotation, maximumPixelDimension: mode === "SIDE_BY_SIDE" ? 3000 : 3800 });
        };
        await Promise.all([renderOne(leftPage, leftCanvas), renderOne(rightPage, rightCanvas)]);
        if (run === renderRunRef.current) {
          setOverlaySize({
            width: Math.max(leftCanvas.width, rightCanvas.width),
            height: Math.max(leftCanvas.height, rightCanvas.height),
          });
        }
      })
      .catch((caught) => {
        if (run === renderRunRef.current) setError(caught instanceof Error ? `PDF render: ${caught.message}` : "A vizuális összehasonlítás renderelése sikertelen.");
      })
      .finally(() => {
        if (run === renderRunRef.current) setRendering(false);
      });
  }, [fitWidth, leftKind, mode, pageNumber, rightKind, rotation, sharedPageCount, stageWidth, zoom]);

  function changeZoom(delta: number) {
    setZoom((current) => clampZoom(current + delta));
  }

  function syncPaneScroll(source: HTMLDivElement, target: HTMLDivElement) {
    if (mode !== "SIDE_BY_SIDE" || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    const sourceMaxX = Math.max(1, source.scrollWidth - source.clientWidth);
    const sourceMaxY = Math.max(1, source.scrollHeight - source.clientHeight);
    const targetMaxX = Math.max(0, target.scrollWidth - target.clientWidth);
    const targetMaxY = Math.max(0, target.scrollHeight - target.clientHeight);
    target.scrollLeft = (source.scrollLeft / sourceMaxX) * targetMaxX;
    target.scrollTop = (source.scrollTop / sourceMaxY) * targetMaxY;
    requestAnimationFrame(() => { syncingScrollRef.current = false; });
  }

  function fit() {
    setFitWidth(true);
    setZoom(1);
  }

  function rotate() {
    setRotation((current) => (current + 90) % 360);
  }

  function resetAlignment() {
    setAlignmentOffsetX(0);
    setAlignmentOffsetY(0);
    setAlignmentScale(100);
    setAlignmentRotation(0);
    setAlignmentRmsError(null);
    setAlignmentMessage("Igazítás nullázva.");
  }

  const recordAutoCandidateVisualQuality = useCallback((index: number, quality: AutoCandidateVisualQuality | null) => {
    setAutoCandidateVisualQuality((current) => {
      const previous = current[index];
      if (previous?.score === quality?.score && previous?.matchedA === quality?.matchedA && previous?.matchedB === quality?.matchedB) return current;
      return { ...current, [index]: quality };
    });
  }, []);

  async function requestAutoAlignmentSuggestion() {
    if (!isPdf || mode === "SIDE_BY_SIDE" || rotation !== 0) {
      setAutoAlignmentError(rotation !== 0 ? "Az automatikus V1 illesztéshez állítsd vissza a közös forgatást 0°-ra." : "Automatikus illesztési javaslat PDF Átfedés/Különbség módban érhető el.");
      return;
    }
    const leftPdf = leftPdfRef.current;
    const rightPdf = rightPdfRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!leftPdf || !rightPdf || !leftCanvas?.width || !rightCanvas?.width) return;

    setAutoAlignmentAnalyzing(true);
    setAutoAlignmentError("");
    setAutoAlignmentSuggestion(null);
    setAutoAlignmentCandidates([]);
    setAutoAlignmentCandidateIndex(0);
    setAutoPairReplacement(null);
    try {
      const [pdfJs, leftPage, rightPage] = await Promise.all([
        loadSharedPdfJs(),
        leftPdf.getPage(pageNumber),
        rightPdf.getPage(pageNumber),
      ]);
      const [leftAnalysis, rightAnalysis] = await Promise.all([
        analyzeSharedPdfPage(pdfJs, leftPage),
        analyzeSharedPdfPage(pdfJs, rightPage),
      ]);
      const proposals = buildDriveAutoAlignmentPairProposals(leftAnalysis, rightAnalysis);
      if (!proposals.length) {
        const diagnostics = `A: ${leftAnalysis.contentKind}, ${leftAnalysis.textItemCount} szöveg, ${leftAnalysis.closedContourCount} kontúr, ${leftAnalysis.vectorSegments?.filter((segment) => segment.source === "openPath").length || 0} nyitott vektorvonal · B: ${rightAnalysis.contentKind}, ${rightAnalysis.textItemCount} szöveg, ${rightAnalysis.closedContourCount} kontúr, ${rightAnalysis.vectorSegments?.filter((segment) => segment.source === "openPath").length || 0} nyitott vektorvonal`;
        setAutoAlignmentError(`Nem találtam elég egyértelmű, egymástól távoli közös referencia-feature-t. ${diagnostics}. Használd a 2/3 pontos kézi illesztést.`);
        return;
      }

      const diagonal = Math.max(1, Math.hypot(leftCanvas.width, leftCanvas.height));
      const evaluated = proposals.flatMap((proposal) => {
        const pairCount = proposal.pairs.length >= 3 ? 3 : 2;
        const selectedPairs = proposal.pairs.slice(0, pairCount);
        if (selectedPairs.length < 2) return [];
        const picks: AlignmentPick[] = selectedPairs.flatMap((pair, pairIndex) => ([
          { side: "A" as const, pairIndex, point: { x: pair.a.x * leftCanvas.width, y: pair.a.y * leftCanvas.height } },
          { side: "B" as const, pairIndex, point: { x: pair.b.x * rightCanvas.width, y: pair.b.y * rightCanvas.height } },
        ]));
        const solved = solveSimilarityAlignment(picks, pairCount);
        if (!solved) return [];
        if (solved.scalePercent < 70 || solved.scalePercent > 130 || Math.abs(solved.offsetX) > 500 || Math.abs(solved.offsetY) > 500) return [];
        const normalizedRms = solved.rmsError / diagonal;
        let confidence = proposal.confidenceBase;
        if (pairCount === 3) confidence += 0.035;
        if (proposal.evidenceCount >= 4) confidence += 0.025;
        if (proposal.spreadScore >= 0.45) confidence += 0.025;
        if (normalizedRms <= 0.002) confidence += 0.035;
        else if (normalizedRms >= 0.012) confidence -= 0.12;
        confidence = Math.max(0.4, Math.min(0.98, confidence));
        return [{
          ...solved,
          pairCount,
          picks,
          pairMeta: selectedPairs.map((pair) => ({ key: pair.key, weight: pair.weight, manual: false })),
          source: proposal.source,
          evidenceCount: proposal.evidenceCount,
          confidenceScore: Number(confidence.toFixed(3)),
          summary: proposal.summary,
        } satisfies AutoAlignmentSuggestion];
      }).sort((left, right) => right.confidenceScore - left.confidenceScore || left.rmsError - right.rmsError || right.evidenceCount - left.evidenceCount);

      if (!evaluated.length) {
        setAutoAlignmentError("A felismert automatikus jelöltek mindegyike kiesett a biztonságos skála/eltolás vagy stabilitási feltételeken. Használd a 2/3 pontos kézi illesztést.");
        return;
      }
      setAutoAlignmentCandidates(evaluated);
      setAutoAlignmentCandidateIndex(0);
      setAutoAlignmentSuggestion(evaluated[0]);
      setAlignmentMessage(evaluated.length > 1 ? `${evaluated.length} biztonságos automatikus illesztési alternatíva készült. Ellenőrizd és válaszd ki a megfelelőt.` : "1 biztonságos automatikus illesztési javaslat készült.");
    } catch (caught) {
      setAutoAlignmentError(caught instanceof Error ? `Automatikus illesztési elemzés: ${caught.message}` : "Az automatikus illesztési elemzés sikertelen.");
    } finally {
      setAutoAlignmentAnalyzing(false);
    }
  }

  function selectAutoAlignmentCandidate(index: number) {
    const candidate = autoAlignmentCandidates[index];
    if (!candidate) return;
    setAutoAlignmentCandidateIndex(index);
    setAutoAlignmentSuggestion(candidate);
    setSelectedDifferenceZoneIndex(0);
    setAutoPairReplacement(null);
    setAlignmentMessage(`Automatikus alternatíva ${index + 1}/${autoAlignmentCandidates.length} kiválasztva · ${Math.round(candidate.confidenceScore * 100)}% bizalom · RMS ${candidate.rmsError.toFixed(2)} px.`);
  }

  function focusDifferenceZone(zoneIndex: number) {
    const quality = autoCandidateVisualQuality[autoAlignmentCandidateIndex];
    const zone = quality?.zones[zoneIndex];
    if (!zone) return;
    setDifferenceHeatmapEnabled(true);
    setSelectedDifferenceZoneIndex(zoneIndex);
    setFocusedCompareFindingId(null);
    const stage = stageRef.current;
    if (stage) {
      stage.scrollTo({
        left: Math.max(0, zone.x + zone.width / 2 - stage.clientWidth / 2),
        top: Math.max(0, zone.y + zone.height / 2 - stage.clientHeight / 2),
        behavior: "smooth",
      });
    }
  }

  async function addSelectedDifferenceToFindings() {
    const zone = activeDifferenceZones[selectedDifferenceZoneIndex];
    const suggestion = autoAlignmentSuggestion;
    const leftCanvas = leftCanvasRef.current;
    if (!zone || !suggestion || !leftCanvas?.width || !leftCanvas.height || compareFindingsSavingId) return;
    const zoneLabel = `Δ${selectedDifferenceZoneIndex + 1}`;
    const duplicate = compareFindings.find((finding) =>
      finding.contextKey === compareFindingContextKey
      && finding.pageNumber === pageNumber
      && finding.sourceZoneIndex === selectedDifferenceZoneIndex
      && Math.abs(finding.zone.x - zone.x / leftCanvas.width) < 0.002
      && Math.abs(finding.zone.y - zone.y / leftCanvas.height) < 0.002
    );
    if (duplicate) {
      setFocusedCompareFindingId(duplicate.id);
      setCompareFindingsMessage(`${zoneLabel} már szerepel az eltérési jegyzékben.`);
      return;
    }
    setCompareFindingsSavingId("NEW");
    setCompareFindingsMessage(`${zoneLabel} mentése…`);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/compare-findings`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leftDocumentId: leftDocument.id,
          leftVersionId: leftDocument.currentVersion?.id || "",
          rightDocumentId: rightDocument.id,
          rightVersionId: rightDocument.currentVersion?.id || "",
          pageNumber,
          sourceZoneIndex: selectedDifferenceZoneIndex,
          zoneLabel,
          zoneX: zone.x / leftCanvas.width,
          zoneY: zone.y / leftCanvas.height,
          zoneWidth: zone.width / leftCanvas.width,
          zoneHeight: zone.height / leftCanvas.height,
          score: zone.score,
          mismatchPixels: zone.mismatchPixels,
          inkPixels: zone.inkPixels,
          alignmentOffsetX: suggestion.offsetX,
          alignmentOffsetY: suggestion.offsetY,
          alignmentScalePercent: suggestion.scalePercent,
          alignmentRotationDegrees: suggestion.rotationDegrees,
          alignmentSource: suggestion.source,
          alignmentConfidenceScore: suggestion.confidenceScore,
          status: "REVIEW",
          priority: "MEDIUM",
          note: "",
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; finding?: CompareFindingServer };
      if (!response.ok || !payload.ok || !payload.finding) throw new Error(payload.error || "Az eltérési tétel mentése sikertelen.");
      const finding = mapServerCompareFinding(payload.finding);
      setCompareFindings((current) => [...current.filter((item) => item.id !== finding.id), finding].sort((a, b) => a.pageNumber - b.pageNumber || a.sourceZoneIndex - b.sourceZoneIndex));
      setFocusedCompareFindingId(finding.id);
      setCompareFindingsMessage(`${zoneLabel} tartósan mentve. A státusz, prioritás, felelős és határidő emberi döntés.`);
    } catch (caught) {
      setCompareFindingsMessage(caught instanceof Error ? caught.message : "Az eltérési tétel mentése sikertelen.");
      await loadCompareFindings();
    } finally {
      setCompareFindingsSavingId(null);
    }
  }

  function editCompareFindingNote(id: string, note: string) {
    const updatedAt = new Date().toISOString();
    setCompareFindings((current) => current.map((finding) => finding.id === id ? { ...finding, note: note.slice(0, 4000), updatedAt } : finding));
  }

  async function persistCompareFinding(id: string, patch: Partial<Pick<CompareFinding, "status" | "priority" | "note" | "assigneeUserId" | "dueAt">>) {
    const currentFinding = compareFindings.find((finding) => finding.id === id);
    if (!currentFinding || compareFindingsSavingId) return;
    setCompareFindingsSavingId(id);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/compare-findings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: currentFinding.version, ...patch }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; finding?: CompareFindingServer };
      if (!response.ok || !payload.ok || !payload.finding) throw new Error(payload.error || "Az eltérési tétel frissítése sikertelen.");
      const updated = mapServerCompareFinding(payload.finding);
      setCompareFindings((current) => current.map((finding) => finding.id === id ? updated : finding));
      setCompareFindingsMessage(`${updated.zoneLabel} mentve · v${updated.version} · ${updated.updatedByName || "DIMPRO felhasználó"}.`);
    } catch (caught) {
      setCompareFindingsMessage(caught instanceof Error ? caught.message : "Az eltérési tétel frissítése sikertelen.");
      await loadCompareFindings();
    } finally {
      setCompareFindingsSavingId(null);
    }
  }

  async function convertCompareFindingToIssue(finding: CompareFinding) {
    const existingIssue = finding.links.find((link) => link.targetType === "issue");
    if (existingIssue) {
      setCompareFindingsMessage(`${finding.zoneLabel} már kapcsolódik hibajegyhez: ${existingIssue.targetLabel || existingIssue.targetId}.`);
      return;
    }
    if (finding.status !== "FIX_REQUIRED") {
      setCompareFindingsMessage("Hibajegy csak emberi döntéssel JAVÍTANDÓ státuszú eltérésből hozható létre.");
      return;
    }
    if (compareFindingsSavingId) return;
    setCompareFindingsSavingId(finding.id);
    setCompareFindingsMessage(`${finding.zoneLabel} hibajegy létrehozása…`);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/compare-findings/${encodeURIComponent(finding.id)}/convert-to-issue`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json() as { ok?: boolean; error?: string; created?: boolean; issue?: { id: string; serial: string } };
      if (!response.ok || !payload.ok || !payload.issue) throw new Error(payload.error || "A hibajegy létrehozása sikertelen.");
      await loadCompareFindings();
      setFocusedCompareFindingId(finding.id);
      setCompareFindingsMessage(payload.created
        ? `${payload.issue.serial} létrehozva és az eredeti ${finding.zoneLabel} findinghez kapcsolva.`
        : `${payload.issue.serial} már létezett; a kapcsolat változatlanul megmaradt.`);
    } catch (caught) {
      setCompareFindingsMessage(caught instanceof Error ? caught.message : "A hibajegy létrehozása sikertelen.");
      await loadCompareFindings();
    } finally {
      setCompareFindingsSavingId(null);
    }
  }

  async function removeCompareFinding(id: string) {
    const finding = compareFindings.find((item) => item.id === id);
    if (!finding || compareFindingsSavingId) return;
    setCompareFindingsSavingId(id);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/compare-findings/${encodeURIComponent(id)}?expectedVersion=${finding.version}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az eltérési tétel archiválása sikertelen.");
      setCompareFindings((current) => current.filter((item) => item.id !== id));
      setFocusedCompareFindingId((current) => current === id ? null : current);
      setCompareFindingsMessage(`${finding.zoneLabel} archiválva. Az auditnapló megmarad.`);
    } catch (caught) {
      setCompareFindingsMessage(caught instanceof Error ? caught.message : "Az eltérési tétel archiválása sikertelen.");
      await loadCompareFindings();
    } finally {
      setCompareFindingsSavingId(null);
    }
  }

  function focusCompareFinding(finding: CompareFinding) {
    setFocusedCompareFindingId(finding.id);
    setPageNumber(finding.pageNumber);
    setDifferenceHeatmapEnabled(true);
    if (activeDifferenceZones[finding.sourceZoneIndex]) setSelectedDifferenceZoneIndex(finding.sourceZoneIndex);
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      const canvas = leftCanvasRef.current;
      if (!stage || !canvas?.width || !canvas.height) return;
      const centerX = (finding.zone.x + finding.zone.width / 2) * canvas.width;
      const centerY = (finding.zone.y + finding.zone.height / 2) * canvas.height;
      stage.scrollTo({
        left: Math.max(0, centerX - stage.clientWidth / 2),
        top: Math.max(0, centerY - stage.clientHeight / 2),
        behavior: "smooth",
      });
    });
  }

  function exportCompareFindings(format: "json" | "csv") {
    if (!compareFindings.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `DIMPRO_Compare_Findings_${projectId}_${stamp}`.replace(/[^0-9A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű_.-]+/g, "_");
    if (format === "json") {
      const payload = {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        projectId,
        comparison: { left: compareFindings[0]?.left, right: compareFindings[0]?.right },
        findings: compareFindings,
      };
      triggerTextDownload(`${baseName}.json`, `${JSON.stringify(payload, null, 2)}\n`, "application/json;charset=utf-8");
      return;
    }
    const header = ["id","status","priority","assignee","dueAt","version","delta","scorePercent","page","leftDocument","leftVersionId","leftRevision","rightDocument","rightVersionId","rightRevision","note","updatedBy","createdAt","updatedAt","zoneX","zoneY","zoneWidth","zoneHeight","alignmentX","alignmentY","alignmentScalePercent","alignmentRotationDegrees","alignmentSource","alignmentConfidence","linkCount"].join(";");
    const rows = compareFindings.map((finding) => [
      finding.id, compareFindingStatusLabels[finding.status], compareFindingPriorityLabels[finding.priority], finding.assigneeName, finding.dueAt, finding.version, finding.zoneLabel, finding.score, finding.pageNumber,
      finding.left.documentName, finding.left.versionId, finding.left.revisionCode, finding.right.documentName, finding.right.versionId, finding.right.revisionCode, finding.note, finding.updatedByName, finding.createdAt, finding.updatedAt,
      finding.zone.x.toFixed(6), finding.zone.y.toFixed(6), finding.zone.width.toFixed(6), finding.zone.height.toFixed(6),
      finding.alignment.offsetX, finding.alignment.offsetY, finding.alignment.scalePercent, finding.alignment.rotationDegrees, finding.alignment.source, finding.alignment.confidenceScore, finding.links.length,
    ].map(csvCell).join(";"));
    triggerTextDownload(`${baseName}.csv`, `\uFEFF${[header, ...rows].join("\n")}\n`, "text/csv;charset=utf-8");
  }

  function startAutoPairReplacement(pairIndex: number) {
    if (!autoAlignmentSuggestion) return;
    setAutoPairReplacement({ pairIndex, side: "A" });
    setAlignmentEnabled(false);
    setAlignmentMessage(`Referencia ${pairIndex + 1}: jelöld ki az új A pontot.`);
    requestAnimationFrame(() => rootRef.current?.focus());
  }

  function replaceAutoSuggestionPair(pairIndex: number, aPoint: AlignmentPoint, bPoint: AlignmentPoint) {
    const suggestion = autoAlignmentSuggestion;
    if (!suggestion) return;
    const nextPicks = suggestion.picks.filter((pick) => pick.pairIndex !== pairIndex);
    nextPicks.push(
      { side: "A", pairIndex, point: aPoint },
      { side: "B", pairIndex, point: bPoint },
    );
    nextPicks.sort((left, right) => left.pairIndex - right.pairIndex || left.side.localeCompare(right.side));
    const solved = solveSimilarityAlignment(nextPicks, suggestion.pairCount);
    if (!solved) {
      setAlignmentMessage(`Referencia ${pairIndex + 1}: a kézi cserepontokkal nem számítható stabil illesztés.`);
      return;
    }
    if (solved.scalePercent < 70 || solved.scalePercent > 130 || Math.abs(solved.offsetX) > 500 || Math.abs(solved.offsetY) > 500) {
      setAlignmentMessage(`Referencia ${pairIndex + 1}: a kézi csere biztonsági tartományon kívüli transzformációt adna, ezért nem alkalmaztam.`);
      return;
    }
    const nextSuggestion: AutoAlignmentSuggestion = {
      ...suggestion,
      ...solved,
      picks: nextPicks,
      pairMeta: suggestion.pairMeta.map((meta, index) => index === pairIndex ? { ...meta, manual: true } : meta),
    };
    setAutoAlignmentSuggestion(nextSuggestion);
    setAutoAlignmentCandidates((current) => current.map((candidate, index) => index === autoAlignmentCandidateIndex ? nextSuggestion : candidate));
    setAutoCandidateVisualQuality((current) => ({ ...current, [autoAlignmentCandidateIndex]: null }));
    setAutoPairReplacement(null);
    setAlignmentMessage(`Referencia ${pairIndex + 1} kézzel felülvizsgálva · új RMS ${solved.rmsError.toFixed(2)} px.`);
  }

  function captureAutoPairReplacement(event: ReactPointerEvent<HTMLDivElement>) {
    const replacement = autoPairReplacement;
    if (!replacement || !autoAlignmentSuggestion) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    const displayPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (replacement.side === "A") {
      setAutoPairReplacement({ pairIndex: replacement.pairIndex, side: "B", aPoint: displayPoint });
      setAlignmentMessage(`Referencia ${replacement.pairIndex + 1}: jelöld ki az új B pontot.`);
    } else {
      const bPoint = invertSimilarityAlignment(displayPoint, alignmentOffsetX, alignmentOffsetY, alignmentScale, alignmentRotation);
      if (replacement.aPoint) replaceAutoSuggestionPair(replacement.pairIndex, replacement.aPoint, bPoint);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function applyAutoAlignmentSuggestion() {
    const suggestion = autoAlignmentSuggestion;
    if (!suggestion) return;
    setAlignmentOffsetX(clampAlignmentOffset(suggestion.offsetX));
    setAlignmentOffsetY(clampAlignmentOffset(suggestion.offsetY));
    setAlignmentScale(clampAlignmentScale(suggestion.scalePercent));
    setAlignmentRotation(suggestion.rotationDegrees);
    setAlignmentRmsError(suggestion.rmsError);
    setAlignmentPicks(suggestion.picks);
    setAutoPairReplacement(null);
    setPointAlignmentMode(null);
    setAlignmentEnabled(false);
    setAlignmentMessage(`Automatikus javaslat jóváhagyva · ${Math.round(suggestion.confidenceScore * 100)}% bizalom · RMS ${suggestion.rmsError.toFixed(2)} px.`);
    setAutoAlignmentSuggestion(null);
    setAutoAlignmentCandidates([]);
    setAutoAlignmentCandidateIndex(0);
    setAutoCandidateVisualQuality({});
    setDifferenceHeatmapEnabled(false);
    setSelectedDifferenceZoneIndex(0);
    setAutoAlignmentError("");
  }

  function startPointAlignment(pairCount: 2 | 3) {
    if (!isPdf || mode === "SIDE_BY_SIDE") return;
    setAutoPairReplacement(null);
    setPointAlignmentMode(pairCount);
    setAlignmentPicks([]);
    setAlignmentRmsError(null);
    setAlignmentMessage(`${pairCount} pontos illesztés: jelöld ki az A1 referencia-pontot.`);
    setAlignmentEnabled(false);
    requestAnimationFrame(() => rootRef.current?.focus());
  }

  function cancelPointAlignment() {
    setPointAlignmentMode(null);
    setAlignmentPicks([]);
    setAlignmentMessage("");
  }

  function applySolvedPointAlignment(picks: AlignmentPick[], pairCount: 2 | 3) {
    const solved = solveSimilarityAlignment(picks, pairCount);
    if (!solved) {
      setAlignmentMessage("A kijelölt pontok túl közel vannak egymáshoz vagy nem alkotnak érvényes illesztést.");
      return;
    }
    if (solved.scalePercent < 70 || solved.scalePercent > 130) {
      setAlignmentMessage(`A számított méretarány ${solved.scalePercent.toFixed(2)}%, ami kívül esik a biztonságos 70–130% tartományon. Válassz távolabbi referencia-pontokat.`);
      return;
    }
    if (Math.abs(solved.offsetX) > 500 || Math.abs(solved.offsetY) > 500) {
      setAlignmentMessage("A számított eltolás meghaladja az ±500 px biztonsági tartományt. Ellenőrizd a pontpárokat.");
      return;
    }
    setAlignmentOffsetX(clampAlignmentOffset(solved.offsetX));
    setAlignmentOffsetY(clampAlignmentOffset(solved.offsetY));
    setAlignmentScale(clampAlignmentScale(solved.scalePercent));
    setAlignmentRotation(solved.rotationDegrees);
    setAlignmentRmsError(solved.rmsError);
    setAlignmentMessage(`${pairCount} pontos illesztés kész · RMS ${solved.rmsError.toFixed(2)} px · szög ${solved.rotationDegrees.toFixed(3)}°`);
  }

  function capturePointAlignment(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointAlignmentMode) return false;
    const targetCount = pointAlignmentMode * 2;
    if (alignmentPicks.length >= targetCount) return true;
    const expectedSide: PointSide = alignmentPicks.length % 2 === 0 ? "A" : "B";
    const pairIndex = Math.floor(alignmentPicks.length / 2);
    const rect = event.currentTarget.getBoundingClientRect();
    const displayPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nativePoint = expectedSide === "B"
      ? invertSimilarityAlignment(displayPoint, alignmentOffsetX, alignmentOffsetY, alignmentScale, alignmentRotation)
      : displayPoint;
    const nextPicks = [...alignmentPicks, { side: expectedSide, pairIndex, point: nativePoint }];
    setAlignmentPicks(nextPicks);
    const nextIndex = nextPicks.length;
    if (nextIndex >= targetCount) {
      applySolvedPointAlignment(nextPicks, pointAlignmentMode);
    } else {
      const nextSide: PointSide = nextIndex % 2 === 0 ? "A" : "B";
      const nextPair = Math.floor(nextIndex / 2) + 1;
      setAlignmentMessage(`Jelöld ki a ${nextSide}${nextPair} referencia-pontot.`);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function nudgeAlignment(deltaX: number, deltaY: number) {
    setAlignmentOffsetX((current) => clampAlignmentOffset(current + deltaX));
    setAlignmentOffsetY((current) => clampAlignmentOffset(current + deltaY));
    setAlignmentRmsError(null);
    if (pointAlignmentMode) setAlignmentMessage("Kézi finomkorrekció alkalmazva · RMS érték új pontmérés után számítható.");
  }

  function alignByPageBounds() {
    if (!isPdf) return;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!leftCanvas?.width || !leftCanvas?.height || !rightCanvas?.width || !rightCanvas?.height) return;
    const scale = Math.min(leftCanvas.width / rightCanvas.width, leftCanvas.height / rightCanvas.height);
    const nextScale = clampAlignmentScale(scale * 100);
    const factor = nextScale / 100;
    setAlignmentScale(nextScale);
    setAlignmentOffsetX(clampAlignmentOffset((leftCanvas.width - rightCanvas.width * factor) / 2));
    setAlignmentOffsetY(clampAlignmentOffset((leftCanvas.height - rightCanvas.height * factor) / 2));
    setAlignmentRotation(0);
    setAlignmentRmsError(null);
    if (pointAlignmentMode) setAlignmentMessage("Lapméret-illesztés alkalmazva · RMS érték új pontmérés után számítható.");
  }

  function beginAlignmentDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (autoPairReplacement || pointAlignmentMode || !alignmentEnabled || mode === "SIDE_BY_SIDE") return;
    alignmentDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: alignmentOffsetX,
      originY: alignmentOffsetY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveAlignmentDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = alignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !alignmentEnabled || mode === "SIDE_BY_SIDE") return;
    setAlignmentOffsetX(clampAlignmentOffset(drag.originX + event.clientX - drag.startX));
    setAlignmentOffsetY(clampAlignmentOffset(drag.originY + event.clientY - drag.startY));
    setAlignmentRmsError(null);
    event.preventDefault();
  }

  function endAlignmentDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = alignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    alignmentDragRef.current = null;
    if (pointAlignmentMode) setAlignmentMessage("Kézi húzásos korrekció alkalmazva · RMS érték új pontmérés után számítható.");
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* pointer may already be released */ }
  }

  function handleAlignmentKeys(event: ReactKeyboardEvent<HTMLElement>) {
    if (!alignmentEnabled || mode === "SIDE_BY_SIDE") return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") nudgeAlignment(-step, 0);
    else if (event.key === "ArrowRight") nudgeAlignment(step, 0);
    else if (event.key === "ArrowUp") nudgeAlignment(0, -step);
    else if (event.key === "ArrowDown") nudgeAlignment(0, step);
    else return;
    event.preventDefault();
  }

  async function fullscreen() {
    try { await rootRef.current?.requestFullscreen?.(); } catch { /* browser may reject */ }
  }

  if (!compatible) {
    return (
      <section className={styles.visualCompareUnsupported} aria-label="Vizuális tervösszehasonlítás">
        <Contrast size={24} />
        <strong>A két fájl vizuális típusa nem kompatibilis.</strong>
        <span>Vizuális összehasonlításhoz két PDF vagy két támogatott raster kép szükséges.</span>
      </section>
    );
  }

  const isPdf = leftKind === "PDF" && rightKind === "PDF";
  const ready = Boolean(leftPreview && rightPreview) && (!isPdf || sharedPageCount > 0);
  const topOpacity = mode === "DIFFERENCE" ? 1 : overlayOpacity / 100;
  const topBlend = mode === "DIFFERENCE" ? "difference" : "normal";
  const alignmentFactor = alignmentScale / 100;
  const revisionAlignmentTransform = `translate(${alignmentOffsetX}px, ${alignmentOffsetY}px) rotate(${alignmentRotation}deg) scale(${alignmentFactor})`;
  const pointAlignmentTargetCount = pointAlignmentMode ? pointAlignmentMode * 2 : 0;
  const pointAlignmentCollecting = Boolean(pointAlignmentMode && alignmentPicks.length < pointAlignmentTargetCount);
  const pointAlignmentExpectedSide: PointSide | null = pointAlignmentCollecting ? (alignmentPicks.length % 2 === 0 ? "A" : "B") : null;
  const autoPairReplacementCollecting = Boolean(autoAlignmentSuggestion && autoPairReplacement);
  const bestVisualCandidateEntry = Object.entries(autoCandidateVisualQuality)
    .filter((entry): entry is [string, AutoCandidateVisualQuality] => Boolean(entry[1]))
    .sort((left, right) => right[1].score - left[1].score || Number(left[0]) - Number(right[0]))[0];
  const bestVisualCandidateIndex = bestVisualCandidateEntry ? Number(bestVisualCandidateEntry[0]) : null;
  const activeVisualQuality = autoCandidateVisualQuality[autoAlignmentCandidateIndex] || null;
  const activeDifferenceZones = activeVisualQuality?.zones || [];
  const activeDifferenceZone = activeDifferenceZones[Math.min(selectedDifferenceZoneIndex, Math.max(0, activeDifferenceZones.length - 1))] || null;
  const focusedCompareFinding = compareFindings.find((finding) => finding.id === focusedCompareFindingId) || null;
  const focusedFindingCanvasWidth = overlaySize.width || 0;
  const focusedFindingCanvasHeight = overlaySize.height || 0;
  const focusedFindingDisplayZone: VisualDifferenceZone | null = focusedCompareFinding && focusedFindingCanvasWidth > 0 && focusedFindingCanvasHeight > 0
    ? {
        x: focusedCompareFinding.zone.x * focusedFindingCanvasWidth,
        y: focusedCompareFinding.zone.y * focusedFindingCanvasHeight,
        width: focusedCompareFinding.zone.width * focusedFindingCanvasWidth,
        height: focusedCompareFinding.zone.height * focusedFindingCanvasHeight,
        score: focusedCompareFinding.score,
        mismatchPixels: focusedCompareFinding.mismatchPixels,
        inkPixels: focusedCompareFinding.inkPixels,
      }
    : null;
  const effectiveShowBase = pointAlignmentCollecting
    ? pointAlignmentExpectedSide === "A"
    : autoPairReplacementCollecting
      ? autoPairReplacement?.side === "A"
      : showBase;
  const effectiveShowRevision = pointAlignmentCollecting
    ? pointAlignmentExpectedSide === "B"
    : autoPairReplacementCollecting
      ? autoPairReplacement?.side === "B"
      : showRevision;
  const alignmentMarkerPoints = alignmentPicks.map((pick) => ({
    ...pick,
    displayPoint: pick.side === "A"
      ? pick.point
      : applySimilarityAlignment(pick.point, alignmentOffsetX, alignmentOffsetY, alignmentScale, alignmentRotation),
  }));
  const autoReviewMarkerPoints = (autoAlignmentSuggestion?.picks || []).map((pick) => ({
    ...pick,
    displayPoint: pick.side === "A"
      ? pick.point
      : applySimilarityAlignment(pick.point, alignmentOffsetX, alignmentOffsetY, alignmentScale, alignmentRotation),
  }));
  const autoReviewPairLines = autoAlignmentSuggestion
    ? Array.from({ length: autoAlignmentSuggestion.pairCount }, (_, pairIndex) => {
      const a = autoReviewMarkerPoints.find((pick) => pick.pairIndex === pairIndex && pick.side === "A");
      const b = autoReviewMarkerPoints.find((pick) => pick.pairIndex === pairIndex && pick.side === "B");
      return a && b ? { pairIndex, a: a.displayPoint, b: b.displayPoint } : null;
    }).filter((pair): pair is { pairIndex: number; a: AlignmentPoint; b: AlignmentPoint } => Boolean(pair))
    : [];

  return (
    <section ref={rootRef} className={styles.visualCompare} aria-label="Vizuális tervösszehasonlítás" tabIndex={0} onKeyDown={handleAlignmentKeys}>
      <header className={styles.visualCompareHeader}>
        <div className={styles.visualCompareTitle}>
          <Contrast size={15} />
          <div>
            <strong>Vizuális revízió-összehasonlítás</strong>
            <span>Szinkronizált oldal, zoom és forgatás · A = alap · B = vizsgált revízió</span>
          </div>
        </div>
        <div className={styles.visualCompareModeSwitch} role="group" aria-label="Összehasonlítási mód">
          <button type="button" className={mode === "SIDE_BY_SIDE" ? styles.visualCompareModeActive : ""} onClick={() => setMode("SIDE_BY_SIDE")} title="Egymás melletti nézet"><Columns2 size={13} /> Párhuzamos</button>
          <button type="button" className={mode === "OVERLAY" ? styles.visualCompareModeActive : ""} onClick={() => setMode("OVERLAY")} title="Átfedéses nézet"><Layers3 size={13} /> Átfedés</button>
          <button type="button" className={mode === "DIFFERENCE" ? styles.visualCompareModeActive : ""} onClick={() => setMode("DIFFERENCE")} title="Különbség kiemelése"><Contrast size={13} /> Különbség</button>
        </div>
      </header>

      <div className={styles.visualCompareToolbar}>
        {isPdf && (
          <div className={styles.visualCompareToolGroup}>
            <button type="button" onClick={() => setPageNumber((current) => Math.max(1, current - 1))} disabled={pageNumber <= 1} title="Előző közös oldal"><ChevronLeft size={13} /></button>
            <span>{pageNumber} / {sharedPageCount || "–"}</span>
            <button type="button" onClick={() => setPageNumber((current) => Math.min(sharedPageCount || current, current + 1))} disabled={!sharedPageCount || pageNumber >= sharedPageCount} title="Következő közös oldal"><ChevronRight size={13} /></button>
            <small>A: {leftPageCount || "–"} · B: {rightPageCount || "–"} oldal</small>
          </div>
        )}
        <div className={styles.visualCompareToolGroup}>
          <button type="button" onClick={() => changeZoom(-0.15)} title="Szinkron kicsinyítés"><ZoomOut size={13} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => changeZoom(0.15)} title="Szinkron nagyítás"><ZoomIn size={13} /></button>
          <button type="button" className={fitWidth ? styles.visualCompareToolActive : ""} onClick={fit} title="Mindkét nézet szélességre illesztése"><Scan size={13} /></button>
          <button type="button" onClick={rotate} title="Mindkét nézet forgatása 90°"><RotateCw size={13} /></button>
        </div>
        {mode !== "SIDE_BY_SIDE" && (
          <label className={styles.visualCompareOpacity}>
            <span>B réteg</span>
            <input type="range" min="0" max="100" step="5" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} disabled={mode === "DIFFERENCE"} />
            <strong>{mode === "DIFFERENCE" ? "DIFF" : `${overlayOpacity}%`}</strong>
          </label>
        )}
        {mode !== "SIDE_BY_SIDE" && (
          <div className={styles.visualCompareAlignmentCompact}>
            <button
              type="button"
              className={alignmentEnabled ? styles.visualCompareToolActive : ""}
              onClick={() => { setAlignmentEnabled((current) => !current); requestAnimationFrame(() => rootRef.current?.focus()); }}
              title="B réteg kézi geometriai igazítása"
              aria-pressed={alignmentEnabled}
            ><Move size={13} /> Igazítás</button>
            <span>X {alignmentOffsetX} · Y {alignmentOffsetY} · {alignmentScale.toFixed(1)}% · {alignmentRotation.toFixed(2)}°{alignmentRmsError !== null ? ` · RMS ${alignmentRmsError.toFixed(1)}` : ""}</span>
          </div>
        )}
        <div className={styles.visualCompareToolbarSpacer} />
        <div className={styles.visualCompareToolGroup}>
          <button type="button" className={showBase ? styles.visualCompareToolActive : ""} onClick={() => setShowBase((current) => !current)} title="A réteg ki-/bekapcsolása">{showBase ? <Eye size={13} /> : <EyeOff size={13} />} A</button>
          <button type="button" className={showRevision ? styles.visualCompareToolActive : ""} onClick={() => setShowRevision((current) => !current)} title="B réteg ki-/bekapcsolása">{showRevision ? <Eye size={13} /> : <EyeOff size={13} />} B</button>
          <button type="button" onClick={() => void reload()} title="Mindkét előnézet frissítése"><RefreshCcw size={13} /></button>
          <button type="button" onClick={() => void fullscreen()} title="Vizuális összehasonlítás teljes képernyőn"><Maximize2 size={13} /></button>
        </div>
      </div>

      {error && <div className={styles.visualCompareError}>{error}</div>}

      {mode !== "SIDE_BY_SIDE" && (
        <div className={`${styles.visualCompareAlignmentBar} ${alignmentEnabled ? styles.visualCompareAlignmentBarActive : ""}`}>
          <div className={styles.visualCompareAlignmentLead}>
            <Move size={13} />
            <div><strong>B réteg geometriai igazítása</strong><span>Kapcsold be, majd húzd a B réteget. Nyílbillentyű: 1 px · Shift + nyíl: 10 px.</span></div>
          </div>
          <div className={styles.visualCompareNudgeGrid} aria-label="B réteg finom mozgatása">
            <button type="button" onClick={() => nudgeAlignment(0, -1)} title="B réteg fel 1 px" disabled={!alignmentEnabled}>↑</button>
            <button type="button" onClick={() => nudgeAlignment(-1, 0)} title="B réteg balra 1 px" disabled={!alignmentEnabled}>←</button>
            <button type="button" onClick={() => nudgeAlignment(1, 0)} title="B réteg jobbra 1 px" disabled={!alignmentEnabled}>→</button>
            <button type="button" onClick={() => nudgeAlignment(0, 1)} title="B réteg le 1 px" disabled={!alignmentEnabled}>↓</button>
          </div>
          <label className={styles.visualCompareAlignmentScale}>
            <span>B méret</span>
            <input type="range" min="70" max="130" step="0.1" value={alignmentScale} onChange={(event) => { setAlignmentScale(clampAlignmentScale(Number(event.target.value))); setAlignmentRmsError(null); if (pointAlignmentMode) setAlignmentMessage("Kézi méretkorrekció alkalmazva · RMS érték új pontmérés után számítható."); }} />
            <strong>{alignmentScale.toFixed(1)}%</strong>
          </label>
          <label className={styles.visualCompareAlignmentAngle}>
            <span>Szög</span>
            <input type="number" min="-180" max="180" step="0.01" value={alignmentRotation} onChange={(event) => { setAlignmentRotation(normalizeAlignmentRotation(Number(event.target.value))); setAlignmentRmsError(null); if (pointAlignmentMode) setAlignmentMessage("Kézi szögkorrekció alkalmazva · RMS érték új pontmérés után számítható."); }} />
            <strong>°</strong>
          </label>
          <div className={styles.visualCompareAlignmentActions}>
            <button type="button" onClick={() => void requestAutoAlignmentSuggestion()} disabled={!isPdf || !ready || autoAlignmentAnalyzing || rotation !== 0} className={autoAlignmentSuggestion ? styles.visualCompareToolActive : ""} title="Vektoros PDF feature-ek alapján automatikus illesztési javaslat készítése; csak jóváhagyás után alkalmazható">{autoAlignmentAnalyzing ? <Loader2 size={12} className={styles.spin} /> : <Sparkles size={12} />} Auto javaslat</button>
            <button type="button" onClick={() => startPointAlignment(2)} disabled={!isPdf || !ready} className={pointAlignmentMode === 2 ? styles.visualCompareToolActive : ""} title="Két azonos referencia-pontpárból eltolás, méretarány és szög számítása"><Crosshair size={12} /> 2 pont</button>
            <button type="button" onClick={() => startPointAlignment(3)} disabled={!isPdf || !ready} className={pointAlignmentMode === 3 ? styles.visualCompareToolActive : ""} title="Három referencia-pontpár legkisebb négyzetes hasonlósági illesztése"><Crosshair size={12} /> 3 pont</button>
            <button type="button" onClick={alignByPageBounds} disabled={!isPdf || !ready} title="A két renderelt lap külső mérete alapján a B réteg középre és méretre igazítása"><Scan size={12} /> Lapméret</button>
            <button type="button" onClick={resetAlignment} title="B réteg geometriai igazításának nullázása"><RotateCcw size={12} /> Nullázás</button>
          </div>
        </div>
      )}

      {mode !== "SIDE_BY_SIDE" && alignmentMessage && !pointAlignmentMode && !autoAlignmentSuggestion && !autoAlignmentError && (
        <div className={styles.visualCompareAlignmentStatus}><Check size={12} /><span>{alignmentMessage}</span></div>
      )}

      {mode !== "SIDE_BY_SIDE" && (autoAlignmentSuggestion || autoAlignmentError) && (
        <div className={`${styles.visualCompareAutoSuggestion} ${autoAlignmentSuggestion ? styles.visualCompareAutoSuggestionReady : styles.visualCompareAutoSuggestionWarning}`}>
          <div className={styles.visualCompareAutoSuggestionLead}>
            <Sparkles size={14} />
            <div>
              <strong>{autoAlignmentSuggestion ? `Automatikus illesztési javaslat${autoAlignmentCandidates.length > 1 ? ` · ${autoAlignmentCandidates.length} alternatíva` : ""}` : "Automatikus illesztés nem javasolható"}</strong>
              {autoAlignmentSuggestion ? (
                <span>{autoAlignmentSuggestion.summary} · forrás: {autoAlignmentSourceLabel(autoAlignmentSuggestion.source)} · bizonyíték: {autoAlignmentSuggestion.evidenceCount}</span>
              ) : <span>{autoAlignmentError}</span>}
            </div>
          </div>
          {autoAlignmentSuggestion && (
            <>
              {autoAlignmentCandidates.length > 1 && (
                <div className={styles.visualCompareAutoCandidates} data-auto-candidate-count={autoAlignmentCandidates.length}>
                  <div className={styles.visualCompareAutoCandidatesHeader}><strong>Illesztési alternatívák</strong><span>Geometriai rang + vizuális vonalfedés · nem szakmai tervminősítés</span></div>
                  <div className={styles.visualCompareAutoCandidateList}>
                    {autoAlignmentCandidates.map((candidate, index) => (
                      <button
                        key={`${candidate.source}-${index}`}
                        type="button"
                        className={index === autoAlignmentCandidateIndex ? styles.visualCompareAutoCandidateActive : ""}
                        onClick={() => selectAutoAlignmentCandidate(index)}
                        data-auto-candidate={index + 1}
                        aria-pressed={index === autoAlignmentCandidateIndex}
                      >
                        <span className={styles.visualCompareAutoCandidatePreview}>
                          <AutoCandidateVisualPreview candidate={candidate} index={index} leftCanvasRef={leftCanvasRef} rightCanvasRef={rightCanvasRef} onQuality={recordAutoCandidateVisualQuality} />
                          <span className={styles.visualCompareAutoCandidatePreviewBadge}>#{index + 1}</span>
                          {index === 0 && <span className={styles.visualCompareAutoCandidateRecommended}>Ajánlott</span>}
                          {bestVisualCandidateIndex === index && <span className={styles.visualCompareAutoCandidateBestVisual}>Legjobb fedés</span>}
                        </span>
                        <span className={styles.visualCompareAutoCandidateInfo}>
                          <strong>{autoAlignmentSourceLabel(candidate.source)}</strong>
                          <span>{Math.round(candidate.confidenceScore * 100)}% · RMS {candidate.rmsError.toFixed(2)} px · {candidate.pairCount} pont</span>
                          {autoCandidateVisualQuality[index] ? (
                            <span className={styles.visualCompareAutoCandidateQuality} data-visual-quality={autoCandidateVisualQuality[index]?.score}>Vizuális {autoCandidateVisualQuality[index]?.score}% · {visualQualityLabel(autoCandidateVisualQuality[index]?.score || 0)}</span>
                          ) : <span className={styles.visualCompareAutoCandidateQualityPending}>Vizuális pontszám számítása…</span>}
                          <small>X {candidate.offsetX.toFixed(1)} · Y {candidate.offsetY.toFixed(1)} · {candidate.scalePercent.toFixed(2)}% · {candidate.rotationDegrees.toFixed(2)}°</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {!autoPairReplacement && alignmentMessage && <div className={styles.visualCompareAutoCandidateHint}><Check size={11} /> {alignmentMessage}</div>}
                </div>
              )}
              <div className={styles.visualCompareAutoMetrics}>
                <span><small>Bizalom</small><strong>{Math.round(autoAlignmentSuggestion.confidenceScore * 100)}%</strong></span>
                <span><small>Pontpár</small><strong>{autoAlignmentSuggestion.pairCount}</strong></span>
                <span><small>RMS</small><strong>{autoAlignmentSuggestion.rmsError.toFixed(2)} px</strong></span>
                <span><small>Skála</small><strong>{autoAlignmentSuggestion.scalePercent.toFixed(2)}%</strong></span>
                <span><small>Szög</small><strong>{autoAlignmentSuggestion.rotationDegrees.toFixed(2)}°</strong></span>
                <span><small>Vizuális</small><strong>{autoCandidateVisualQuality[autoAlignmentCandidateIndex]?.score ?? "–"}%</strong></span>
                <span><small>Δ zóna</small><strong>{activeDifferenceZones.length}</strong></span>
              </div>
              {activeVisualQuality && activeDifferenceZones.length > 0 && (
                <div className={styles.visualCompareDifferenceHeatmapPanel}>
                  <div className={styles.visualCompareDifferenceHeatmapHeader}>
                    <div><strong>Eltérés hőtérkép</strong><span>A nagyobb százalék több eltérő rajzi vonalat jelez az adott zónában.</span></div>
                    <div className={styles.visualCompareDifferenceHeatmapActions}>
                      <button type="button" onClick={addSelectedDifferenceToFindings} data-add-compare-finding disabled={!activeDifferenceZone || Boolean(compareFindingsSavingId)}><Plus size={11} /> Δ{Math.min(selectedDifferenceZoneIndex, Math.max(0, activeDifferenceZones.length - 1)) + 1} jegyzékbe</button>
                      <button type="button" onClick={() => setDifferenceHeatmapEnabled((current) => !current)} className={differenceHeatmapEnabled ? styles.visualCompareToolActive : ""} data-difference-heatmap-toggle aria-pressed={differenceHeatmapEnabled}>{differenceHeatmapEnabled ? "Hőtérkép ki" : "Hőtérkép be"}</button>
                    </div>
                  </div>
                  <div className={styles.visualCompareDifferenceZoneList}>
                    {activeDifferenceZones.map((zone, zoneIndex) => (
                      <button key={zoneIndex} type="button" onClick={() => focusDifferenceZone(zoneIndex)} className={zoneIndex === selectedDifferenceZoneIndex ? styles.visualCompareDifferenceZoneActive : ""} data-difference-zone={zoneIndex + 1}>
                        <strong>Δ{zoneIndex + 1}</strong><span>{zone.score}% eltérés</span><small>{zone.mismatchPixels}/{zone.inkPixels} vonalpont</small>
                      </button>
                    ))}
                  </div>
                  {differenceHeatmapEnabled && activeDifferenceZone && autoAlignmentSuggestion && (
                    <div className={styles.visualCompareDifferenceInspector}>
                      <div><strong>Δ{Math.min(selectedDifferenceZoneIndex, activeDifferenceZones.length - 1) + 1} nagyítás</strong><span>{activeDifferenceZone.score}% helyi eltérés · a nagyítás csak ellenőrző előnézet.</span></div>
                      <DifferenceZoneInspector candidate={autoAlignmentSuggestion} zone={activeDifferenceZone} zoneIndex={Math.min(selectedDifferenceZoneIndex, activeDifferenceZones.length - 1)} leftCanvasRef={leftCanvasRef} rightCanvasRef={rightCanvasRef} />
                    </div>
                  )}
                </div>
              )}
              <div className={styles.visualCompareAutoPairReview}>
                <div className={styles.visualCompareAutoPairReviewHeader}><strong>Referencia-párok ellenőrzése</strong><span>A/B jelölők a terven láthatók · hibás pár kézzel lecserélhető</span></div>
                <div className={styles.visualCompareAutoPairList}>
                  {autoAlignmentSuggestion.pairMeta
                    .map((meta, pairIndex) => ({ meta, pairIndex, rank: [...autoAlignmentSuggestion.pairMeta].sort((a, b) => b.weight - a.weight).findIndex((item) => item.key === meta.key) + 1 }))
                    .map(({ meta, pairIndex, rank }) => {
                      const a = autoAlignmentSuggestion.picks.find((pick) => pick.pairIndex === pairIndex && pick.side === "A");
                      const b = autoAlignmentSuggestion.picks.find((pick) => pick.pairIndex === pairIndex && pick.side === "B");
                      const replacing = autoPairReplacement?.pairIndex === pairIndex;
                      return (
                        <div key={`${meta.key}-${pairIndex}`} className={`${styles.visualCompareAutoPairCard} ${meta.manual ? styles.visualCompareAutoPairCardManual : ""} ${replacing ? styles.visualCompareAutoPairCardReplacing : ""}`} data-auto-pair-card={pairIndex + 1}>
                          <span className={styles.visualCompareAutoPairRank}>#{rank}</span>
                          <div className={styles.visualCompareAutoPairInfo}>
                            <strong>P{pairIndex + 1} · {autoPairFeatureLabel(meta.key)} {meta.manual ? "· Kézi" : "· Auto"}</strong>
                            <small>Erősség {meta.weight.toFixed(2)} · A {a ? `${Math.round(a.point.x)},${Math.round(a.point.y)}` : "–"} · B {b ? `${Math.round(b.point.x)},${Math.round(b.point.y)}` : "–"}</small>
                          </div>
                          <button type="button" onClick={() => startAutoPairReplacement(pairIndex)} disabled={Boolean(autoPairReplacement && !replacing)}>{replacing ? `Jelöld: ${autoPairReplacement?.side || "A"}${pairIndex + 1}` : "Kézi csere"}</button>
                        </div>
                      );
                    })}
                </div>
                {autoPairReplacement && <div className={styles.visualCompareAutoPairHint}><Crosshair size={12} /> {alignmentMessage}</div>}
                {!autoPairReplacement && autoAlignmentSuggestion.pairMeta.some((meta) => meta.manual) && alignmentMessage && <div className={styles.visualCompareAutoPairHint}><Check size={12} /> {alignmentMessage}</div>}
              </div>
              <div className={styles.visualCompareAutoActions}>
                <button type="button" className={styles.visualCompareAutoApply} onClick={applyAutoAlignmentSuggestion}><Check size={12} /> Alkalmazás</button>
                <button type="button" onClick={() => { setAutoAlignmentSuggestion(null); setAutoAlignmentCandidates([]); setAutoAlignmentCandidateIndex(0); setAutoCandidateVisualQuality({}); setDifferenceHeatmapEnabled(false); setSelectedDifferenceZoneIndex(0); setAutoPairReplacement(null); }}><X size={12} /> Elvetés</button>
              </div>
            </>
          )}
        </div>
      )}

      {(compareFindings.length > 0 || autoAlignmentSuggestion) && (
        <div className={styles.visualCompareFindingsPanel} data-compare-findings-count={compareFindings.length}>
          <div className={styles.visualCompareFindingsHeader}>
            <div><ClipboardList size={14} /><span><strong>Eltérési jegyzék V2.1</strong><small>Tartós, projektizolált review-lista · nincs automatikus hibaminősítés; hibajegy csak emberi JAVÍTANDÓ döntés után készül.</small></span></div>
            <div className={styles.visualCompareFindingsExport}>
              <button type="button" onClick={() => exportCompareFindings("json")} disabled={!compareFindings.length} data-export-compare-findings="json"><Download size={11} /> JSON</button>
              <button type="button" onClick={() => exportCompareFindings("csv")} disabled={!compareFindings.length} data-export-compare-findings="csv"><Download size={11} /> CSV</button>
            </div>
          </div>
          {compareFindings.length ? (
            <div className={styles.visualCompareFindingsList}>
              {compareFindings.map((finding, findingIndex) => (
                <div key={finding.id} className={`${styles.visualCompareFindingCard} ${finding.id === focusedCompareFindingId ? styles.visualCompareFindingCardActive : ""}`} data-compare-finding={findingIndex + 1} data-finding-status={finding.status}>
                  <button type="button" className={styles.visualCompareFindingFocus} onClick={() => focusCompareFinding(finding)} title="Eltérési zóna fókuszálása">
                    <strong>{finding.zoneLabel}</strong><span>{finding.score}%</span><small>oldal {finding.pageNumber}</small>
                  </button>
                  <div className={styles.visualCompareFindingBody}>
                    <div className={styles.visualCompareFindingMeta}>
                      <strong>{finding.left.revisionCode || `V${finding.left.versionNumber ?? "–"}`} ↔ {finding.right.revisionCode || `V${finding.right.versionNumber ?? "–"}`}</strong>
                      <small>{finding.mismatchPixels}/{finding.inkPixels} eltérő vonalpont · {autoAlignmentSourceLabel(finding.alignment.source)}</small>
                      <small>v{finding.version} · utolsó mentés: {finding.updatedByName || "DIMPRO felhasználó"}</small>
                    </div>
                    <select value={finding.status} disabled={compareFindingsSavingId === finding.id} onChange={(event) => void persistCompareFinding(finding.id, { status: event.target.value as CompareFindingStatus })} aria-label={`${finding.zoneLabel} státusz`} data-finding-status-select={findingIndex + 1}>
                      {Object.entries(compareFindingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <textarea value={finding.note} disabled={compareFindingsSavingId === finding.id} onChange={(event) => editCompareFindingNote(finding.id, event.target.value)} onBlur={(event) => void persistCompareFinding(finding.id, { note: event.currentTarget.value })} rows={2} maxLength={4000} placeholder="Rövid műszaki megjegyzés…" aria-label={`${finding.zoneLabel} megjegyzés`} data-finding-note={findingIndex + 1} />
                    <button type="button" className={styles.visualCompareFindingDelete} disabled={compareFindingsSavingId === finding.id} onClick={() => void removeCompareFinding(finding.id)} aria-label={`${finding.zoneLabel} archiválása`} title="Archiválás · az auditnapló megmarad"><Trash2 size={12} /></button>
                    <div className={styles.visualCompareFindingWorkflow}>
                      <label><span>Prioritás</span><select value={finding.priority} disabled={compareFindingsSavingId === finding.id} onChange={(event) => void persistCompareFinding(finding.id, { priority: event.target.value as CompareFindingPriority })}>{Object.entries(compareFindingPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label><span>Felelős</span><select value={finding.assigneeUserId || ""} disabled={compareFindingsSavingId === finding.id} onChange={(event) => void persistCompareFinding(finding.id, { assigneeUserId: event.target.value || null })}><option value="">Nincs kijelölve</option>{projectMembers.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.userId}</option>)}</select></label>
                      <label><span>Határidő</span><input type="datetime-local" value={toLocalDateTimeInput(finding.dueAt)} disabled={compareFindingsSavingId === finding.id} onChange={(event) => void persistCompareFinding(finding.id, { dueAt: fromLocalDateTimeInput(event.target.value) || null })} /></label>
                      <div className={styles.visualCompareFindingLinks}>
                        <span>Kapcsolatok</span><strong>{finding.links.length}</strong>
                        <small>{finding.links.find((link) => link.targetType === "issue")?.targetLabel || "hibajegy / jegyzőkönyv / DokuBOX"}</small>
                        <button
                          type="button"
                          className={styles.visualCompareFindingIssueAction}
                          disabled={compareFindingsSavingId === finding.id || finding.status !== "FIX_REQUIRED" || Boolean(finding.links.find((link) => link.targetType === "issue"))}
                          onClick={() => void convertCompareFindingToIssue(finding)}
                          title={finding.status !== "FIX_REQUIRED" ? "Előbb állítsd a finding státuszát JAVÍTANDÓ értékre." : "Tartós projekt-hibajegy létrehozása az eredeti finding megtartásával."}
                          data-convert-finding-to-issue={findingIndex + 1}
                        >
                          {finding.links.find((link) => link.targetType === "issue")?.targetLabel || (finding.status === "FIX_REQUIRED" ? "Hibajegy létrehozása" : "Előbb: JAVÍTANDÓ")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className={styles.visualCompareFindingsEmpty}>{compareFindingsLoading ? "Mentett eltérési tételek betöltése…" : <>Válassz egy Δ zónát, majd add az eltérési jegyzékhez. A rendszer alapból <strong>ELLENŐRIZENDŐ</strong> és <strong>KÖZEPES</strong> prioritást ad.</>}</div>}
          {compareFindingsMessage && <div className={styles.visualCompareFindingsMessage}>{compareFindingsMessage}</div>}
          {focusedCompareFinding && focusedFindingDisplayZone && (
            <div className={styles.visualCompareFindingInspector} data-finding-inspector={focusedCompareFinding.zoneLabel}>
              <div><strong>{focusedCompareFinding.zoneLabel} mentett ellenőrző nézet</strong><span>A tétel saját A/B verzió-, oldal-, zóna- és illesztési snapshotja alapján.</span></div>
              <DifferenceZoneInspector candidate={focusedCompareFinding.alignment} zone={focusedFindingDisplayZone} zoneIndex={focusedCompareFinding.sourceZoneIndex} leftCanvasRef={leftCanvasRef} rightCanvasRef={rightCanvasRef} />
            </div>
          )}
        </div>
      )}

      {mode !== "SIDE_BY_SIDE" && pointAlignmentMode && (
        <div className={`${styles.visualComparePointWizard} ${alignmentPicks.length >= pointAlignmentTargetCount ? styles.visualComparePointWizardComplete : ""}`}>
          <div className={styles.visualComparePointWizardLead}>
            <Crosshair size={14} />
            <div>
              <strong>{pointAlignmentMode} pontos referencia-illesztés</strong>
              <span>{alignmentMessage || "Az A és B terven azonos sarkokat, tengelymetszéseket vagy egyéb biztos referencia-pontokat jelölj ki."}</span>
            </div>
          </div>
          <div className={styles.visualComparePointPairs}>
            {Array.from({ length: pointAlignmentMode }, (_, pairIndex) => {
              const a = alignmentPicks.find((pick) => pick.pairIndex === pairIndex && pick.side === "A");
              const b = alignmentPicks.find((pick) => pick.pairIndex === pairIndex && pick.side === "B");
              return <span key={pairIndex} className={a && b ? styles.visualComparePointPairComplete : ""}>{pairIndex + 1}. {a ? "A✓" : "A·"} {b ? "B✓" : "B·"}</span>;
            })}
          </div>
          <div className={styles.visualComparePointWizardActions}>
            <button type="button" onClick={() => startPointAlignment(pointAlignmentMode)}>Újramérés</button>
            <button type="button" onClick={cancelPointAlignment}>Bezárás</button>
          </div>
        </div>
      )}

      <div
        ref={stageRef}
        className={`${styles.visualCompareStage} ${mode === "SIDE_BY_SIDE" ? styles.visualCompareStageSplit : styles.visualCompareStageOverlay}`}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
        }}
      >
        {(loading || rendering) && <div className={styles.visualCompareLoading}><Loader2 size={18} className={styles.spin} /><span>{loading ? "Előnézetek betöltése…" : "Két revízió renderelése…"}</span></div>}

        {!ready && !error ? (
          <div className={styles.visualCompareEmpty}><Loader2 size={20} className={styles.spin} /><strong>Vizuális összehasonlítás előkészítése…</strong></div>
        ) : mode === "SIDE_BY_SIDE" ? (
          <>
            <div
              ref={leftPaneRef}
              className={styles.visualComparePane}
              data-side="A"
              onScroll={(event) => {
                const target = rightPaneRef.current;
                if (target) syncPaneScroll(event.currentTarget, target);
              }}
            >
              <div className={styles.visualComparePaneLabel}><strong>A</strong><span>{shortRevision(leftDocument)}</span><small>{leftDocument.name}</small></div>
              {isPdf ? (
                <canvas ref={leftCanvasRef} className={styles.visualCompareCanvas} style={{ visibility: showBase ? "visible" : "hidden" }} aria-label={`${leftDocument.name} összehasonlító PDF A`} />
              ) : leftPreview?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={leftPreview.url} alt={`${leftDocument.name} összehasonlító kép A`} className={styles.visualCompareImage} style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `rotate(${rotation}deg)`, visibility: showBase ? "visible" : "hidden" }} />
              ) : null}
            </div>
            <div
              ref={rightPaneRef}
              className={styles.visualComparePane}
              data-side="B"
              onScroll={(event) => {
                const target = leftPaneRef.current;
                if (target) syncPaneScroll(event.currentTarget, target);
              }}
            >
              <div className={styles.visualComparePaneLabel}><strong>B</strong><span>{shortRevision(rightDocument)}</span><small>{rightDocument.name}</small></div>
              {isPdf ? (
                <canvas ref={rightCanvasRef} className={styles.visualCompareCanvas} style={{ visibility: showRevision ? "visible" : "hidden" }} aria-label={`${rightDocument.name} összehasonlító PDF B`} />
              ) : rightPreview?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rightPreview.url} alt={`${rightDocument.name} összehasonlító kép B`} className={styles.visualCompareImage} style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `rotate(${rotation}deg)`, visibility: showRevision ? "visible" : "hidden" }} />
              ) : null}
            </div>
          </>
        ) : (
          <div
            className={`${styles.visualCompareOverlayViewport} ${alignmentEnabled && !pointAlignmentMode && !autoPairReplacement ? styles.visualCompareOverlayViewportAligning : ""} ${(pointAlignmentCollecting || autoPairReplacementCollecting) ? styles.visualCompareOverlayViewportPicking : ""}`}
            style={isPdf && overlaySize.width ? { width: overlaySize.width, height: overlaySize.height } : undefined}
            onPointerDown={(event) => { if (!captureAutoPairReplacement(event) && !capturePointAlignment(event)) beginAlignmentDrag(event); }}
            onPointerMove={moveAlignmentDrag}
            onPointerUp={endAlignmentDrag}
            onPointerCancel={endAlignmentDrag}
          >
            <div className={`${styles.visualCompareOverlayTag} ${styles.visualCompareOverlayTagA}`}>A · {shortRevision(leftDocument)}</div>
            <div className={`${styles.visualCompareOverlayTag} ${styles.visualCompareOverlayTagB}`}>B · {shortRevision(rightDocument)}</div>
            {isPdf ? (
              <>
                <canvas ref={leftCanvasRef} className={`${styles.visualCompareCanvas} ${styles.visualCompareLayer}`} style={{ opacity: effectiveShowBase ? 1 : 0 }} aria-label={`${leftDocument.name} overlay PDF A`} />
                <canvas ref={rightCanvasRef} className={`${styles.visualCompareCanvas} ${styles.visualCompareLayer}`} style={{ opacity: effectiveShowRevision ? ((pointAlignmentCollecting || autoPairReplacementCollecting) ? 1 : topOpacity) : 0, mixBlendMode: (pointAlignmentCollecting || autoPairReplacementCollecting) ? "normal" : topBlend, transform: revisionAlignmentTransform, transformOrigin: "top left" }} aria-label={`${rightDocument.name} overlay PDF B`} data-alignment-x={alignmentOffsetX} data-alignment-y={alignmentOffsetY} data-alignment-scale={alignmentScale} data-alignment-rotation={alignmentRotation} />
              </>
            ) : (
              <>
                {leftPreview?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={leftPreview.url} alt={`${leftDocument.name} overlay kép A`} className={`${styles.visualCompareImage} ${styles.visualCompareLayer}`} style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `rotate(${rotation}deg)`, opacity: effectiveShowBase ? 1 : 0 }} />
                )}
                {rightPreview?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rightPreview.url} alt={`${rightDocument.name} overlay kép B`} className={`${styles.visualCompareImage} ${styles.visualCompareLayer}`} style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `${revisionAlignmentTransform} rotate(${rotation}deg)`, transformOrigin: "top left", opacity: effectiveShowRevision ? ((pointAlignmentCollecting || autoPairReplacementCollecting) ? 1 : topOpacity) : 0, mixBlendMode: (pointAlignmentCollecting || autoPairReplacementCollecting) ? "normal" : topBlend }} data-alignment-x={alignmentOffsetX} data-alignment-y={alignmentOffsetY} data-alignment-scale={alignmentScale} data-alignment-rotation={alignmentRotation} />
                )}
              </>
            )}
            {differenceHeatmapEnabled && autoAlignmentSuggestion && activeDifferenceZones.map((zone, zoneIndex) => (
              <button
                key={`difference-zone-${zoneIndex}`}
                type="button"
                className={`${styles.visualCompareDifferenceZoneOverlay} ${zoneIndex === selectedDifferenceZoneIndex ? styles.visualCompareDifferenceZoneOverlayActive : ""}`}
                style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height, ['--difference-intensity' as string]: Math.max(0.12, Math.min(0.42, zone.score / 220)) }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => focusDifferenceZone(zoneIndex)}
                data-difference-zone-overlay={zoneIndex + 1}
                title={`Δ${zoneIndex + 1}: ${zone.score}% helyi eltérés`}
              ><span>Δ{zoneIndex + 1}</span></button>
            ))}
            {focusedCompareFinding && focusedFindingDisplayZone && (
              <button
                type="button"
                className={styles.visualCompareFindingZoneOverlay}
                style={{ left: focusedFindingDisplayZone.x, top: focusedFindingDisplayZone.y, width: focusedFindingDisplayZone.width, height: focusedFindingDisplayZone.height }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => focusCompareFinding(focusedCompareFinding)}
                data-finding-zone-overlay={focusedCompareFinding.zoneLabel}
                title={`${focusedCompareFinding.zoneLabel}: mentett eltérési tétel`}
              ><span>{focusedCompareFinding.zoneLabel}</span></button>
            )}
            {autoAlignmentSuggestion && autoReviewPairLines.length > 0 && (
              <svg className={styles.visualCompareAutoPairLines} width="100%" height="100%" aria-hidden="true">
                {autoReviewPairLines.map((pair) => <line key={`auto-line-${pair.pairIndex}`} x1={pair.a.x} y1={pair.a.y} x2={pair.b.x} y2={pair.b.y} data-auto-review-line={pair.pairIndex + 1} />)}
              </svg>
            )}
            {autoReviewMarkerPoints.map((pick, index) => (
              <span
                key={`auto-${pick.side}-${pick.pairIndex}-${index}`}
                className={`${styles.visualCompareAlignmentMarker} ${styles.visualCompareAutoReviewMarker} ${pick.side === "A" ? styles.visualCompareAlignmentMarkerA : styles.visualCompareAlignmentMarkerB}`}
                style={{ left: pick.displayPoint.x, top: pick.displayPoint.y }}
                data-auto-review-side={pick.side}
                data-auto-review-pair={pick.pairIndex + 1}
              >{pick.side}{pick.pairIndex + 1}</span>
            ))}
            {alignmentMarkerPoints.map((pick, index) => (
              <span
                key={`${pick.side}-${pick.pairIndex}-${index}`}
                className={`${styles.visualCompareAlignmentMarker} ${pick.side === "A" ? styles.visualCompareAlignmentMarkerA : styles.visualCompareAlignmentMarkerB}`}
                style={{ left: pick.displayPoint.x, top: pick.displayPoint.y }}
                data-point-side={pick.side}
                data-point-pair={pick.pairIndex + 1}
              >{pick.side}{pick.pairIndex + 1}</span>
            ))}
            {(pointAlignmentCollecting || autoPairReplacementCollecting) && (
              <div className={styles.visualComparePointPickHint}>
                <Crosshair size={13} /> Jelöld ki: <strong>{pointAlignmentCollecting ? `${pointAlignmentExpectedSide}${Math.floor(alignmentPicks.length / 2) + 1}` : `${autoPairReplacement?.side}${(autoPairReplacement?.pairIndex || 0) + 1}`}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className={styles.visualCompareFooter}>
        <span><strong>Szinkron:</strong> oldal · zoom · illesztés · forgatás · pásztázás</span>
        <span><strong>Átfedés:</strong> B réteg átlátszóság állítható</span>
        <span><strong>Geometriai igazítás:</strong> B réteg húzás · X/Y · méret · szög · 2/3 pont · Auto javaslat · vizuális A/B pár-ellenőrzés</span>
        <span><strong>Különbség:</strong> CSS difference blend – az eltérő vonalak világosan kiemelkednek</span>
        <span>Ctrl + egérgörgő: szinkron zoom</span>
      </footer>
    </section>
  );
}
