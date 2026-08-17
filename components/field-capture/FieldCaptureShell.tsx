"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  CloudUpload,
  ImagePlus,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import CameraLauncher, { type CameraLauncherHandle } from "./CameraLauncher";
import CapturePreviewCard from "./CapturePreviewCard";
import OfflineQueueIndicator from "./OfflineQueueIndicator";
import PreCaptureOptionsSheet from "./PreCaptureOptionsSheet";
import DimproImageMarkupEditor, { type DimproImageMarkupSaveResult } from "@/components/image-editor/DimproImageMarkupEditor";
import { closeAndCreateFieldCaptureLocalSession, loadFieldCaptureDefaults, loadOrCreateFieldCaptureLocalSession, resetFieldCaptureDefaults, saveFieldCaptureDefaults } from "@/app/lib/field-capture/captureSessionService";
import { prepareFieldCaptureFiles } from "@/app/lib/field-capture/captureImageEngine";
import { captureFieldLocation, captureFieldOrientation, captureFieldSensors } from "@/app/lib/field-capture/captureSensors";
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

export type TerepIdentityContext = {
  user: { fullName: string; email: string; publicCode: string; organizationName?: string | null };
  entitlementId: string;
  sessionToken: string;
  sessionExpiresAt: string;
  projects: Array<{ id: string; publicCode: string; name: string; canUploadToDrop?: boolean }>;
};

type WorkflowStep = 1 | 2 | 3;
const WORKFLOW = [
  { step: 1 as const, label: "Rögzítés" },
  { step: 2 as const, label: "Ellenőrzés" },
  { step: 3 as const, label: "Mentés" },
];

export default function FieldCaptureShell({ identity }: { identity?: TerepIdentityContext }) {
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
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>(1);
  const [editingItem, setEditingItem] = useState<FieldCaptureItem | null>(null);

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

  function goToStep(step: WorkflowStep) {
    if (step > 1 && !items.length) return;
    setWorkflowStep(step);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 30);
  }

  const chooseSource = (options: PreCaptureOptions, source: "camera" | "gallery") => {
    pendingOptionsRef.current = options;
    if (options.rememberForSession) { saveFieldCaptureDefaults(options); setDefaults(options); }
    if (source === "camera") launcherRef.current?.openCamera();
    else launcherRef.current?.openGallery();
    setSheetOpen(false);
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
          edited: false, editRevision: 0,
          options: { ...options },
          locationStatus: options.gpsEnabled ? "REQUESTING" : "OFF",
          orientationStatus: options.orientationEnabled ? "REQUESTING" : "OFF",
          location: { enabled: options.gpsEnabled, latitude: null, longitude: null, accuracyMeters: null, capturedAt: null, source: null, status: options.gpsEnabled ? "REQUESTING" : "OFF", detail: options.gpsEnabled ? "GPS mérés folyamatban…" : "GPS kikapcsolva." },
          orientation: { enabled: options.orientationEnabled, headingDegrees: null, headingAccuracyDegrees: null, directionLabel: null, capturedAt: null, source: null, status: options.orientationEnabled ? "REQUESTING" : "OFF", detail: options.orientationEnabled ? "Tájolási mérés folyamatban…" : "Tájolás kikapcsolva." },
        };
        await persistFieldCaptureItem(item);
        if (options.saveToDevice) downloadToDevice(file.originalFile);
        created.push(item);
      }
      setItems((current) => [...current, ...created]);
      setMessage(`${created.length} kép biztonságosan bekerült a helyi terepi sorba.`);
      if (options.gpsEnabled || options.orientationEnabled) {
        void captureFieldSensors(options).then(async ({ location, orientation }) => {
          const ids = new Set(created.map((item) => item.id));
          setItems((current) => current.map((item) => ids.has(item.id) ? { ...item, location, orientation, locationStatus: location.status, orientationStatus: orientation.status } : item));
          await Promise.all(created.map((item) => patchFieldCaptureItem(item.id, { location, orientation, locationStatus: location.status, orientationStatus: orientation.status }).catch(() => undefined)));
        }).catch(() => undefined);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kép előkészítése sikertelen.");
    } finally { setPreparing(false); }
  }, [items.length, preparing, session]);

  const updateNote = async (id: string, note: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, note } : item));
    await patchFieldCaptureItem(id, { note }).catch(() => undefined);
  };

  const remeasureLocation = async (item: FieldCaptureItem) => {
    const requesting = { ...item.location, enabled: true, status: "REQUESTING" as const, detail: "GPS újramérés folyamatban…" };
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, location: requesting, locationStatus: "REQUESTING" } : row));
    await patchFieldCaptureItem(item.id, { location: requesting, locationStatus: "REQUESTING" }).catch(() => undefined);
    const location = await captureFieldLocation(true);
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, location, locationStatus: location.status } : row));
    await patchFieldCaptureItem(item.id, { location, locationStatus: location.status }).catch(() => undefined);
  };

  const remeasureOrientation = async (item: FieldCaptureItem) => {
    const requesting = { ...item.orientation, enabled: true, status: "REQUESTING" as const, detail: "Kamera irányának újramérése…" };
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, orientation: requesting, orientationStatus: "REQUESTING" } : row));
    await patchFieldCaptureItem(item.id, { orientation: requesting, orientationStatus: "REQUESTING" }).catch(() => undefined);
    const orientation = await captureFieldOrientation(true);
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, orientation, orientationStatus: orientation.status } : row));
    await patchFieldCaptureItem(item.id, { orientation, orientationStatus: orientation.status }).catch(() => undefined);
  };

  const saveEditedImage = async (item: FieldCaptureItem, result: DimproImageMarkupSaveResult) => {
    setMessage("A szerkesztett kép optimalizálása…");
    try {
      const prepared = await prepareFieldCaptureFiles([result.file], item.sequence);
      const file = prepared[0];
      if (!file) throw new Error("A szerkesztett kép nem készíthető elő.");
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      const updated: FieldCaptureItem = {
        ...item,
        displayName: result.file.name,
        uploadSize: file.uploadSize,
        optimized: file.optimized,
        optimizationNote: `${file.optimizationNote} · DIMPRO Képjelölő: ${result.markupCount} jelölés`,
        width: result.width,
        height: result.height,
        previewUrl: file.previewUrl,
        uploadFile: file.uploadFile,
        edited: true,
        editRevision: item.editRevision + 1,
      };
      await persistFieldCaptureItem(updated);
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
      setMessage("A szerkesztett kép elmentve a terepi munkamenetbe.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A szerkesztett kép mentése sikertelen.");
      throw error;
    }
  };

  const deleteItem = async (item: FieldCaptureItem) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    await removeFieldCaptureItem(item.id).catch(() => undefined);
    setItems((current) => current.filter((row) => row.id !== item.id));
    setMessage("A kép eltávolítva a helyi terepi sorból.");
    if (items.length <= 1) setWorkflowStep(1);
  };

  const newSession = async () => {
    if (!session) return;
    if (items.length && !window.confirm("Az aktuális helyi terepi munkamenet képei törlődnek erről az eszközről. Biztosan új munkamenetet indít?")) return;
    items.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    await clearFieldCaptureSession(session.id).catch(() => undefined);
    const next = closeAndCreateFieldCaptureLocalSession();
    setSession(next); setItems([]); setWorkflowStep(1); setMessage("Új terepi munkamenet indult.");
  };

  const resetDefaults = () => {
    resetFieldCaptureDefaults();
    const next = { ...DEFAULT_PRE_CAPTURE_OPTIONS };
    pendingOptionsRef.current = next; setDefaults(next); setMessage("A munkamenet alapbeállításai visszaálltak.");
  };

  const editedCount = items.filter((item) => item.edited).length;
  const noteCount = items.filter((item) => item.note.trim()).length;
  const gpsCount = items.filter((item) => item.location.status === "READY" || item.location.status === "LOW_ACCURACY").length;
  const orientationCount = items.filter((item) => item.orientation.headingDegrees !== null).length;

  return (
    <main className="min-h-[100dvh] bg-[#f3f8f8] pb-[calc(7rem+env(safe-area-inset-bottom))] text-slate-900">
      <CameraLauncher ref={launcherRef} onFiles={(files) => void onFiles(files)} />
      <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-5 sm:py-7">
        <header className="overflow-hidden rounded-[1.8rem] border border-cyan-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 via-cyan-950 to-teal-900 p-4 text-white sm:p-5">
            <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-cyan-200"><Camera size={24} /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.17em] text-cyan-200">DIMPRO Drop · Terepi Gyorsrögzítő</p><h1 className="mt-1 text-xl font-black sm:text-2xl">Terepi Gyorsrögzítő <span className="text-cyan-300">DEV</span></h1><p className="mt-1 text-[11px] text-cyan-100">V{FIELD_CAPTURE_VERSION} · offline capture · GPS · kamerairány · képjelölés</p></div></div>
          </div>
          <div className="p-3 sm:p-4"><OfflineQueueIndicator online={online} localCount={items.length} storagePersisted={storagePersisted} />{identity ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-[11px] font-bold text-cyan-950"><span>{identity.user.fullName}</span><span className="text-cyan-500">·</span><span>{identity.user.email}</span><span className="ml-auto rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-cyan-800">Send licenc</span></div> : null}</div>
        </header>

        <nav className="mt-3 rounded-[1.6rem] border border-cyan-200 bg-white p-2 shadow-sm" aria-label="Terep munkafolyamat">
          <div className="grid grid-cols-3 gap-1.5">
            {WORKFLOW.map(({ step, label }) => {
              const active = workflowStep === step;
              const done = workflowStep > step;
              const enabled = step === 1 || items.length > 0;
              return <button key={step} type="button" disabled={!enabled} onClick={() => goToStep(step)} className={`min-h-14 rounded-xl px-2 text-center disabled:opacity-35 ${active ? "bg-cyan-800 text-white shadow" : done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}><span className="block text-[10px] font-black uppercase tracking-[.08em]">{step}. lépés</span><span className="mt-0.5 block text-xs font-black">{label}</span></button>;
            })}
          </div>
        </nav>

        {workflowStep === 1 ? <>
          <section className="mt-3 rounded-[1.8rem] border border-cyan-200 bg-cyan-50/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-800">1. Rögzítés</p><h2 className="mt-1 text-lg font-black text-slate-950">Fotózzon először, a rendszer megőrzi helyben</h2><p className="mt-1 text-sm leading-6 text-slate-600">Nincs szükség stabil mobilnetre. A kép optimalizálva bekerül az offline sorba; GPS, kamerairány és mentési cél képenként külön kérhető.</p>
            <button type="button" onClick={() => setSheetOpen(true)} disabled={preparing || items.length >= FIELD_CAPTURE_MAX_ITEMS} className="mt-4 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-teal-800 px-5 text-base font-black text-white shadow-lg shadow-teal-950/10 disabled:bg-slate-300">{preparing ? <LoaderCircle size={22} className="animate-spin" /> : <Plus size={24} />}{preparing ? "Kép előkészítése…" : "Új terepi kép"}</button>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500"><span>{items.length}/{FIELD_CAPTURE_MAX_ITEMS} kép</span><button type="button" onClick={() => setSheetOpen(true)} className="inline-flex items-center gap-1 font-black text-cyan-800"><ImagePlus size={14} /> Galéria/import is</button></div>
          </section>
        </> : null}

        {workflowStep === 2 ? <section className="mt-3 rounded-[1.8rem] border border-cyan-200 bg-cyan-50/70 p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-800">2. Ellenőrzés</p><h2 className="mt-1 text-lg font-black text-slate-950">Nézze át és egészítse ki a képeket</h2><p className="mt-1 text-sm leading-6 text-slate-600">Itt írhat megjegyzést, diktálhat, újramérheti a GPS-t vagy a kamera irányát, és a képet közvetlenül meg is jelölheti.</p></section> : null}

        {workflowStep === 3 ? <section className="mt-3 rounded-[1.8rem] border border-emerald-200 bg-emerald-50/80 p-4"><div className="flex items-start gap-3"><CheckCircle2 size={25} className="mt-0.5 shrink-0 text-emerald-700" /><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-800">3. Mentés</p><h2 className="mt-1 text-lg font-black text-slate-950">A helyi terepi munkamenet mentve van</h2><p className="mt-1 text-sm leading-6 text-slate-600">A képek az IndexedDB offline tárban maradnak. A P7 szerveres DIMPRO szinkron külön fejlesztési kapu lesz; addig a rendszer nem állítja, hogy a képek felhőbe kerültek.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4"><Summary value={items.length} label="kép" /><Summary value={noteCount} label="megjegyzés" /><Summary value={editedCount} label="szerkesztett" /><Summary value={gpsCount} label="GPS" /></div><div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-amber-900"><CloudUpload size={15} className="mr-1 inline" /> DIMPRO szerveres szinkron: P7 következő fejlesztési lépés. Kamerairány-adat: {orientationCount}/{items.length} kép.</div></section> : null}

        {message ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-950">{message}</div> : null}

        {workflowStep !== 3 ? <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Aktuális munkamenet</p><p className="mt-1 font-mono text-[10px] text-slate-400">{session?.id || "betöltés…"}</p></div><button type="button" onClick={() => void newSession()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"><RotateCcw size={14} /> Új session</button></div>
          {items.length ? <div className="space-y-3">{items.map((item) => <CapturePreviewCard key={item.id} item={item} reviewMode={workflowStep === 2} onNoteChange={(note) => void updateNote(item.id, note)} onVoiceCommit={(note) => void updateNote(item.id, note)} onEdit={() => setEditingItem(item)} onRemeasureLocation={() => void remeasureLocation(item)} onRemeasureOrientation={() => void remeasureOrientation(item)} onDelete={() => void deleteItem(item)} />)}</div> : <div className="rounded-[1.8rem] border border-dashed border-slate-300 bg-white p-8 text-center"><Camera size={34} className="mx-auto text-slate-300" /><strong className="mt-3 block text-sm text-slate-700">Még nincs terepi kép ebben a munkamenetben</strong><p className="mt-1 text-xs leading-5 text-slate-500">Az első kép után itt jelenik meg a fotó, a megjegyzés és a képenkénti metaadat.</p></div>}
        </section> : null}

        <section className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-3"><div className="flex items-start gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-700" /><div><strong className="text-xs text-slate-800">Terep biztonsági alapelv</strong><p className="mt-1 text-[11px] leading-5 text-slate-500">A helyi queue nem tárol Drop Send-kódot, PIN-t vagy nyers upload capability tokent. A GPS és kamerairány külön strukturált capture rekord, nem EXIF.</p></div></div></section>

        {items.length ? <div data-terep-workflow-actions className="sticky z-[130] mt-4 grid grid-cols-2 gap-2 rounded-[1.25rem] border border-cyan-100 bg-[#f3f8f8]/95 p-2 shadow-[0_-10px_30px_rgba(15,23,42,.08)] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none" style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}>
          {workflowStep > 1 ? <button type="button" onClick={() => goToStep((workflowStep - 1) as WorkflowStep)} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700"><ArrowLeft size={18} /> Vissza</button> : <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-white px-3 text-sm font-black text-cyan-900"><Plus size={18} /> Még kép</button>}
          {workflowStep < 3 ? <button type="button" onClick={() => goToStep((workflowStep + 1) as WorkflowStep)} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-cyan-800 px-3 text-sm font-black text-white">{workflowStep === 1 ? "Tovább az ellenőrzéshez" : "Tovább a mentéshez"} <ArrowRight size={18} /></button> : <button type="button" onClick={() => void newSession()} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-teal-800 px-3 text-sm font-black text-white"><RotateCcw size={17} /> Új munkamenet</button>}
        </div> : null}
      </div>

      <PreCaptureOptionsSheet open={sheetOpen} value={defaults} onClose={() => setSheetOpen(false)} onReset={resetDefaults} onChoose={chooseSource} />
      {editingItem ? <DimproImageMarkupEditor file={editingItem.uploadFile} title={`#${editingItem.sequence} · ${editingItem.displayName}`} onClose={() => setEditingItem(null)} onSave={(result) => saveEditedImage(editingItem, result)} /> : null}
    </main>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl border border-emerald-100 bg-white p-2"><strong className="block text-lg text-emerald-800">{value}</strong><span className="text-[10px] font-black uppercase text-slate-500">{label}</span></div>;
}
