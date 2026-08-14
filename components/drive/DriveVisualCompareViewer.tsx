"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Contrast,
  Check,
  Crosshair,
  Eye,
  EyeOff,
  Layers3,
  Loader2,
  Maximize2,
  Move,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Scan,
  Sparkles,
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
  return "vektoros kontúrok";
}

function autoPairFeatureLabel(key: string) {
  const normalized = key.toLocaleLowerCase("hu-HU");
  if (normalized.includes("metszes") || normalized.includes("intersection")) return "Metszéspont";
  if (normalized.includes("sarok") || normalized.includes("corner")) return "Sarok";
  if (normalized.includes("kontur") || normalized.includes("contour")) return "Kontúr";
  return "Felirat";
}

function shortRevision(document: DriveDocument) {
  return document.currentVersion?.revisionCode || `V${document.currentVersionNumber || 0}`;
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
        const diagnostics = `A: ${leftAnalysis.contentKind}, ${leftAnalysis.textItemCount} szöveg, ${leftAnalysis.closedContourCount} kontúr · B: ${rightAnalysis.contentKind}, ${rightAnalysis.textItemCount} szöveg, ${rightAnalysis.closedContourCount} kontúr`;
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
    setAutoPairReplacement(null);
    setAlignmentMessage(`Automatikus alternatíva ${index + 1}/${autoAlignmentCandidates.length} kiválasztva · ${Math.round(candidate.confidenceScore * 100)}% bizalom · RMS ${candidate.rmsError.toFixed(2)} px.`);
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
                  <div className={styles.visualCompareAutoCandidatesHeader}><strong>Illesztési alternatívák</strong><span>A javaslatok nem alkalmazódnak automatikusan</span></div>
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
                        <strong>#{index + 1} · {autoAlignmentSourceLabel(candidate.source)}</strong>
                        <span>{Math.round(candidate.confidenceScore * 100)}% · RMS {candidate.rmsError.toFixed(2)} px · {candidate.pairCount} pont</span>
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
              </div>
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
                <button type="button" onClick={() => { setAutoAlignmentSuggestion(null); setAutoAlignmentCandidates([]); setAutoAlignmentCandidateIndex(0); setAutoPairReplacement(null); }}><X size={12} /> Elvetés</button>
              </div>
            </>
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
