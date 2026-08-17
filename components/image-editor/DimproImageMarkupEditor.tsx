"use client";

import {
  ArrowUpRight,
  Circle,
  Crop,
  Eraser,
  LoaderCircle,
  PenLine,
  RectangleHorizontal,
  Redo2,
  Save,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type EditorTool = "pen" | "arrow" | "rect" | "circle" | "text" | "crop";
type DrawableTool = Exclude<EditorTool, "crop">;

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
  points?: Point[];
};

type CropRect = { x: number; y: number; width: number; height: number };
type Snapshot = { baseImageDataUrl: string; items: MarkupItem[] };

export type DimproImageMarkupSaveResult = {
  file: File;
  width: number;
  height: number;
  markupCount: number;
};

type Props = {
  file: File;
  title?: string;
  onClose: () => void;
  onSave: (result: DimproImageMarkupSaveResult) => void | Promise<void>;
};

const COLORS = ["#dc2626", "#f59e0b", "#16a34a", "#0891b2", "#2563eb", "#111827", "#ffffff"];
const LINE_WIDTHS = [3, 6, 10, 16];

function cloneItems(items: MarkupItem[]) {
  return items.map((item) => ({ ...item, points: item.points?.map((point) => ({ ...point })) }));
}

function safeBaseName(value: string) {
  return (value || "dimpro-kep")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ _-]+/g, "_")
    .trim()
    .slice(0, 110) || "dimpro-kep";
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `markup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DimproImageMarkupEditor({ file, title = "Kép szerkesztése", onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const itemsRef = useRef<MarkupItem[]>([]);
  const pointerStartRef = useRef<Point | null>(null);
  const draftPointsRef = useRef<Point[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Kép előkészítése…");
  const [baseImageDataUrl, setBaseImageDataUrl] = useState("");
  const [items, setItems] = useState<MarkupItem[]>([]);
  const [tool, setTool] = useState<EditorTool>("pen");
  const [color, setColor] = useState("#dc2626");
  const [lineWidth, setLineWidth] = useState(6);
  const [textValue, setTextValue] = useState("");
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 750 });
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [pointerActive, setPointerActive] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const fitToStage = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !canvas.width || !canvas.height) return;
    const width = Math.max(260, stage.clientWidth - 24);
    const height = Math.max(220, stage.clientHeight - 24);
    setZoom(Math.min(1, Math.max(0.08, Math.min(width / canvas.width, height / canvas.height))));
  }, []);

  function drawItem(context: CanvasRenderingContext2D, item: MarkupItem) {
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
      context.strokeRect(Math.min(item.x, x2), Math.min(item.y, y2), Math.abs(x2 - item.x), Math.abs(y2 - item.y));
    }
    if (item.type === "circle") {
      const x2 = item.x2 ?? item.x;
      const y2 = item.y2 ?? item.y;
      context.beginPath();
      context.ellipse(item.x + (x2 - item.x) / 2, item.y + (y2 - item.y) / 2, Math.max(1, Math.abs(x2 - item.x) / 2), Math.max(1, Math.abs(y2 - item.y) / 2), 0, 0, Math.PI * 2);
      context.stroke();
    }
    if (item.type === "text") {
      const fontSize = Math.max(22, item.lineWidth * 5);
      const text = item.text || "Megjegyzés";
      context.font = `800 ${fontSize}px Arial`;
      const width = context.measureText(text).width;
      context.fillStyle = "rgba(255,255,255,.88)";
      context.fillRect(item.x - 7, item.y - fontSize - 7, width + 14, fontSize + 14);
      context.strokeStyle = item.color;
      context.lineWidth = Math.max(1, item.lineWidth / 3);
      context.strokeRect(item.x - 7, item.y - fontSize - 7, width + 14, fontSize + 14);
      context.fillStyle = item.color;
      context.fillText(text, item.x, item.y);
    }
    context.restore();
  }

  const redraw = useCallback((preview?: MarkupItem | null, draft?: Point[]) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const image = imageRef.current;
    if (!canvas || !context || !image) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    itemsRef.current.forEach((item) => drawItem(context, item));
    if (draft?.length) {
      context.save();
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(draft[0].x, draft[0].y);
      draft.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
      context.restore();
    }
    if (preview) drawItem(context, preview);
    if (cropRect) {
      context.save();
      context.fillStyle = "rgba(15,23,42,.52)";
      context.fillRect(0, 0, canvas.width, cropRect.y);
      context.fillRect(0, cropRect.y + cropRect.height, canvas.width, canvas.height - cropRect.y - cropRect.height);
      context.fillRect(0, cropRect.y, cropRect.x, cropRect.height);
      context.fillRect(cropRect.x + cropRect.width, cropRect.y, canvas.width - cropRect.x - cropRect.width, cropRect.height);
      context.strokeStyle = "#22d3ee";
      context.lineWidth = 4;
      context.setLineDash([14, 10]);
      context.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      context.restore();
    }
  }, [color, cropRect, lineWidth]);

  function recordSnapshot(nextBase = baseImageDataUrl, nextItems = itemsRef.current) {
    const snapshot = { baseImageDataUrl: nextBase, items: cloneItems(nextItems) };
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), snapshot].slice(-25);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }

  function restoreSnapshot(snapshot: Snapshot) {
    itemsRef.current = cloneItems(snapshot.items);
    setItems(cloneItems(snapshot.items));
    setCropRect(null);
    setBaseImageDataUrl(snapshot.baseImageDataUrl);
  }

  useEffect(() => {
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (cancelled) return;
      const dataUrl = String(reader.result || "");
      setBaseImageDataUrl(dataUrl);
      setHistory([{ baseImageDataUrl: dataUrl, items: [] }]);
      setHistoryIndex(0);
      setStatus("A kép szerkesztésre kész.");
      setLoading(false);
    };
    reader.onerror = () => { if (!cancelled) { setStatus("A kép nem olvasható."); setLoading(false); } };
    reader.readAsDataURL(file);
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!baseImageDataUrl) return;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, image.naturalWidth || image.width);
      canvas.height = Math.max(1, image.naturalHeight || image.height);
      setCanvasSize({ width: canvas.width, height: canvas.height });
      redraw();
      window.setTimeout(fitToStage, 60);
    };
    image.src = baseImageDataUrl;
  }, [baseImageDataUrl, fitToStage, redraw]);

  useEffect(() => { redraw(); }, [items, cropRect, redraw]);

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartRef.current = point;
    setPointerActive(true);
    if (tool === "pen") draftPointsRef.current = [point];
    if (tool === "crop") setCropRect({ x: point.x, y: point.y, width: 1, height: 1 });
    if (tool === "text") {
      const value = textValue.trim() || window.prompt("A képre kerülő rövid szöveg:", "Megjegyzés")?.trim() || "";
      if (!value) { setPointerActive(false); return; }
      const next = [...itemsRef.current, { id: randomId(), type: "text" as const, color, lineWidth, x: point.x, y: point.y, text: value }];
      itemsRef.current = next;
      setItems(next);
      recordSnapshot(baseImageDataUrl, next);
      setPointerActive(false);
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointerActive) return;
    const start = pointerStartRef.current;
    if (!start) return;
    const point = canvasPoint(event);
    if (tool === "pen") {
      draftPointsRef.current = [...draftPointsRef.current, point];
      redraw(null, draftPointsRef.current);
      return;
    }
    if (tool === "crop") {
      setCropRect({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
      return;
    }
    if (["arrow", "rect", "circle"].includes(tool)) {
      redraw({ id: "preview", type: tool as "arrow" | "rect" | "circle", color, lineWidth, x: start.x, y: start.y, x2: point.x, y2: point.y });
    }
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointerActive) return;
    const start = pointerStartRef.current;
    const point = canvasPoint(event);
    if (tool === "pen" && draftPointsRef.current.length > 1) {
      const points = draftPointsRef.current;
      const next = [...itemsRef.current, { id: randomId(), type: "pen" as const, color, lineWidth, x: points[0].x, y: points[0].y, points }];
      itemsRef.current = next;
      setItems(next);
      recordSnapshot(baseImageDataUrl, next);
    } else if (start && ["arrow", "rect", "circle"].includes(tool) && Math.hypot(point.x - start.x, point.y - start.y) > 8) {
      const next = [...itemsRef.current, { id: randomId(), type: tool as "arrow" | "rect" | "circle", color, lineWidth, x: start.x, y: start.y, x2: point.x, y2: point.y }];
      itemsRef.current = next;
      setItems(next);
      recordSnapshot(baseImageDataUrl, next);
    }
    pointerStartRef.current = null;
    draftPointsRef.current = [];
    setPointerActive(false);
    redraw();
  }

  function renderedCanvas() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return null;
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, output.width, output.height);
    itemsRef.current.forEach((item) => drawItem(context, item));
    return output;
  }

  function applyCrop() {
    const rendered = renderedCanvas();
    if (!rendered || !cropRect || cropRect.width < 20 || cropRect.height < 20) return;
    const x = Math.max(0, Math.round(cropRect.x));
    const y = Math.max(0, Math.round(cropRect.y));
    const width = Math.min(rendered.width - x, Math.max(1, Math.round(cropRect.width)));
    const height = Math.min(rendered.height - y, Math.max(1, Math.round(cropRect.height)));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    output.getContext("2d")?.drawImage(rendered, x, y, width, height, 0, 0, width, height);
    const dataUrl = output.toDataURL("image/jpeg", 0.92);
    itemsRef.current = [];
    setItems([]);
    setCropRect(null);
    setBaseImageDataUrl(dataUrl);
    recordSnapshot(dataUrl, []);
    setStatus("A kivágás alkalmazva.");
  }

  function undo() {
    if (historyIndex <= 0) return;
    const index = historyIndex - 1;
    setHistoryIndex(index);
    restoreSnapshot(history[index]);
  }

  function redo() {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return;
    const index = historyIndex + 1;
    setHistoryIndex(index);
    restoreSnapshot(history[index]);
  }

  async function save() {
    if (saving) return;
    const output = renderedCanvas();
    if (!output) return;
    setSaving(true);
    setStatus("Szerkesztett kép mentése…");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((value) => value ? resolve(value) : reject(new Error("A szerkesztett kép nem hozható létre.")), "image/jpeg", 0.9));
      const editedFile = new File([blob], `${safeBaseName(file.name)}_jelolt.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      await onSave({ file: editedFile, width: output.width, height: output.height, markupCount: itemsRef.current.length });
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A szerkesztett kép mentése sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  const tools: Array<{ value: EditorTool; label: string; icon: typeof PenLine }> = [
    { value: "pen", label: "Toll", icon: PenLine },
    { value: "arrow", label: "Nyíl", icon: ArrowUpRight },
    { value: "rect", label: "Téglalap", icon: RectangleHorizontal },
    { value: "circle", label: "Kör", icon: Circle },
    { value: "text", label: "Szöveg", icon: Type },
    { value: "crop", label: "Kivágás", icon: Crop },
  ];

  return (
    <div className="fixed inset-0 z-[16000] bg-slate-950/80 p-1.5 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="DIMPRO képszerkesztő">
      <div className="mx-auto flex h-[calc(100dvh-0.75rem)] max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[calc(100dvh-2rem)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2">
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.12em] text-teal-700">DIMPRO Képjelölő</p><h2 className="truncate text-sm font-black text-slate-950">{title}</h2></div>
          <button type="button" onClick={undo} disabled={historyIndex <= 0} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30" aria-label="Visszavonás"><Undo2 size={16} /></button>
          <button type="button" onClick={redo} disabled={historyIndex < 0 || historyIndex >= history.length - 1} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30" aria-label="Újra"><Redo2 size={16} /></button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2" aria-label="Bezárás"><X size={17} /></button>
        </header>

        <div className="shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2">
          <div className="flex min-w-max items-center gap-1.5">
            {tools.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => { setTool(value); if (value !== "crop") setCropRect(null); }} className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black ${tool === value ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600"}`}><Icon size={15} />{label}</button>)}
          </div>
          <div className="mt-2 flex min-w-max items-center gap-2">
            {COLORS.map((entry) => <button key={entry} type="button" onClick={() => setColor(entry)} className={`h-7 w-7 rounded-full border-2 ${color === entry ? "border-slate-950" : "border-white shadow"}`} style={{ backgroundColor: entry }} aria-label={`Szín ${entry}`} />)}
            <select value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black">{LINE_WIDTHS.map((value) => <option key={value} value={value}>{value === 3 ? "Vékony" : value === 6 ? "Közepes" : value === 10 ? "Vastag" : "Extra"}</option>)}</select>
            {tool === "text" ? <input value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Rövid felirat" className="h-8 w-40 rounded-lg border border-slate-200 bg-white px-2 text-[12px]" /> : null}
            {tool === "crop" && cropRect ? <button type="button" onClick={applyCrop} className="h-8 rounded-lg bg-cyan-700 px-3 text-[10px] font-black text-white">Kivágás alkalmazása</button> : null}
            <button type="button" disabled={!items.length} onClick={() => { itemsRef.current = []; setItems([]); setCropRect(null); recordSnapshot(baseImageDataUrl, []); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[10px] font-black text-rose-700 disabled:opacity-35"><Eraser size={13} /> Jelölések törlése</button>
          </div>
        </div>

        <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-200 p-2 sm:p-4">
          <div className="mx-auto" style={{ width: `${canvasSize.width * zoom}px`, height: `${canvasSize.height * zoom}px` }}>
            <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className="max-w-none touch-none border border-slate-400 bg-white shadow-xl" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} />
          </div>
          {loading ? <div className="absolute inset-0 grid place-items-center bg-slate-950/30"><div className="rounded-xl bg-white p-4 text-center shadow-xl"><LoaderCircle size={24} className="mx-auto animate-spin text-teal-700" /><p className="mt-2 text-xs font-black">Kép betöltése…</p></div></div> : null}
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white p-2.5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setZoom((value) => Math.max(.08, value - .15))} className="h-10 w-10 rounded-xl border border-slate-200 font-black">−</button>
            <button type="button" onClick={fitToStage} className="h-10 min-w-16 rounded-xl border border-slate-200 px-2 text-[10px] font-black">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((value) => Math.min(4, value + .15))} className="h-10 w-10 rounded-xl border border-slate-200 font-black">+</button>
            <div className="min-w-0 flex-1 text-right text-[10px] font-semibold text-slate-500">{status}</div>
          </div>
          <button type="button" onClick={() => void save()} disabled={loading || saving} className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />} {saving ? "Mentés…" : "Szerkesztett kép mentése"}</button>
        </footer>
      </div>
    </div>
  );
}
