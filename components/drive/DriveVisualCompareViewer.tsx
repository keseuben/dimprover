"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Contrast,
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  loadSharedPdfDocument,
  renderSharedPdfPage,
  type SharedPdfDocument,
} from "@/components/viewers/pdfDocumentEngine";
import type { DriveDocument } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type CompareMode = "SIDE_BY_SIDE" | "OVERLAY" | "DIFFERENCE";
type PreviewKind = "PDF" | "IMAGE" | "UNSUPPORTED";
type Side = "left" | "right";

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
    setShowBase(true);
    setShowRevision(true);
    setLeftPageCount(0);
    setRightPageCount(0);
    void reload();
  }, [leftDocument.id, reload, rightDocument.id]);

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
  }

  function nudgeAlignment(deltaX: number, deltaY: number) {
    setAlignmentOffsetX((current) => clampAlignmentOffset(current + deltaX));
    setAlignmentOffsetY((current) => clampAlignmentOffset(current + deltaY));
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
  }

  function beginAlignmentDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!alignmentEnabled || mode === "SIDE_BY_SIDE") return;
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
    event.preventDefault();
  }

  function endAlignmentDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = alignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    alignmentDragRef.current = null;
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
  const revisionAlignmentTransform = `translate(${alignmentOffsetX}px, ${alignmentOffsetY}px) scale(${alignmentFactor})`;

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
            <span>X {alignmentOffsetX} · Y {alignmentOffsetY} · {alignmentScale.toFixed(1)}%</span>
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
            <input type="range" min="70" max="130" step="0.1" value={alignmentScale} onChange={(event) => setAlignmentScale(clampAlignmentScale(Number(event.target.value)))} />
            <strong>{alignmentScale.toFixed(1)}%</strong>
          </label>
          <div className={styles.visualCompareAlignmentActions}>
            <button type="button" onClick={alignByPageBounds} disabled={!isPdf || !ready} title="A két renderelt lap külső mérete alapján a B réteg középre és méretre igazítása"><Scan size={12} /> Lapméret</button>
            <button type="button" onClick={resetAlignment} title="B réteg geometriai igazításának nullázása"><RotateCcw size={12} /> Nullázás</button>
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
            className={`${styles.visualCompareOverlayViewport} ${alignmentEnabled ? styles.visualCompareOverlayViewportAligning : ""}`}
            style={isPdf && overlaySize.width ? { width: overlaySize.width, height: overlaySize.height } : undefined}
            onPointerDown={beginAlignmentDrag}
            onPointerMove={moveAlignmentDrag}
            onPointerUp={endAlignmentDrag}
            onPointerCancel={endAlignmentDrag}
          >
            <div className={`${styles.visualCompareOverlayTag} ${styles.visualCompareOverlayTagA}`}>A · {shortRevision(leftDocument)}</div>
            <div className={`${styles.visualCompareOverlayTag} ${styles.visualCompareOverlayTagB}`}>B · {shortRevision(rightDocument)}</div>
            {isPdf ? (
              <>
                <canvas ref={leftCanvasRef} className={`${styles.visualCompareCanvas} ${styles.visualCompareLayer}`} style={{ opacity: showBase ? 1 : 0 }} aria-label={`${leftDocument.name} overlay PDF A`} />
                <canvas ref={rightCanvasRef} className={`${styles.visualCompareCanvas} ${styles.visualCompareLayer}`} style={{ opacity: showRevision ? topOpacity : 0, mixBlendMode: topBlend, transform: revisionAlignmentTransform, transformOrigin: "top left" }} aria-label={`${rightDocument.name} overlay PDF B`} data-alignment-x={alignmentOffsetX} data-alignment-y={alignmentOffsetY} data-alignment-scale={alignmentScale} />
              </>
            ) : (
              <>
                {leftPreview?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={leftPreview.url} alt={`${leftDocument.name} overlay kép A`} className={`${styles.visualCompareImage} ${styles.visualCompareLayer}`} style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `rotate(${rotation}deg)`, opacity: showBase ? 1 : 0 }} />
                )}
                {rightPreview?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rightPreview.url} alt={`${rightDocument.name} overlay kép B`} className={`${styles.visualCompareImage} ${styles.visualCompareLayer}`} style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `${revisionAlignmentTransform} rotate(${rotation}deg)`, transformOrigin: "top left", opacity: showRevision ? topOpacity : 0, mixBlendMode: topBlend }} data-alignment-x={alignmentOffsetX} data-alignment-y={alignmentOffsetY} data-alignment-scale={alignmentScale} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <footer className={styles.visualCompareFooter}>
        <span><strong>Szinkron:</strong> oldal · zoom · illesztés · forgatás · pásztázás</span>
        <span><strong>Átfedés:</strong> B réteg átlátszóság állítható</span>
        <span><strong>Geometriai igazítás:</strong> B réteg húzás · X/Y finommozgatás · 70–130% méretkorrekció · lapméret-illesztés</span>
        <span><strong>Különbség:</strong> CSS difference blend – az eltérő vonalak világosan kiemelkednek</span>
        <span>Ctrl + egérgörgő: szinkron zoom</span>
      </footer>
    </section>
  );
}
