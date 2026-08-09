"use client";

import {
  ArrowUpRight,
  Circle,
  Crop,
  Eraser,
  Hand,
  Hash,
  Loader2,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  Redo2,
  Save,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttachmentStatus, MeetingViewRole } from "@/app/lib/meeting-assistant/types";

type Point = { x: number; y: number };
type EditorTool = "select" | "pan" | "crop" | "pen" | "arrow" | "rect" | "circle" | "text" | "number";
type DrawableTool = Exclude<EditorTool, "select" | "pan" | "crop">;

type MarkupItem = {
  id: string;
  type: DrawableTool;
  color: string;
  lineWidth: number;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  number?: number;
  points?: Point[];
};

type CropRect = { x: number; y: number; width: number; height: number };
type Snapshot = { baseImageDataUrl: string; items: MarkupItem[] };

type EditorSource = {
  id?: string;
  originalName: string;
  mimeType: string;
  uploadedBy: string;
  fileUrl?: string;
  initialDataUrl?: string;
  title?: string;
  description?: string;
  caption?: string;
  agendaItemId?: string;
  includeInAi?: boolean;
  sourceType?: "upload" | "screen_capture" | "pdf_crop" | "image_edit";
  status?: AttachmentStatus;
};

type Props = {
  meetingId: string;
  accessToken: string;
  role: MeetingViewRole;
  actorName: string;
  agenda: Array<{ id: string; order: number; title: string }>;
  source: EditorSource;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  compact?: boolean;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
  destroy?: () => void;
};

const COLORS = ["#dc2626", "#f59e0b", "#facc15", "#16a34a", "#06b6d4", "#2563eb", "#7c3aed", "#ec4899", "#111827", "#ffffff"];
const LINE_WIDTHS = [3, 6, 10, 16];

function cloneItems(items: MarkupItem[]) {
  return items.map((item) => ({
    ...item,
    points: item.points?.map((point) => ({ ...point })),
  }));
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, encoded] = dataUrl.split(",");
  const mimeType = /data:([^;]+)/.exec(meta)?.[1] || "image/jpeg";
  const binary = window.atob(encoded || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function safeBaseName(value: string) {
  return (value || "ertekezleti-kep")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _-]+/g, "_")
    .trim()
    .slice(0, 120) || "ertekezleti-kep";
}

function pointInRect(point: Point, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function itemBounds(item: MarkupItem) {
  if (item.type === "pen" && item.points?.length) {
    const xs = item.points.map((point) => point.x);
    const ys = item.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX - 18, y: minY - 18, width: Math.max(36, Math.max(...xs) - minX + 36), height: Math.max(36, Math.max(...ys) - minY + 36) };
  }
  if (item.type === "text") {
    const width = Math.max(120, (item.text || "").length * Math.max(16, item.lineWidth * 4.5));
    const height = Math.max(42, item.lineWidth * 7);
    return { x: item.x - 12, y: item.y - height, width: width + 24, height: height + 20 };
  }
  if (item.type === "number") {
    const radius = Math.max(20, item.lineWidth * 4);
    return { x: item.x - radius, y: item.y - radius, width: radius * 2, height: radius * 2 };
  }
  const x2 = item.x2 ?? item.x;
  const y2 = item.y2 ?? item.y;
  const x = Math.min(item.x, x2) - 20;
  const y = Math.min(item.y, y2) - 20;
  return { x, y, width: Math.max(40, Math.abs(x2 - item.x) + 40), height: Math.max(40, Math.abs(y2 - item.y) + 40) };
}

export default function MeetingAttachmentEditor({
  meetingId,
  accessToken,
  role,
  actorName,
  agenda,
  source,
  onClose,
  onSaved,
  compact = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const itemsRef = useRef<MarkupItem[]>([]);
  const pointerStartRef = useRef<Point | null>(null);
  const draftPointsRef = useRef<Point[]>([]);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const pdfDocumentRef = useRef<PdfDocumentLike | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("A forrás betöltése folyamatban...");
  const [baseImageDataUrl, setBaseImageDataUrl] = useState("");
  const [items, setItems] = useState<MarkupItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("pen");
  const [color, setColor] = useState("#dc2626");
  const [lineWidth, setLineWidth] = useState(6);
  const [textValue, setTextValue] = useState("");
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isPointerActive, setIsPointerActive] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [title, setTitle] = useState(source.title || safeBaseName(source.originalName));
  const [description, setDescription] = useState(source.description || source.caption || "");
  const [agendaItemId, setAgendaItemId] = useState(source.agendaItemId || "");
  const [includeInAi, setIncludeInAi] = useState(source.includeInAi ?? true);

  const isPdf = source.mimeType === "application/pdf" || source.originalName.toLowerCase().endsWith(".pdf");
  const canDraw = role === "organizer";
  const canManageMetadata = role === "organizer" || role === "editor";

  const nextNumber = useMemo(() => {
    const numbers = items.filter((item) => item.type === "number").map((item) => item.number || 0);
    return Math.max(0, ...numbers) + 1;
  }, [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const fitToStage = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !canvas.width || !canvas.height) return;
    const availableWidth = Math.max(280, stage.clientWidth - 44);
    const availableHeight = Math.max(220, stage.clientHeight - 44);
    setZoom(Math.min(1, Math.max(0.12, Number(Math.min(availableWidth / canvas.width, availableHeight / canvas.height).toFixed(2)))));
  }, []);

  function drawItem(context: CanvasRenderingContext2D, item: MarkupItem, selected = false) {
    context.save();
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineWidth = item.lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (item.type === "pen" && item.points?.length) {
      context.beginPath();
      context.moveTo(item.points[0].x, item.points[0].y);
      item.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    }

    if (item.type === "arrow") {
      const x2 = item.x2 ?? item.x;
      const y2 = item.y2 ?? item.y;
      const angle = Math.atan2(y2 - item.y, x2 - item.x);
      const head = Math.max(18, item.lineWidth * 4);
      context.beginPath();
      context.moveTo(item.x, item.y);
      context.lineTo(x2, y2);
      context.stroke();
      context.beginPath();
      context.moveTo(x2, y2);
      context.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
      context.moveTo(x2, y2);
      context.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
      context.stroke();
    }

    if (item.type === "rect") {
      const x2 = item.x2 ?? item.x;
      const y2 = item.y2 ?? item.y;
      context.setLineDash([16, 10]);
      context.strokeRect(Math.min(item.x, x2), Math.min(item.y, y2), Math.abs(x2 - item.x), Math.abs(y2 - item.y));
    }

    if (item.type === "circle") {
      const x2 = item.x2 ?? item.x;
      const y2 = item.y2 ?? item.y;
      context.setLineDash([16, 10]);
      context.beginPath();
      context.ellipse(item.x + (x2 - item.x) / 2, item.y + (y2 - item.y) / 2, Math.max(1, Math.abs(x2 - item.x) / 2), Math.max(1, Math.abs(y2 - item.y) / 2), 0, 0, Math.PI * 2);
      context.stroke();
    }

    if (item.type === "text") {
      const fontSize = Math.max(22, item.lineWidth * 5);
      context.font = `800 ${fontSize}px Arial`;
      const text = item.text || "Megjegyzés";
      const width = context.measureText(text).width;
      context.fillStyle = "rgba(255,255,255,.86)";
      context.fillRect(item.x - 8, item.y - fontSize - 7, width + 16, fontSize + 14);
      context.strokeStyle = item.color;
      context.lineWidth = Math.max(1, item.lineWidth / 3);
      context.strokeRect(item.x - 8, item.y - fontSize - 7, width + 16, fontSize + 14);
      context.fillStyle = item.color;
      context.fillText(text, item.x, item.y);
    }

    if (item.type === "number") {
      const radius = Math.max(20, item.lineWidth * 4);
      context.beginPath();
      context.arc(item.x, item.y, radius, 0, Math.PI * 2);
      context.fillStyle = item.color;
      context.fill();
      context.lineWidth = Math.max(3, item.lineWidth / 2);
      context.strokeStyle = "#ffffff";
      context.stroke();
      context.font = `900 ${Math.max(22, radius)}px Arial`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#ffffff";
      context.fillText(String(item.number || 1), item.x, item.y + 1);
    }

    if (selected) {
      const bounds = itemBounds(item);
      context.setLineDash([7, 6]);
      context.strokeStyle = "#0f172a";
      context.lineWidth = 2;
      context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    context.restore();
  }

  const redraw = useCallback((options?: { preview?: MarkupItem | null; draftPoints?: Point[]; showSelection?: boolean }) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const image = baseImageRef.current;
    if (!canvas || !context || !image) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    itemsRef.current.forEach((item) => drawItem(context, item, options?.showSelection !== false && item.id === selectedItemId));

    if (options?.draftPoints?.length) {
      context.save();
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(options.draftPoints[0].x, options.draftPoints[0].y);
      options.draftPoints.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
      context.restore();
    }
    if (options?.preview) drawItem(context, options.preview, false);

    if (cropRect) {
      context.save();
      context.fillStyle = "rgba(15,23,42,.48)";
      context.fillRect(0, 0, canvas.width, cropRect.y);
      context.fillRect(0, cropRect.y + cropRect.height, canvas.width, canvas.height - cropRect.y - cropRect.height);
      context.fillRect(0, cropRect.y, cropRect.x, cropRect.height);
      context.fillRect(cropRect.x + cropRect.width, cropRect.y, canvas.width - cropRect.x - cropRect.width, cropRect.height);
      context.strokeStyle = "#22d3ee";
      context.lineWidth = 3;
      context.setLineDash([12, 8]);
      context.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      context.restore();
    }
  }, [color, cropRect, lineWidth, selectedItemId]);

  function recordSnapshot(nextBase = baseImageDataUrl, nextItems = itemsRef.current) {
    const snapshot = { baseImageDataUrl: nextBase, items: cloneItems(nextItems) };
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), snapshot].slice(-30);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }

  function applySnapshot(snapshot: Snapshot) {
    setBaseImageDataUrl(snapshot.baseImageDataUrl);
    setItems(cloneItems(snapshot.items));
    itemsRef.current = cloneItems(snapshot.items);
    setSelectedItemId(null);
    setCropRect(null);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    applySnapshot(history[nextIndex]);
  }

  function redo() {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    applySnapshot(history[nextIndex]);
  }

  useEffect(() => {
    if (!baseImageDataUrl) return;
    const image = new Image();
    image.onload = () => {
      baseImageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, image.naturalWidth || image.width);
      canvas.height = Math.max(1, image.naturalHeight || image.height);
      setCanvasSize({ width: canvas.width, height: canvas.height });
      const context = canvas.getContext("2d");
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        itemsRef.current.forEach((item) => drawItem(context, item, item.id === selectedItemId));
      }
      window.setTimeout(fitToStage, 80);
    };
    image.onerror = () => setStatus("A kép nem jeleníthető meg.");
    image.src = baseImageDataUrl;
    // A kép újratöltése csak a forrás változásakor szükséges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImageDataUrl, fitToStage]);

  useEffect(() => {
    redraw({ showSelection: true });
  }, [items, selectedItemId, cropRect, redraw]);

  async function loadPdfPage(pageNumber: number, existingDocument?: PdfDocumentLike) {
    setLoading(true);
    setStatus(`PDF ${pageNumber}. oldalának előkészítése...`);
    try {
      let pdfDoc = existingDocument || pdfDocumentRef.current;
      if (!pdfDoc) {
        if (!source.fileUrl) throw new Error("A PDF forrás URL-je hiányzik.");
        const response = await fetch(source.fileUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("A PDF nem tölthető le.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdfModule = await import("pdfjs-dist");
        pdfModule.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        pdfDoc = await pdfModule.getDocument({ data: bytes }).promise as unknown as PdfDocumentLike;
        pdfDocumentRef.current = pdfDoc;
        setPdfPageCount(pdfDoc.numPages);
      }
      const safePage = Math.max(1, Math.min(pdfDoc.numPages, pageNumber));
      const page = await pdfDoc.getPage(safePage);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxDimension = 2200;
      const scale = Math.max(0.8, Math.min(2.4, maxDimension / Math.max(baseViewport.width, baseViewport.height)));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("A PDF rajzfelülete nem hozható létre.");
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      setPdfPage(safePage);
      setBaseImageDataUrl(dataUrl);
      setItems([]);
      itemsRef.current = [];
      setCropRect(null);
      setSelectedItemId(null);
      setHistory([{ baseImageDataUrl: dataUrl, items: [] }]);
      setHistoryIndex(0);
      setStatus(`PDF ${safePage}/${pdfDoc.numPages}. oldal betöltve.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A PDF-oldal betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadSource() {
      setLoading(true);
      setStatus("A forrás betöltése folyamatban...");
      try {
        if (isPdf) {
          await loadPdfPage(1);
          return;
        }
        let dataUrl = source.initialDataUrl || "";
        if (!dataUrl) {
          if (!source.fileUrl) throw new Error("A kép forrása hiányzik.");
          const response = await fetch(source.fileUrl, { cache: "no-store" });
          if (!response.ok) throw new Error("A kép nem tölthető le.");
          const blob = await response.blob();
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("A kép nem olvasható."));
            reader.readAsDataURL(blob);
          });
        }
        if (cancelled) return;
        setBaseImageDataUrl(dataUrl);
        setHistory([{ baseImageDataUrl: dataUrl, items: [] }]);
        setHistoryIndex(0);
        setStatus("A kép szerkesztésre kész.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "A forrás betöltése sikertelen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSource();
    return () => {
      cancelled = true;
      pdfDocumentRef.current?.destroy?.();
    };
    // A forrást a modal megnyitásakor egyszer töltjük be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function findItemAt(point: Point) {
    return [...itemsRef.current].reverse().find((item) => pointInRect(point, itemBounds(item))) || null;
  }

  function beginPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw) return;
    const point = getCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPointerActive(true);
    pointerStartRef.current = point;

    if (tool === "pan") {
      const stage = stageRef.current;
      if (stage) panRef.current = { clientX: event.clientX, clientY: event.clientY, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop };
      return;
    }

    if (tool === "select") {
      const hit = findItemAt(point);
      setSelectedItemId(hit?.id || null);
      if (hit) dragRef.current = { id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y };
      return;
    }

    if (tool === "crop") {
      setCropRect({ x: point.x, y: point.y, width: 1, height: 1 });
      return;
    }

    if (tool === "pen") {
      draftPointsRef.current = [point];
      return;
    }

    if (tool === "text") {
      const value = textValue.trim() || window.prompt("A képre kerülő rövid szöveg:", "Megjegyzés")?.trim() || "";
      if (!value) return;
      const next = [...itemsRef.current, { id: `markup-${crypto.randomUUID()}`, type: "text" as const, color, lineWidth, x: point.x, y: point.y, text: value }];
      itemsRef.current = next;
      setItems(next);
      setSelectedItemId(next[next.length - 1].id);
      recordSnapshot(baseImageDataUrl, next);
      setIsPointerActive(false);
      return;
    }

    if (tool === "number") {
      const next = [...itemsRef.current, { id: `markup-${crypto.randomUUID()}`, type: "number" as const, color, lineWidth, x: point.x, y: point.y, number: nextNumber }];
      itemsRef.current = next;
      setItems(next);
      setSelectedItemId(next[next.length - 1].id);
      recordSnapshot(baseImageDataUrl, next);
      setIsPointerActive(false);
    }
  }

  function movePointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !isPointerActive) return;
    const point = getCanvasPoint(event);

    if (tool === "pan" && panRef.current && stageRef.current) {
      stageRef.current.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.clientX);
      stageRef.current.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.clientY);
      return;
    }

    if (tool === "select" && dragRef.current) {
      const drag = dragRef.current;
      const next = itemsRef.current.map((item) => {
        if (item.id !== drag.id) return item;
        const nextX = point.x - drag.offsetX;
        const nextY = point.y - drag.offsetY;
        const deltaX = nextX - item.x;
        const deltaY = nextY - item.y;
        return {
          ...item,
          x: nextX,
          y: nextY,
          x2: item.x2 === undefined ? undefined : item.x2 + deltaX,
          y2: item.y2 === undefined ? undefined : item.y2 + deltaY,
          points: item.points?.map((entry) => ({ x: entry.x + deltaX, y: entry.y + deltaY })),
        };
      });
      itemsRef.current = next;
      setItems(next);
      return;
    }

    const start = pointerStartRef.current;
    if (!start) return;

    if (tool === "crop") {
      setCropRect({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      });
      return;
    }

    if (tool === "pen") {
      draftPointsRef.current = [...draftPointsRef.current, point];
      redraw({ draftPoints: draftPointsRef.current, showSelection: false });
      return;
    }

    if (["arrow", "rect", "circle"].includes(tool)) {
      redraw({
        preview: { id: "preview", type: tool as "arrow" | "rect" | "circle", color, lineWidth, x: start.x, y: start.y, x2: point.x, y2: point.y },
        showSelection: false,
      });
    }
  }

  function endPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !isPointerActive) return;
    const point = getCanvasPoint(event);
    const start = pointerStartRef.current;

    if (tool === "pen" && draftPointsRef.current.length > 1) {
      const points = draftPointsRef.current;
      const next = [...itemsRef.current, { id: `markup-${crypto.randomUUID()}`, type: "pen" as const, color, lineWidth, x: points[0].x, y: points[0].y, points }];
      itemsRef.current = next;
      setItems(next);
      setSelectedItemId(next[next.length - 1].id);
      recordSnapshot(baseImageDataUrl, next);
    } else if (start && ["arrow", "rect", "circle"].includes(tool) && Math.hypot(point.x - start.x, point.y - start.y) > 8) {
      const next = [...itemsRef.current, { id: `markup-${crypto.randomUUID()}`, type: tool as "arrow" | "rect" | "circle", color, lineWidth, x: start.x, y: start.y, x2: point.x, y2: point.y }];
      itemsRef.current = next;
      setItems(next);
      setSelectedItemId(next[next.length - 1].id);
      recordSnapshot(baseImageDataUrl, next);
    } else if (tool === "select" && dragRef.current) {
      recordSnapshot(baseImageDataUrl, itemsRef.current);
    }

    pointerStartRef.current = null;
    draftPointsRef.current = [];
    dragRef.current = null;
    panRef.current = null;
    setIsPointerActive(false);
    redraw({ showSelection: true });
  }

  function deleteSelected() {
    if (!selectedItemId) return;
    const next = itemsRef.current.filter((item) => item.id !== selectedItemId);
    itemsRef.current = next;
    setItems(next);
    setSelectedItemId(null);
    recordSnapshot(baseImageDataUrl, next);
  }

  function clearMarkups() {
    if (!itemsRef.current.length) return;
    itemsRef.current = [];
    setItems([]);
    setSelectedItemId(null);
    setCropRect(null);
    recordSnapshot(baseImageDataUrl, []);
  }

  function createRenderedCanvas() {
    const canvas = canvasRef.current;
    const image = baseImageRef.current;
    if (!canvas || !image) return null;
    const output = window.document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, output.width, output.height);
    itemsRef.current.forEach((item) => drawItem(context, item, false));
    return output;
  }

  function applyCrop() {
    const rendered = createRenderedCanvas();
    if (!rendered || !cropRect || cropRect.width < 20 || cropRect.height < 20) return;
    const x = Math.max(0, Math.round(cropRect.x));
    const y = Math.max(0, Math.round(cropRect.y));
    const width = Math.min(rendered.width - x, Math.max(1, Math.round(cropRect.width)));
    const height = Math.min(rendered.height - y, Math.max(1, Math.round(cropRect.height)));
    const output = window.document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) return;
    context.drawImage(rendered, x, y, width, height, 0, 0, width, height);
    const dataUrl = output.toDataURL("image/jpeg", 0.92);
    itemsRef.current = [];
    setItems([]);
    setSelectedItemId(null);
    setCropRect(null);
    setBaseImageDataUrl(dataUrl);
    recordSnapshot(dataUrl, []);
    setStatus("A kivágás alkalmazva. A korábbi jelölések a kivágott képbe kerültek.");
  }

  async function saveMetadataOnly() {
    if (!source.id || saving) return;
    setSaving(true);
    setStatus("A közös képaláírás mentése folyamatban...");
    try {
      const response = await fetch("/api/meeting-assistant/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId,
          role,
          operation: "update_attachment",
          accessToken,
          payload: {
            fileId: source.id,
            title,
            description,
            caption: description,
            agendaItemId,
            includeInAi,
            actorName,
          },
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "A közös képaláírás mentése sikertelen.");
      setStatus("A közös képaláírás elmentve. A többi résztvevő felületén is frissül.");
      await onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A mentés sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEditorChanges() {
    if (canDraw) await saveEditedAttachment();
    else await saveMetadataOnly();
  }

  async function saveEditedAttachment() {
    if (saving) return;
    const output = createRenderedCanvas();
    if (!output) return;
    setSaving(true);
    setStatus("A szerkesztett melléklet mentése folyamatban...");
    try {
      const dataUrl = output.toDataURL("image/jpeg", 0.9);
      const blob = dataUrlToBlob(dataUrl);
      const formData = new FormData();
      formData.append("file", blob, `${safeBaseName(title || source.originalName)}_szerkesztett.jpg`);
      formData.append("parentFileId", source.id || "");
      formData.append("originalName", source.originalName);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("agendaItemId", agendaItemId);
      formData.append("includeInAi", includeInAi ? "1" : "0");
      formData.append("sourceType", source.id ? (isPdf ? "pdf_crop" : "image_edit") : "screen_capture");
      formData.append("sourcePage", isPdf ? String(pdfPage) : "");
      formData.append("markupData", JSON.stringify({
        version: 1,
        sourceFileId: source.id || null,
        sourceName: source.originalName,
        sourcePage: isPdf ? pdfPage : null,
        canvas: { width: output.width, height: output.height },
        items: itemsRef.current,
        savedAt: new Date().toISOString(),
        savedBy: actorName,
      }));

      const response = await fetch(`/api/meeting-assistant/attachments/edited?meetingId=${encodeURIComponent(meetingId)}&role=${encodeURIComponent(role)}&actorName=${encodeURIComponent(actorName)}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "A szerkesztett melléklet mentése sikertelen.");
      setStatus("A szerkesztett változat külön mellékletként elmentve.");
      await onSaved();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A mentés sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  const toolButtons: Array<{ tool: EditorTool; label: string; icon: typeof PenLine }> = [
    { tool: "select", label: "Kijelölés", icon: MousePointer2 },
    { tool: "pan", label: "Mozgatás", icon: Hand },
    { tool: "crop", label: "Képmetsző", icon: Crop },
    { tool: "pen", label: "Toll", icon: PenLine },
    { tool: "arrow", label: "Nyíl", icon: ArrowUpRight },
    { tool: "rect", label: "Téglalap", icon: RectangleHorizontal },
    { tool: "circle", label: "Kör", icon: Circle },
    { tool: "text", label: "Szöveg", icon: Type },
    { tool: "number", label: "Sorszám", icon: Hash },
  ];

  return (
    <div className="fixed inset-0 z-[15000] bg-slate-950/80 p-2 backdrop-blur-sm sm:p-4">
      <div className="mx-auto flex h-[calc(100vh-1rem)] max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl sm:h-[calc(100vh-2rem)]">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-slate-950">DIMPRO Értekezleti Mellékletszerkesztő</div>
            <div className="truncate text-[10px] font-semibold text-slate-500">{source.originalName} · feltöltő: {source.uploadedBy || actorName}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={undo} disabled={historyIndex <= 0} className="rounded-lg border border-slate-200 p-2 text-slate-700 disabled:opacity-35" title="Visszavonás"><Undo2 size={16} /></button>
            <button type="button" onClick={redo} disabled={historyIndex < 0 || historyIndex >= history.length - 1} className="rounded-lg border border-slate-200 p-2 text-slate-700 disabled:opacity-35" title="Újra"><Redo2 size={16} /></button>
            <button type="button" onClick={() => void saveEditorChanges()} disabled={saving || loading || !baseImageDataUrl} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white hover:bg-teal-600 disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {canDraw ? "Mentés az asszisztensbe" : "Közös szöveg mentése"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Bezárás"><X size={17} /></button>
          </div>
        </header>

        <div className={compact ? "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_minmax(130px,30vh)]" : "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[86px_minmax(0,1fr)_330px]"}>
          <aside className={compact ? "grid grid-cols-9 gap-1 border-b border-slate-200 bg-slate-50 p-1" : "flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r"}>
            {toolButtons.map(({ tool: value, label, icon: Icon }) => (
              <button key={value} type="button" disabled={!canDraw} onClick={() => { setTool(value); setSelectedItemId(null); if (value !== "crop") setCropRect(null); }} className={`flex ${compact ? "h-9 min-w-0" : "h-14 min-w-16"} flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[8px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-45 ${tool === value ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600"}`} title={canDraw ? label : `${label} – csak a szervező használhatja`}>
                <Icon size={compact ? 15 : 17} /> <span className={compact ? "sr-only" : ""}>{label}</span>
              </button>
            ))}
          </aside>

          <main className={`relative flex min-w-0 flex-col bg-slate-200 ${compact ? "min-h-0" : "min-h-[420px]"}`}>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
              <div className="flex items-center gap-1">
                {COLORS.map((entry) => <button key={entry} type="button" onClick={() => canDraw && setColor(entry)} disabled={!canDraw} className={`h-6 w-6 rounded-full border-2 ${color === entry ? "border-slate-950" : "border-white shadow"}`} style={{ backgroundColor: entry }} title={entry} />)}
              </div>
              <select value={lineWidth} disabled={!canDraw} onChange={(event) => setLineWidth(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black">
                {LINE_WIDTHS.map((value) => <option key={value} value={value}>{value === 3 ? "Vékony" : value === 6 ? "Közepes" : value === 10 ? "Vastag" : "Extra vastag"}</option>)}
              </select>
              {tool === "text" && canDraw && <input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Ráírandó rövid szöveg" className="h-8 min-w-52 flex-1 rounded-lg border border-slate-200 px-3 text-[10px]" />}
              {tool === "crop" && cropRect && <button type="button" onClick={applyCrop} disabled={!canDraw} className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-2 text-[9px] font-black text-white"><Crop size={13} /> Kivágás alkalmazása</button>}
              <button type="button" onClick={deleteSelected} disabled={!canDraw || !selectedItemId} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[9px] font-black text-rose-700 disabled:opacity-35"><Eraser size={13} /> Kijelölt törlése</button>
              <button type="button" onClick={clearMarkups} disabled={!canDraw || !items.length} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-black text-slate-600 disabled:opacity-35">Jelölések törlése</button>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => setZoom((current) => Math.max(0.12, Number((current - 0.2).toFixed(2))))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black">−</button>
                <button type="button" onClick={fitToStage} className="min-w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-black">{Math.round(zoom * 100)}%</button>
                <button type="button" onClick={() => setZoom((current) => Math.min(4, Number((current + 0.2).toFixed(2))))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black">+</button>
              </div>
            </div>

            {isPdf && (
              <div className="flex shrink-0 items-center justify-center gap-2 border-b border-slate-300 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-600">
                <button type="button" disabled={pdfPage <= 1 || loading} onClick={() => void loadPdfPage(pdfPage - 1)} className="rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-35">Előző oldal</button>
                <span>{pdfPage} / {pdfPageCount}</span>
                <button type="button" disabled={pdfPage >= pdfPageCount || loading} onClick={() => void loadPdfPage(pdfPage + 1)} className="rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-35">Következő oldal</button>
              </div>
            )}

            <div ref={stageRef} className={`min-h-0 flex-1 overflow-auto p-4 ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : ""}`}>
              <div className="mx-auto" style={{ width: `${canvasSize.width * zoom}px`, height: `${canvasSize.height * zoom}px` }}>
                <canvas
                  ref={canvasRef}
                  onPointerDown={beginPointer}
                  onPointerMove={movePointer}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                  className="max-w-none touch-none border border-slate-400 bg-white shadow-xl"
                />
              </div>
            </div>
            {loading && <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/35"><div className="rounded-xl bg-white px-5 py-4 text-center shadow-xl"><Loader2 className="mx-auto animate-spin text-teal-700" size={26} /><div className="mt-2 text-[11px] font-black text-slate-800">Forrás előkészítése</div></div></div>}
          </main>

          <aside className={`min-h-0 overflow-y-auto border-t border-slate-200 bg-white ${compact ? "p-2" : "p-4 lg:border-l lg:border-t-0"}`}>
            {!canDraw && <div className="mb-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-[9px] font-semibold text-sky-900">A közös mellékletet minden résztvevő látja. A kép alatti közös szöveg szerkeszthető; rajzolni, a képre szöveget írni és képmetszést készíteni kizárólag a szervező tud.</div>}
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-700">Mentési adatok</div>
            <label className="mt-3 block text-[9px] font-black uppercase text-slate-500">Rövid cím</label>
            <input value={title} disabled={!canManageMetadata} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold" />
            <label className="mt-3 block text-[9px] font-black uppercase text-slate-500">Rövid leírás</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={5} className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-5" placeholder="Mit jelöl a szerkesztett képrészlet?" />
            <label className="mt-3 block text-[9px] font-black uppercase text-slate-500">Kapcsolódó napirendi pont</label>
            <select value={agendaItemId} disabled={!canManageMetadata} onChange={(event) => setAgendaItemId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold">
              <option value="">Nincs hozzárendelve</option>
              {agenda.slice().sort((a, b) => a.order - b.order).map((item) => <option key={item.id} value={item.id}>{item.order}. {item.title}</option>)}
            </select>
            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[10px] font-semibold text-indigo-950">
              <input type="checkbox" disabled={!canManageMetadata} checked={includeInAi} onChange={(event) => setIncludeInAi(event.target.checked)} className="mt-0.5" />
              <span><b>Kerüljön bele az AI-összefoglalóba</b><br /><span className="text-indigo-700">Csak az így kijelölt képek és PDF-részletek kerülnek a későbbi AI-feldolgozási csomagba.</span></span>
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[9px] leading-5 text-slate-600">
              <div><b>Eredeti fájl:</b> {source.originalName}</div>
              <div><b>Feltöltötte:</b> {source.uploadedBy || actorName}</div>
              <div><b>Szerkeszti:</b> {actorName}</div>
              {isPdf && <div><b>PDF-oldal:</b> {pdfPage}</div>}
              <div><b>Mentési elv:</b> az eredeti változat megmarad, a szerkesztett kép külön mellékletként készül.</div>
            </div>

            <div className={`mt-4 rounded-xl border p-3 text-[10px] font-semibold leading-5 ${status.toLowerCase().includes("sikertelen") || status.toLowerCase().includes("nem") ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{status}</div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export type { EditorSource as MeetingAttachmentEditorSource };
