"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileIcon,
  FolderPlus,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  createStableDropClientUploadId,
  uploadDropInitialized,
  type DropInitializedUpload,
} from "./dropMultipartClient";
import { DropRulesButton } from "./DropUploadRulesDialog";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import { createDropClientRandomId } from "./dropClientRandomId";
import DropPackageCommentsPanel from "./DropPackageCommentsPanel";
import DropPackageFinalReportPanel from "./DropPackageFinalReportPanel";
import DropPackageDriveArchivePanel from "./DropPackageDriveArchivePanel";
import {
  getDropImageOptimizationOptions,
  prepareDropFiles,
  revokePreparedDropFile,
  type DropFileNameRule,
  type DropImageMetadataPolicy,
  type DropImageSizePreset,
  type PreparedDropFile,
} from "./dropUploadPreparation";
import { recommendedDropIntentBatchCount, requestDropUploadIntentBatch, type DropClientUploadIntent } from "./dropRobotGuardClient";
import DropHexUploadZone from "./DropHexUploadZone";
import DropImageSizeSelector from "./DropImageSizeSelector";
import DropImageMetadataSelector from "./DropImageMetadataSelector";
import { useDropAutomaticWakeLock } from "./dropMobileEvents";

type StoredFile = {
  id: string;
  group_id?: string | null;
  original_name?: string;
  display_name: string;
  size_original_bytes: number;
  size_stored_bytes: number;
  source_original_size_bytes?: number;
  optimization_saved_bytes?: number;
  optimization_saved_percent?: number;
  upload_status: string;
  processing_status: string;
  virus_scan_status: string;
  security_status?: string;
  quarantine_reason?: string | null;
  created_at: string;
};

type UploadReadiness = {
  schemaReady: boolean;
  storageCoreEnabled: boolean;
  quarantineUploadEnabled: boolean;
  storageConfigured: boolean;
  scannerAvailable: boolean;
  quarantineUploadReady: boolean;
  resumableUploadReady?: boolean;
  maxFileBytes?: number;
  chunkSizeBytes?: number;
  publicDownloadReady: boolean;
  fileUploadModesReleased: boolean;
  storageMode?: string;
  storageProvider?: string;
};

type UploadStateResponse = {
  ok: boolean;
  files: StoredFile[];
  readiness: UploadReadiness;
};

type DropImageGroup = {
  id: string;
  packageId: string;
  name: string;
  code: string;
  description: string | null;
  sortOrder: number;
  fileNamePrefix: string | null;
  sequenceStart: number;
  fileCount: number;
};

type GroupStateResponse = {
  ok: boolean;
  groups: DropImageGroup[];
};

type InitializedUpload = DropInitializedUpload;
type QueueStatus = "queued" | "preparing" | "initializing" | "uploading" | "finalizing" | "quarantined" | "failed" | "cancelled";

type QueueItem = PreparedDropFile & {
  id: string;
  groupId: string | null;
  groupName: string | null;
  status: QueueStatus;
  progress: number;
  message: string;
};

const acceptedExtensions = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv", ".txt", ".rtf", ".odt", ".ods", ".ppt", ".pptx",
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif", ".ico",
  ".zip", ".dwg", ".dxf", ".ifc", ".ifczip", ".bcf", ".bcfzip", ".xml", ".json", ".eml", ".msg",
].join(",");

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: index > 1 ? 1 : 0 }).format(current)} ${units[index]}`;
}

function queueId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${createDropClientRandomId()}`;
}

function savingsPercent(item: QueueItem) {
  if (!item.originalSize || item.uploadSize >= item.originalSize) return 0;
  return Math.round((1 - item.uploadSize / item.originalSize) * 100);
}

export default function DropPackageQuarantineUpload({
  packageInfo,
  canUpload,
  rulesAccepted,
  onOpenRules,
  onFilesChanged,
}: {
  packageInfo: { id: string; publicCode: string; title: string; mode: "image" | "file" | "zip" | "mixed" };
  canUpload: boolean;
  rulesAccepted: boolean;
  onOpenRules: () => void;
  onFilesChanged?: () => void;
}) {
  const queueRef = useRef<QueueItem[]>([]);
  const [state, setState] = useState<UploadStateResponse | null>(null);
  const [groups, setGroups] = useState<DropImageGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [nameRule, setNameRule] = useState<DropFileNameRule>("package_sequence");
  const [customPrefix, setCustomPrefix] = useState("");
  const [imageSizePreset, setImageSizePreset] = useState<DropImageSizePreset>("medium");
  const [metadataPolicy, setMetadataPolicy] = useState<DropImageMetadataPolicy>("strip");
  const [website, setWebsite] = useState("");

  useDropAutomaticWakeLock(`package-uploader:${packageInfo.id}`, preparing || running);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => () => {
    queueRef.current.forEach(revokePreparedDropFile);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fileResponse, groupResponse] = await Promise.all([
        fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageInfo.id)}/files`, { cache: "no-store" }),
        fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageInfo.id)}/groups`, { cache: "no-store" }),
      ]);
      const filePayload = await fileResponse.json() as UploadStateResponse & { error?: string };
      const groupPayload = await groupResponse.json() as GroupStateResponse & { error?: string };
      if (!fileResponse.ok) throw new Error(filePayload.error || "A csomag fájladatai nem tölthetők be.");
      if (!groupResponse.ok) throw new Error(groupPayload.error || "A képcsoportok nem tölthetők be.");
      setState(filePayload);
      setGroups(groupPayload.groups || []);
      setSelectedGroupId((current) => current && groupPayload.groups.some((group) => group.id === current)
        ? current
        : groupPayload.groups[0]?.id || "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csomag fájladatai nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [packageInfo.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const createGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (name.length < 2 || creatingGroup || running) return;
    setCreatingGroup(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageInfo.id)}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json() as { group?: DropImageGroup; error?: string };
      if (!response.ok || !payload.group) throw new Error(payload.error || "A képcsoport nem hozható létre.");
      setGroups((items) => items.some((item) => item.id === payload.group!.id) ? items : [...items, payload.group!]);
      setSelectedGroupId(payload.group.id);
      setNewGroupName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A képcsoport nem hozható létre.");
    } finally {
      setCreatingGroup(false);
    }
  }, [creatingGroup, newGroupName, packageInfo.id, running]);

  const updateQueue = useCallback((id: string, patch: Partial<Omit<QueueItem, "id" | "originalFile" | "uploadFile">>) => {
    setQueue((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const addFiles = useCallback(async (input: FileList | File[]) => {
    const files = Array.from(input || []);
    if (!files.length || preparing || running) return;
    setPreparing(true);
    setMessage("");
    try {
      const prepared = await prepareDropFiles(files, {
        packageCode: packageInfo.publicCode,
        packageTitle: packageInfo.title,
        nameRule: selectedGroup && nameRule !== "original" ? "custom_prefix" : nameRule,
        customPrefix: selectedGroup?.fileNamePrefix || selectedGroup?.code || customPrefix,
        sequenceStart: queueRef.current.length + 1,
        imageOptimization: getDropImageOptimizationOptions(imageSizePreset, metadataPolicy),
      });
      const next = prepared.map((file): QueueItem => ({
        ...file,
        id: queueId(file.originalFile),
        groupId: selectedGroup?.id || null,
        groupName: selectedGroup?.name || null,
        status: "queued",
        progress: 0,
        message: file.optimized ? "Optimalizálva · feltöltésre vár" : "Feltöltésre vár",
      }));
      setQueue((items) => [...items, ...next]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A fájlok előkészítése sikertelen.");
    } finally {
      setPreparing(false);
    }
  }, [customPrefix, imageSizePreset, metadataPolicy, nameRule, packageInfo.publicCode, packageInfo.title, preparing, running, selectedGroup]);

  const removeQueueItem = useCallback((id: string) => {
    setQueue((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed) revokePreparedDropFile(removed);
      return items.filter((item) => item.id !== id);
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((items) => {
      items.forEach(revokePreparedDropFile);
      return [];
    });
  }, []);

  const abortInitialized = useCallback(async (initialized: InitializedUpload, reason: string) => {
    await fetch(initialized.abortUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${initialized.uploadToken}`,
      },
      body: JSON.stringify({ reason }),
    }).catch(() => undefined);
  }, []);

  const runQueue = useCallback(async () => {
    if (running || !state?.readiness.quarantineUploadReady || !canUpload || !rulesAccepted) return;
    setRunning(true);
    setMessage("");
    const pending = queue.filter((item) => item.status === "queued" || item.status === "failed");
    let intentPool: DropClientUploadIntent[] = [];
    try {
      for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      if (!intentPool.length) {
        setMessage("Robotvédelmi ellenőrzés és biztonságos feltöltési engedély előkészítése…");
        intentPool = await requestDropUploadIntentBatch({
          endpoint: `/api/drop/spaces/packages/${encodeURIComponent(packageInfo.id)}/uploads/intent`,
          count: recommendedDropIntentBatchCount(pending.slice(index).map((candidate) => candidate.uploadFile.size)),
        });
        setMessage("");
      }
      const robotIntent = intentPool.shift();
      if (!robotIntent) throw new Error("A feltöltési biztonsági engedély hiányzik.");
      let initialized: InitializedUpload | null = null;
      try {
        updateQueue(item.id, { status: "initializing", progress: 0, message: "Biztonságos munkamenet létrehozása…" });
        const initResponse = await fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageInfo.id)}/uploads/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.displayName,
            originalFileName: item.originalName,
            displayFileName: item.displayName,
            sourceOriginalSizeBytes: item.originalSize,
            sizeBytes: item.uploadFile.size,
            mimeType: item.uploadFile.type || "application/octet-stream",
            groupId: item.groupId,
            clientUploadId: createStableDropClientUploadId("space", item.uploadFile),
            rulesAccepted: true,
            rulesVersion: DROP_UPLOAD_RULES_VERSION,
            rulesAcceptedAt: new Date().toISOString(),
            robotGuard: { intentToken: robotIntent.token, website },
          }),
        });
        const initPayload = await initResponse.json() as { initialized?: InitializedUpload; error?: string };
        if (!initResponse.ok || !initPayload.initialized) throw new Error(initPayload.error || "A feltöltési munkamenet nem hozható létre.");
        initialized = initPayload.initialized;
        updateQueue(item.id, { status: "uploading", progress: 0, message: "Fájl küldése a privát tárhelyre…" });
        await uploadDropInitialized({
          initialized,
          file: item.uploadFile,
          onProgress: (progress, detail) => updateQueue(item.id, { progress, message: detail }),
        });
        updateQueue(item.id, { status: "finalizing", progress: 100, message: "Integritás-ellenőrzés és karantén…" });
        const completeResponse = await fetch(initialized.completeUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${initialized.uploadToken}` },
        });
        const completePayload = await completeResponse.json() as { error?: string };
        if (!completeResponse.ok) throw new Error(completePayload.error || "A feltöltés véglegesítése sikertelen.");
        updateQueue(item.id, { status: "quarantined", progress: 100, message: "Feltöltve · vírusellenőrzés folyamatban" });
        initialized = null;
        await load();
        onFilesChanged?.();
      } catch (error) {
        const failure = error instanceof Error ? error.message : "A feltöltés sikertelen.";
        if (initialized && initialized.protocol !== "multipart") await abortInitialized(initialized, failure);
        updateQueue(item.id, {
          status: "failed",
          message: initialized?.protocol === "multipart" ? `${failure} Újrapróbáláskor a kész részek megmaradnak.` : failure,
        });
      }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A robotvédelmi feltöltési előkészítés sikertelen.");
    } finally {
      setRunning(false);
    }
  }, [abortInitialized, canUpload, load, onFilesChanged, packageInfo.id, queue, rulesAccepted, running, state?.readiness.quarantineUploadReady, updateQueue, website]);

  const totalProgress = useMemo(() => {
    const totalBytes = queue.reduce((sum, item) => sum + item.uploadFile.size, 0);
    if (!totalBytes) return 0;
    const uploadedBytes = queue.reduce((sum, item) => sum + item.uploadFile.size * (item.progress / 100), 0);
    return Math.round((uploadedBytes / totalBytes) * 100);
  }, [queue]);

  const queueSummary = useMemo(() => {
    const images = queue.filter((item) => item.uploadFile.type.startsWith("image/"));
    const originalBytes = queue.reduce((sum, item) => sum + item.originalSize, 0);
    const uploadBytes = queue.reduce((sum, item) => sum + item.uploadSize, 0);
    const savedPercent = originalBytes > 0 ? Math.max(0, Math.round((1 - uploadBytes / originalBytes) * 100)) : 0;
    return { images: images.length, uploadBytes, savedPercent };
  }, [queue]);

  const ready = Boolean(state?.readiness.quarantineUploadReady && canUpload);
  const isImagePackage = packageInfo.mode === "image" || packageInfo.mode === "mixed";
  const activeFiles = state?.files.filter((file) => file.upload_status !== "failed" && file.upload_status !== "deleted") || [];

  return (
    <section className="rounded-[1.5rem] border border-cyan-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">Kiválasztott csomag · {packageInfo.publicCode}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{packageInfo.title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Privát S3-feltöltés, szerveridős robotvédelem, automatikus vírusellenőrzés és folytatható fájlátvitel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropRulesButton accepted={rulesAccepted} onClick={onOpenRules} />
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Frissítés</button>
        </div>
      </div>

      {state?.readiness ? (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-xs font-bold leading-5 ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          {ready
            ? `A feltöltés aktív. Maximum ${formatBytes(state.readiness.maxFileBytes || 0)} / fájl${state.readiness.resumableUploadReady ? ", megszakítás után folytatható" : ""}. ${state.readiness.publicDownloadReady ? "A tiszta fájlok vírusellenőrzés után letölthetők." : "A letöltés a vírusellenőrzésig zárva marad."}`
            : !canUpload
              ? "Ehhez a csomaghoz nincs feltöltési jogosultság."
              : "A privát tárhely vagy a feltöltési kapu jelenleg nem áll készen."}
        </div>
      ) : null}

      <div className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>Weboldal<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DropHexUploadZone
          accept={acceptedExtensions}
          disabled={!ready || running}
          busy={preparing || running}
          imageMode={isImagePackage}
          allowCamera={isImagePackage}
          title={isImagePackage ? "Képek hozzáadása" : "Fájlok hozzáadása"}
          description={isImagePackage ? "Húzd ide a képeket, vagy válassz a galériából. A Nagy, Közepes vagy Kicsi képméret a jobb oldalon választható." : "Húzd ide a dokumentumokat és műszaki fájlokat, vagy tallózz a gépen."}
          progress={totalProgress}
          onFiles={(files) => addFiles(files)}
        />

        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700"><Images size={15} /> Képcsoport</p>
          <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={running || preparing || creatingGroup} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900">
            <option value="">Csoport nélkül</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.fileCount} kép</option>)}
          </select>
          <div className="mt-2 flex gap-2">
            <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createGroup(); } }} disabled={running || creatingGroup} placeholder="Új csoport neve" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900" />
            <button type="button" onClick={() => void createGroup()} disabled={newGroupName.trim().length < 2 || running || creatingGroup} aria-label="Új képcsoport létrehozása" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white disabled:bg-slate-300">{creatingGroup ? <LoaderCircle size={16} className="animate-spin" /> : <FolderPlus size={17} />}</button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">A most kiválasztott képek ebbe a csoportba kerülnek. A csoport a PDF-riportban is megjelenik.</p>

          <div className="mt-4 rounded-xl border border-teal-100 bg-white p-3">
            <DropImageSizeSelector
              value={imageSizePreset}
              onChange={setImageSizePreset}
              disabled={running || preparing}
              compact
              recommendedPreset="medium"
              preserveMetadata={metadataPolicy === "preserve"}
            />
            <div className="mt-4 border-t border-slate-200 pt-4">
              <DropImageMetadataSelector
                value={metadataPolicy}
                onChange={(next) => { setMetadataPolicy(next); if (next === "preserve") setImageSizePreset("original"); }}
                disabled={running || preparing}
              />
            </div>
          </div>

          <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-black text-slate-700">Fájlnév-beállítások</summary>
            <div className="mt-3">
              <label className="block text-[11px] font-black text-slate-600">Fájlnév
                <select value={nameRule} onChange={(event) => setNameRule(event.target.value as DropFileNameRule)} disabled={running || preparing} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold">
                  <option value="package_sequence">Csomag vagy csoport + sorszám</option><option value="date_package_sequence">Dátum + csomagnév</option><option value="custom_prefix">Egyedi előtag</option><option value="original">Eredeti név</option>
                </select>
              </label>
              {nameRule === "custom_prefix" && !selectedGroup ? <input value={customPrefix} onChange={(event) => setCustomPrefix(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold" placeholder="pl. BEJARAS_D6" /> : null}
            </div>
          </details>
        </aside>
      </div>

      {!rulesAccepted ? (
        <button type="button" onClick={onOpenRules} className="mt-4 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">A feltöltés előtt fogadd el a szabályokat</button>
      ) : null}
      {message ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">{message}</div> : null}

      {queue.length ? (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Feltöltési sor · {queue.length} fájl</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{queueSummary.images} kép · {formatBytes(queueSummary.uploadBytes)}{queueSummary.savedPercent > 0 ? ` · ${queueSummary.savedPercent}% kisebb` : ""}</p></div><strong className="text-xs text-teal-800">{totalProgress}%</strong></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-700 transition-[width]" style={{ width: `${totalProgress}%` }} /></div>
          <div className="mt-3 space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  {item.previewUrl ? <>
                    {/* Blob URL előnézet; a Next Image komponens itt nem alkalmazható. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt="" className="h-16 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" />
                  </> : <span className="grid h-16 w-20 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"><FileIcon size={22} /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-950">Eredeti: {item.originalName}</p>
                        <p className="mt-1 truncate text-xs font-bold text-teal-800">Mentési név: {item.displayName}</p>{item.groupName ? <span className="mt-1 inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-black text-teal-800">{item.groupName}</span> : null}
                      </div>
                      <StatusIcon status={item.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600">
                      <span>Eredeti méret: {formatBytes(item.originalSize)}</span>
                      <span>Feltöltési méret: {formatBytes(item.uploadSize)}</span>
                      {savingsPercent(item) > 0 ? <span className="font-black text-emerald-700">Megtakarítás: {savingsPercent(item)}%</span> : null}
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.optimizationNote}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.message}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${item.status === "failed" ? "bg-rose-600" : item.status === "quarantined" ? "bg-amber-500" : "bg-cyan-700"}`} style={{ width: `${item.progress}%` }} /></div>
                  </div>
                  {!running && ["queued", "failed", "cancelled"].includes(item.status) ? <button type="button" onClick={() => removeQueueItem(item.id)} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500"><X size={13} /></button> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="sticky bottom-2 z-20 mt-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <button type="button" onClick={() => void runQueue()} disabled={!ready || running || !rulesAccepted || !queue.some((item) => item.status === "queued" || item.status === "failed")} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 md:flex-none">{running ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />} {running ? "Feltöltés folyamatban…" : "Feltöltés indítása"}</button>
            {!running ? <button type="button" onClick={clearQueue} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700"><Trash2 size={15} /> Sor ürítése</button> : null}
          </div>
        </div>
      ) : null}

      {activeFiles.length ? (
        <div className="mt-6">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Fogadott fájlok · {activeFiles.length} db</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {activeFiles.map((file) => (
              <div key={file.id} className={`flex items-start gap-3 rounded-xl border p-3 ${file.security_status === "clean" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                {file.original_name?.match(/\.(jpe?g|png|webp|heic|heif)$/i) ? <ImageIcon className="mt-0.5 shrink-0 text-cyan-700" size={17} /> : <ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={17} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-950">{file.display_name}</p>{file.group_id ? <p className="mt-1 text-[10px] font-black text-teal-700">{groups.find((group) => group.id === file.group_id)?.name || "Képcsoport"}</p> : null}
                  {file.original_name && file.original_name !== file.display_name ? <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">Eredeti: {file.original_name}</p> : null}
                  <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-700">{formatBytes(file.size_stored_bytes || file.size_original_bytes)} · {file.security_status === "clean" ? "Tiszta · letölthető" : file.security_status === "infected" ? "Fertőzött · tiltva" : "Vírusellenőrzés folyamatban"}</p>
                  {(file.optimization_saved_percent || 0) > 0 ? <p className="mt-1 text-[10px] font-black text-emerald-700">Mobil eredeti: {formatBytes(file.source_original_size_bytes || file.size_original_bytes)} · {file.optimization_saved_percent}% méretmegtakarítás</p> : null}
                  {file.quarantine_reason ? <p className="mt-1 text-[10px] leading-4 text-amber-800">{file.quarantine_reason}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <DropPackageFinalReportPanel packageId={packageInfo.id} />
      <DropPackageDriveArchivePanel packageId={packageInfo.id} />
      <DropPackageCommentsPanel packageId={packageInfo.id} />
    </section>
  );
}

function StatusIcon({ status }: { status: QueueStatus }) {
  if (status === "quarantined") return <ShieldCheck className="shrink-0 text-amber-600" size={17} />;
  if (status === "failed") return <AlertTriangle className="shrink-0 text-rose-600" size={17} />;
  if (status === "queued") return <FileIcon className="shrink-0 text-slate-500" size={17} />;
  if (status === "cancelled") return <X className="shrink-0 text-slate-500" size={17} />;
  if (["finalizing", "preparing"].includes(status)) return <ShieldCheck className="shrink-0 animate-pulse text-cyan-700" size={17} />;
  if (status === "uploading" || status === "initializing") return <LoaderCircle className="shrink-0 animate-spin text-cyan-700" size={17} />;
  return <CheckCircle2 className="shrink-0 text-emerald-600" size={17} />;
}
