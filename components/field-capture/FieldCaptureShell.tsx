"use client";

import { Camera, ImagePlus, LoaderCircle, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import CameraLauncher, { type CameraLauncherHandle } from "./CameraLauncher";
import CapturePreviewCard from "./CapturePreviewCard";
import OfflineQueueIndicator from "./OfflineQueueIndicator";
import PreCaptureOptionsSheet from "./PreCaptureOptionsSheet";
import { closeAndCreateFieldCaptureLocalSession, loadFieldCaptureDefaults, loadOrCreateFieldCaptureLocalSession, resetFieldCaptureDefaults, saveFieldCaptureDefaults } from "@/app/lib/field-capture/captureSessionService";
import { prepareFieldCaptureFiles } from "@/app/lib/field-capture/captureImageEngine";
import { clearFieldCaptureSession, patchFieldCaptureItem, persistFieldCaptureItem, removeFieldCaptureItem, requestFieldCapturePersistentStorage, restoreFieldCaptureItems } from "@/app/lib/field-capture/offlineQueue";
import { DEFAULT_PRE_CAPTURE_OPTIONS, FIELD_CAPTURE_MAX_ITEMS, FIELD_CAPTURE_VERSION, type FieldCaptureItem, type FieldCaptureLocalSession, type PreCaptureOptions } from "@/app/lib/field-capture/types";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function downloadToDevice(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function FieldCaptureShell() {
  const launcherRef = useRef<CameraLauncherHandle | null>(null);
  const pendingOptionsRef = useRef<PreCaptureOptions>({ ...DEFAULT_PRE_CAPTURE_OPTIONS });
  const [session, setSession] = useState<FieldCaptureLocalSession | null>(null);
  const [items, setItems] = useState<FieldCaptureItem[]>([]);
  const [defaults, setDefaults] = useState<PreCaptureOptions>({ ...DEFAULT_PRE_CAPTURE_OPTIONS });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);

  useEffect(() => {
    const current = loadOrCreateFieldCaptureLocalSession();
    setSession(current);
    const storedDefaults = loadFieldCaptureDefaults();
    setDefaults(storedDefaults);
    pendingOptionsRef.current = storedDefaults;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void requestFieldCapturePersistentStorage().then((state) => setStoragePersisted(state.persisted)).catch(() => setStoragePersisted(false));
    void restoreFieldCaptureItems(current.id).then(setItems).catch((error) => setMessage(error instanceof Error ? error.message : "A helyi capture sor nem állítható vissza."));
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const chooseSource = (options: PreCaptureOptions, source: "camera" | "gallery") => {
    pendingOptionsRef.current = options;
    if (options.rememberForSession) { saveFieldCaptureDefaults(options); setDefaults(options); }
    setSheetOpen(false);
    window.setTimeout(() => source === "camera" ? launcherRef.current?.openCamera() : launcherRef.current?.openGallery(), 40);
  };

  const onFiles = useCallback(async (files: File[]) => {
    if (!session || preparing) return;
    const remaining = FIELD_CAPTURE_MAX_ITEMS - items.length;
    if (remaining <= 0) { setMessage(`Egy terepi munkamenetben legfeljebb ${FIELD_CAPTURE_MAX_ITEMS} kép rögzíthető.`); return; }
    const selected = files.slice(0, remaining);
    setPreparing(true);
    setMessage("Képek előkészítése a közös DIMPRO Image Engine-nel…");
    try {
      const prepared = await prepareFieldCaptureFiles(selected, items.length + 1);
      const options = pendingOptionsRef.current;
      const created: FieldCaptureItem[] = [];
      for (const file of prepared) {
        const item: FieldCaptureItem = {
          id: randomId(), sessionId: session.id, sequence: file.sequenceNumber, capturedAt: file.capturedAt,
          originalName: file.originalName, displayName: file.displayName, originalSize: file.originalSize, uploadSize: file.uploadSize,
          optimized: file.optimized, optimizationNote: file.optimizationNote, width: file.width, height: file.height, previewUrl: file.previewUrl,
          uploadFile: file.uploadFile, originalFile: file.originalFile, note: "", voiceTranscript: "", status: "LOCAL_ONLY", progress: 0, error: null,
          options: { ...options }, locationStatus: "OFF", orientationStatus: "OFF",
        };
        await persistFieldCaptureItem(item);
        if (options.saveToDevice) downloadToDevice(file.originalFile);
        created.push(item);
      }
      setItems((current) => [...current, ...created]);
      setMessage(`${created.length} kép biztonságosan bekerült a helyi terepi sorba.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kép előkészítése sikertelen.");
    } finally { setPreparing(false); }
  }, [items.length, preparing, session]);

  const updateNote = async (id: string, note: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, note } : item));
    await patchFieldCaptureItem(id, { note }).catch(() => undefined);
  };
  const deleteItem = async (item: FieldCaptureItem) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    await removeFieldCaptureItem(item.id).catch(() => undefined);
    setItems((current) => current.filter((row) => row.id !== item.id));
    setMessage("A kép eltávolítva a helyi terepi sorból.");
  };
  const newSession = async () => {
    if (!session) return;
    if (items.length && !window.confirm("Az aktuális helyi terepi munkamenet képei törlődnek erről az eszközről. Biztosan új munkamenetet indít?")) return;
    items.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    await clearFieldCaptureSession(session.id).catch(() => undefined);
    const next = closeAndCreateFieldCaptureLocalSession();
    setSession(next); setItems([]); setMessage("Új terepi munkamenet indult.");
  };
  const resetDefaults = () => {
    resetFieldCaptureDefaults();
    const next = { ...DEFAULT_PRE_CAPTURE_OPTIONS };
    pendingOptionsRef.current = next; setDefaults(next); setMessage("A munkamenet alapbeállításai visszaálltak.");
  };

  return (
    <main className="min-h-[100dvh] bg-[#f3f8f8] pb-[calc(2rem+env(safe-area-inset-bottom))] text-slate-900">
      <CameraLauncher ref={launcherRef} onFiles={(files) => void onFiles(files)} />
      <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-5 sm:py-7">
        <header className="overflow-hidden rounded-[1.8rem] border border-cyan-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-cyan-950 to-teal-900 p-4 text-white sm:p-5">
            <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-cyan-200"><Camera size={24} /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.17em] text-cyan-200">DIMPRO · külön Context Module</p><h1 className="mt-1 text-xl font-black sm:text-2xl">Terepi Gyorsrögzítő <span className="text-cyan-300">DEV</span></h1><p className="mt-1 text-[11px] text-cyan-100">V{FIELD_CAPTURE_VERSION} · P0–P4 helyi capture baseline</p></div></div>
          </div>
          <div className="p-3 sm:p-4"><OfflineQueueIndicator online={online} localCount={items.length} storagePersisted={storagePersisted} /></div>
        </header>

        <section className="mt-3 rounded-[1.8rem] border border-cyan-200 bg-cyan-50/70 p-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-800">Gyors terepi rögzítés</p><h2 className="mt-1 text-lg font-black text-slate-950">Fotózzon először, a rendszer megőrzi helyben</h2><p className="mt-1 text-sm leading-6 text-slate-600">Nincs szükség stabil mobilnetre. A kép optimalizálva bekerül az offline sorba; GPS, tájolás és mentési cél képenként külön kérhető.</p>
          <button type="button" onClick={() => setSheetOpen(true)} disabled={preparing || items.length >= FIELD_CAPTURE_MAX_ITEMS} className="mt-4 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-teal-800 px-5 text-base font-black text-white shadow-lg shadow-teal-950/10 disabled:bg-slate-300">{preparing ? <LoaderCircle size={22} className="animate-spin" /> : <Plus size={24} />}{preparing ? "Kép előkészítése…" : "Új terepi kép"}</button>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500"><span>{items.length}/{FIELD_CAPTURE_MAX_ITEMS} kép</span><button type="button" onClick={() => setSheetOpen(true)} className="inline-flex items-center gap-1 font-black text-cyan-800"><ImagePlus size={14} /> Galéria/import is</button></div>
        </section>

        {message ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-950">{message}</div> : null}
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Aktuális munkamenet</p><p className="mt-1 font-mono text-[10px] text-slate-400">{session?.id || "betöltés…"}</p></div><button type="button" onClick={() => void newSession()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"><RotateCcw size={14} /> Új session</button></div>
          {items.length ? <div className="space-y-3">{items.map((item) => <CapturePreviewCard key={item.id} item={item} onNoteChange={(note) => void updateNote(item.id, note)} onVoiceCommit={(note) => void updateNote(item.id, note)} onDelete={() => void deleteItem(item)} />)}</div> : <div className="rounded-[1.8rem] border border-dashed border-slate-300 bg-white p-8 text-center"><Camera size={34} className="mx-auto text-slate-300" /><strong className="mt-3 block text-sm text-slate-700">Még nincs terepi kép ebben a munkamenetben</strong><p className="mt-1 text-xs leading-5 text-slate-500">Az első kép után itt jelenik meg a fotó, a megjegyzés, a helyi mentési állapot és a képenkénti metaadatkérés.</p></div>}
        </section>
        <section className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-3"><div className="flex items-start gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-700" /><div><strong className="text-xs text-slate-800">P0–P4 biztonsági alapelv</strong><p className="mt-1 text-[11px] leading-5 text-slate-500">A helyi queue nem tárol Drop Send-kódot, PIN-t vagy nyers upload capability tokent. A GPS és tájolás source of truth később külön strukturált capture rekord lesz, nem EXIF.</p></div></div></section>
      </div>
      <PreCaptureOptionsSheet open={sheetOpen} value={defaults} onClose={() => setSheetOpen(false)} onReset={resetDefaults} onChoose={chooseSource} />
    </main>
  );
}
