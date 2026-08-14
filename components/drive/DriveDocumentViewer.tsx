"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSearch2,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RefreshCcw,
  RotateCw,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { loadSharedPdfDocument, renderSharedPdfPage, type SharedPdfDocument } from "@/components/viewers/pdfDocumentEngine";
import type { DriveDocument } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type PreviewPayload = {
  url: string;
  mimeType: string;
  fileName: string;
  expiresAt: string;
  kind: "PDF" | "IMAGE";
};

type Props = {
  projectId: string;
  document: DriveDocument;
  compact?: boolean;
};

const rasterExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);

function viewerKind(document: DriveDocument): "PDF" | "IMAGE" | "UNSUPPORTED" {
  const extension = (document.extension || "").toLowerCase();
  if (extension === "pdf" || document.mimeType === "application/pdf") return "PDF";
  if (rasterExtensions.has(extension) || /^image\/(jpeg|png|webp|gif|bmp|avif)$/i.test(document.mimeType || "")) return "IMAGE";
  return "UNSUPPORTED";
}

function clampZoom(value: number) {
  return Math.max(0.25, Math.min(5, Number(value.toFixed(2))));
}

export default function DriveDocumentViewer({ projectId, document, compact = false }: Props) {
  const kind = useMemo(() => viewerKind(document), [document]);
  const versionId = document.currentVersion?.id || "";
  const viewerRootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<SharedPdfDocument | null>(null);
  const renderRunRef = useRef(0);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const canPreview = kind !== "UNSUPPORTED" && document.currentVersion?.status === "AVAILABLE" && Boolean(versionId);

  const loadPreview = useCallback(async () => {
    if (!canPreview) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/preview`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; preview?: PreviewPayload };
      if (!response.ok || !payload.ok || !payload.preview?.url) throw new Error(payload.error || "Az előnézeti hivatkozás nem hozható létre.");
      setPreview(payload.preview);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "A dokumentum-előnézet nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [canPreview, document.id, projectId, versionId]);

  useEffect(() => {
    setPageNumber(1);
    setPageCount(0);
    setZoom(1);
    setFitWidth(true);
    setRotation(0);
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    const target = scrollRef.current;
    if (!target) return;
    const update = () => setContainerWidth(target.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, [compact]);

  useEffect(() => {
    let cancelled = false;
    const previous = pdfRef.current;
    pdfRef.current = null;
    setPageCount(0);
    if (kind !== "PDF" || !preview?.url) return () => undefined;
    setLoading(true);
    setError("");
    loadSharedPdfDocument(preview.url)
      .then((pdf) => {
        if (cancelled) {
          void pdf.destroy?.();
          return;
        }
        void previous?.destroy?.();
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setPageNumber((current) => Math.min(Math.max(1, current), pdf.numPages || 1));
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? `PDF.js: ${caught.message}` : "A PDF.js nem tudta megnyitni a tervlapot.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [kind, preview?.url]);

  useEffect(() => () => {
    const pdf = pdfRef.current;
    pdfRef.current = null;
    void pdf?.destroy?.();
  }, []);

  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (kind !== "PDF" || !pdf || !canvas || !pageCount) return;
    const run = ++renderRunRef.current;
    setRendering(true);
    setError("");
    pdf.getPage(pageNumber)
      .then(async (page) => {
        const base = page.getViewport({ scale: 1, rotation });
        const usableWidth = Math.max(220, containerWidth - (compact ? 18 : 28));
        const fitScale = clampZoom(usableWidth / Math.max(1, base.width));
        const scale = clampZoom((fitWidth ? fitScale : 1) * zoom);
        await renderSharedPdfPage({ page, canvas, scale, rotation, maximumPixelDimension: compact ? 2400 : 3600 });
      })
      .catch((caught) => {
        if (run === renderRunRef.current) setError(caught instanceof Error ? `PDF render: ${caught.message}` : "A PDF oldal renderelése sikertelen.");
      })
      .finally(() => { if (run === renderRunRef.current) setRendering(false); });
  }, [compact, containerWidth, fitWidth, kind, pageCount, pageNumber, rotation, zoom]);

  function changeZoom(delta: number) {
    setFitWidth(false);
    setZoom((current) => clampZoom(current + delta));
  }

  function fit() {
    setFitWidth(true);
    setZoom(1);
  }

  function rotate() {
    setRotation((current) => (current + 90) % 360);
  }

  async function fullscreen() {
    try { await viewerRootRef.current?.requestFullscreen?.(); } catch { /* böngésző elutasíthatja */ }
  }

  function openExternal() {
    if (preview?.url) window.open(preview.url, "_blank", "noopener,noreferrer");
  }

  if (kind === "UNSUPPORTED") {
    return (
      <div className={`${styles.driveViewerUnsupported} ${compact ? styles.driveViewerCompact : ""}`}>
        <FileSearch2 size={compact ? 22 : 28} />
        <strong>Ehhez a fájltípushoz még nincs inline előnézet.</strong>
        <span>PDF, JPG, PNG, WEBP, GIF, BMP és AVIF közvetlenül megjeleníthető. A dokumentum továbbra is letölthető.</span>
      </div>
    );
  }

  if (!canPreview) {
    return (
      <div className={`${styles.driveViewerUnsupported} ${compact ? styles.driveViewerCompact : ""}`}>
        <FileSearch2 size={compact ? 22 : 28} />
        <strong>Az aktuális verzió még nem előnézhető.</strong>
        <span>Inline megjelenítéshez AVAILABLE állapotú tárhelyverzió szükséges.</span>
      </div>
    );
  }

  return (
    <div ref={viewerRootRef} className={`${styles.driveViewer} ${compact ? styles.driveViewerCompact : ""}`}>
      <div className={styles.driveViewerToolbar}>
        <div className={styles.driveViewerToolGroup}>
          {kind === "PDF" ? <FileSearch2 size={13} /> : <ImageIcon size={13} />}
          <strong>{kind === "PDF" ? "PDF tervnéző" : "Képnéző"}</strong>
        </div>
        {kind === "PDF" && (
          <div className={styles.driveViewerToolGroup}>
            <button type="button" onClick={() => setPageNumber((current) => Math.max(1, current - 1))} disabled={pageNumber <= 1} title="Előző oldal"><ChevronLeft size={13} /></button>
            <span className={styles.driveViewerPage}>{pageNumber} / {pageCount || "–"}</span>
            <button type="button" onClick={() => setPageNumber((current) => Math.min(pageCount || current, current + 1))} disabled={!pageCount || pageNumber >= pageCount} title="Következő oldal"><ChevronRight size={13} /></button>
          </div>
        )}
        <div className={styles.driveViewerToolbarSpacer} />
        <div className={styles.driveViewerToolGroup}>
          <button type="button" onClick={() => changeZoom(-0.15)} title="Kicsinyítés"><ZoomOut size={13} /></button>
          <span className={styles.driveViewerZoom}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => changeZoom(0.15)} title="Nagyítás"><ZoomIn size={13} /></button>
          <button type="button" className={fitWidth ? styles.driveViewerToolActive : ""} onClick={fit} title="Szélességre illesztés"><Scan size={13} /></button>
          <button type="button" onClick={rotate} title="Forgatás 90°"><RotateCw size={13} /></button>
          <button type="button" onClick={() => void loadPreview()} title="Előnézeti URL frissítése"><RefreshCcw size={13} /></button>
          <button type="button" onClick={() => void fullscreen()} title="Teljes képernyő"><Maximize2 size={13} /></button>
          <button type="button" onClick={openExternal} disabled={!preview?.url} title="Megnyitás új lapon"><ExternalLink size={13} /></button>
        </div>
      </div>

      {error && <div className={styles.driveViewerError}>{error}<button type="button" onClick={() => void loadPreview()}>Újrapróbálás</button></div>}

      <div
        ref={scrollRef}
        className={styles.driveViewerStage}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
        }}
      >
        {(loading || rendering) && <div className={styles.driveViewerLoading}><Loader2 size={20} className={styles.spin} /><span>{loading ? "Előnézet betöltése…" : "Oldal renderelése…"}</span></div>}
        {kind === "PDF" && <canvas ref={canvasRef} className={styles.driveViewerCanvas} aria-label={`${document.name} PDF előnézet`} />}
        {kind === "IMAGE" && preview?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.driveViewerImage}
            src={preview.url}
            alt={`${document.name} előnézet`}
            style={{ width: `${Math.max(25, zoom * 100)}%`, transform: `rotate(${rotation}deg)` }}
            onError={() => setError("A kép előnézete nem tölthető be. Frissítsd az előnézeti URL-t.")}
          />
        )}
      </div>
      {!compact && <div className={styles.driveViewerHint}>Ctrl + egérgörgő: zoom · a nézet görgetéssel pásztázható · az URL rövid élettartamú, projektjogosultsággal készül.</div>}
    </div>
  );
}
