"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Upload } from "lucide-react";
import { uploadCommerceProductImage } from "./commerceMediaPreparation";

type MediaOverlay = {
  id: string;
  type: "WATERMARK" | "LOGO" | "STAMP" | "ARROW" | "CIRCLE" | "TEXT" | "BLUR" | string;
  payload: Record<string, unknown>;
  sortOrder: number;
  active: boolean;
};

type ProductMediaItem = {
  linkId: string;
  assetId: string;
  sortOrder: number;
  primary: boolean;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  visibility: string;
  processingStatus: string;
  createdAt: string;
  contentUrl: string;
  thumbnailUrl: string;
  overlays: MediaOverlay[];
};

type ApiResult<T> = { ok: boolean; data?: T; error?: string; code?: string };

type Props = {
  productId: string;
  onChanged?: () => void | Promise<void>;
  onError?: (message: string) => void;
};

function activeOverlays(item: ProductMediaItem) {
  return item.overlays.filter((overlay) => overlay.active);
}

function overlayLabel(type: string) {
  if (type === "WATERMARK") return "Vízjel";
  if (type === "LOGO") return "Logó";
  if (type === "STAMP") return "Bélyeg";
  if (type === "ARROW") return "Nyíl";
  if (type === "CIRCLE") return "Kör";
  if (type === "TEXT") return "Szöveg";
  if (type === "BLUR") return "Kitakarás";
  return type;
}

export function CommerceProductMediaGallery({ productId, onChanged, onError }: Props) {
  const [items, setItems] = useState<ProductMediaItem[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);

  const reportError = useCallback((cause: unknown, fallback: string) => {
    onError?.(cause instanceof Error ? cause.message : fallback);
  }, [onError]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/commerce/media/products/${productId}`, { cache: "no-store" });
      const result = await response.json() as ApiResult<ProductMediaItem[]>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A termékképek nem tölthetők be.");
      setItems(result.data);
      setActiveAssetId((current) => {
        if (current && result.data!.some((item) => item.assetId === current)) return current;
        return result.data!.find((item) => item.primary)?.assetId || result.data![0]?.assetId || null;
      });
    } catch (cause) {
      setItems([]);
      setActiveAssetId(null);
      reportError(cause, "A termékképek nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [productId, reportError]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(
    () => items.find((item) => item.assetId === activeAssetId) || items.find((item) => item.primary) || items[0] || null,
    [activeAssetId, items],
  );

  async function notifyChanged() {
    await onChanged?.();
  }

  async function uploadFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
    if (!images.length || uploading) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: images.length });
    try {
      let lastAssetId: string | null = null;
      for (let index = 0; index < images.length; index += 1) {
        setUploadProgress({ current: index + 1, total: images.length });
        const uploaded = await uploadCommerceProductImage(productId, images[index]!);
        lastAssetId = uploaded.assetId || lastAssetId;
      }
      await load();
      if (lastAssetId) setActiveAssetId(lastAssetId);
      await notifyChanged();
    } catch (cause) {
      reportError(cause, "A termékképek feltöltése sikertelen.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function saveOrder(nextItems: ProductMediaItem[], primaryAssetId: string) {
    if (!nextItems.length || savingOrder) return;
    setSavingOrder(true);
    try {
      const response = await fetch(`/api/v1/commerce/media/products/${productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetIds: nextItems.map((item) => item.assetId), primaryAssetId }),
      });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error || "A képsorrend nem menthető.");
      await load();
      await notifyChanged();
    } catch (cause) {
      reportError(cause, "A képsorrend nem menthető.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function setPrimary(assetId: string) {
    await saveOrder(items, assetId);
    setActiveAssetId(assetId);
  }

  async function moveActive(direction: -1 | 1) {
    if (!active) return;
    const index = items.findIndex((item) => item.assetId === active.assetId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    await saveOrder(next, next.find((item) => item.primary)?.assetId || active.assetId);
  }

  const activeIndex = active ? items.findIndex((item) => item.assetId === active.assetId) : -1;
  const overlays = active ? activeOverlays(active) : [];

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><ImagePlus size={18} className="text-teal-700" /><b>Termékképek</b></div>
        <span className="text-xs font-black text-slate-400">{loading ? "…" : `${items.length} kép`}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-500">Több kép is feltölthető. Az elsődleges kép jelenik meg a terméklistában.</p>

      {loading ? (
        <div className="mt-3 flex h-32 items-center justify-center rounded-2xl bg-slate-50"><Loader2 className="animate-spin text-teal-700" size={20} /></div>
      ) : active ? (
        <>
          <button type="button" onClick={() => window.open(active.contentUrl, "_blank", "noopener,noreferrer")} className="group relative mt-3 block aspect-[16/10] w-full overflow-hidden rounded-2xl bg-slate-100 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.contentUrl} alt="Termékkép előnézet" className="h-full w-full object-contain" />
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-black text-slate-700 shadow-sm">
              {active.primary ? <><Star size={12} className="fill-current text-amber-500" /> Elsődleges</> : `${activeIndex + 1}. kép`}
            </span>
            {overlays.length > 0 && <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/80 px-2 py-1 text-[11px] font-black text-white">{overlays.length} jelölés</span>}
          </button>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {items.map((item, index) => (
              <button key={item.assetId} type="button" onClick={() => setActiveAssetId(item.assetId)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-slate-100 ${active.assetId === item.assetId ? "border-teal-500" : "border-transparent"}`} title={`${index + 1}. kép${item.primary ? " · elsődleges" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                {item.primary && <span className="absolute right-1 top-1 rounded-full bg-white p-0.5 text-amber-500 shadow-sm"><Star size={11} className="fill-current" /></span>}
                {activeOverlays(item).length > 0 && <span className="absolute bottom-1 left-1 rounded bg-slate-900/80 px-1 text-[9px] font-black text-white">+{activeOverlays(item).length}</span>}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[40px_40px_1fr] gap-2">
            <button type="button" disabled={savingOrder || activeIndex <= 0} onClick={() => void moveActive(-1)} className="flex h-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-35" title="Kép mozgatása balra"><ChevronLeft size={18} /></button>
            <button type="button" disabled={savingOrder || activeIndex < 0 || activeIndex >= items.length - 1} onClick={() => void moveActive(1)} className="flex h-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-35" title="Kép mozgatása jobbra"><ChevronRight size={18} /></button>
            <button type="button" disabled={savingOrder || active.primary} onClick={() => void setPrimary(active.assetId)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-black text-amber-800 disabled:opacity-45"><Star size={15} /> {active.primary ? "Elsődleges kép" : "Legyen elsődleges"}</button>
          </div>

          {overlays.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">{overlays.map((overlay) => <span key={overlay.id} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{overlayLabel(overlay.type)}</span>)}</div>}
        </>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><ImagePlus className="mx-auto text-slate-300" size={28} /><b className="mt-2 block text-sm">Még nincs termékkép</b><p className="mt-1 text-xs font-semibold text-slate-500">Töltsön fel egy vagy több képet.</p></div>
      )}

      <label
        onDragEnter={() => setDraggingOver(true)}
        onDragLeave={() => setDraggingOver(false)}
        onDragOver={(event) => { event.preventDefault(); setDraggingOver(true); }}
        onDrop={(event) => { event.preventDefault(); setDraggingOver(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}
        className={`mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-center font-black transition ${draggingOver ? "border-teal-500 bg-teal-100 text-teal-800" : "border-teal-200 bg-teal-50 text-teal-700"} ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
        {uploadProgress ? `${uploadProgress.current}/${uploadProgress.total} kép feltöltése...` : items.length ? "További képek hozzáadása" : "Képek feltöltése vagy behúzása"}
        <input type="file" multiple accept="image/*,.heic,.heif" className="hidden" disabled={uploading} onChange={(event) => { const files=Array.from(event.target.files || []); event.currentTarget.value=""; void uploadFiles(files); }} />
      </label>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">WEB + bélyegkép készül; az eredeti nagy fájl alapból nem marad meg.</p>
    </div>
  );
}
