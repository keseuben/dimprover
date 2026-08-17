"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Database,
  Download,
  FileText,
  FolderCog,
  FolderPlus,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import DropHexUploadZone from "./DropHexUploadZone";
import DropImageSizeSelector from "./DropImageSizeSelector";
import DropImageMetadataSelector from "./DropImageMetadataSelector";
import { requestDropMicrophonePermission } from "./dropVoicePermission";
import { DimproBrowserVoiceSession, dimproBrowserVoiceSupported } from "./dropBrowserVoiceSession";
import { createStableDropClientUploadId, uploadDropInitialized, type DropInitializedUpload } from "./dropMultipartClient";
import { buildDropPhotoDisplayName, getDropImageOptimizationOptions, prepareDropFiles, revokePreparedDropFile, sanitizeDropManualFileName, sanitizeDropOriginalFileName, type DropFileNameRule, type DropImageMetadataPolicy, type DropImageSizePreset, type PreparedDropFile } from "./dropUploadPreparation";
import { recommendedDropIntentBatchCount, requestDropUploadIntentBatch, type DropClientUploadIntent } from "./dropRobotGuardClient";
import { createDropClientRandomId } from "./dropClientRandomId";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import {
  dispatchDropLocalNotification,
  DROP_UPLOAD_RESUME_EVENT,
  registerDropBackgroundResume,
  useDropAutomaticWakeLock,
} from "./dropMobileEvents";
import {
  clearDropQueuePackage,
  patchDropQueueItem,
  persistDropQueueItem,
  pruneDropQueueStore,
  removeDropQueueItem,
  requestDropPersistentStorage,
  restoreDropQueue,
  type DropPersistedQueueStatus,
} from "./dropOfflineQueueStore";
import {
  dropFetchWithRetry,
  getDropNetworkState,
  subscribeDropNetworkState,
  waitForDropOnline,
  type DropNetworkState,
} from "./dropNetworkClient";

type Status = "queued" | "paused" | "initializing" | "uploading" | "finalizing" | "quarantined" | "failed";
type Item = PreparedDropFile & {
  id: string;
  clientUploadId: string;
  status: Status;
  progress: number;
  message: string;
  comment: string;
  fileId?: string | null;
  autoResume: boolean;
  groupId: string | null;
  groupName: string | null;
};
type DropImageGroup = {
  id: string;
  packageId: string;
  name: string;
  code: string;
  fileNamePrefix: string | null;
  fileCount: number;
};
type VoiceFeedbackState = "recording" | "processing" | "ready" | "error" | "cancelled";
type VoiceFeedback = { state: VoiceFeedbackState; text: string };
type DropReportMode = "none" | "generate_only" | "generate_send";
export const DROP_QUICK_SEND_WORKFLOW_STEPS = ["Beállítások", "Képek", "Ellenőrzés", "Mentés", "Riport", "Lezárás"] as const;
type DeletedUndo = { item: Item; index: number };

type Props = {
  packageInfo: {
    id: string;
    publicCode: string;
    title: string;
    expiresAt: string;
    maxFileCount: number;
    maxFileSizeBytes: number;
    maxTotalSizeBytes: number;
    currentFileCount?: number;
    currentTotalSizeBytes?: number;
  };
  uploadToken: string;
  allowFileComments: boolean;
  imageOnly?: boolean;
  defaultImageSizePreset?: DropImageSizePreset;
  remindGalleryCleanup?: boolean;
  allowImageGroups?: boolean;
  allowQuickVoiceNote?: boolean;
  quickVoiceSecondsPerNote?: number;
  uploaderName?: string;
  initialWorkflowStep?: number;
  onStartNewTransfer?: () => void;
  onClose?: () => void;
};

const acceptedExtensions = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv", ".txt", ".rtf", ".odt", ".ods", ".ppt", ".pptx",
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif", ".ico",
  ".zip", ".dwg", ".dxf", ".ifc", ".ifczip", ".bcf", ".bcfzip", ".xml", ".json", ".eml", ".msg",
].join(",");
const acceptedImageExtensions = ".jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,.bmp,.gif,.ico";
const inputControlClass = "h-12 w-full rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current.toLocaleString("hu-HU", { maximumFractionDigits: index > 1 ? 1 : 0 })} ${units[index]}`;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
function persistedStatus(status: Status): DropPersistedQueueStatus {
  if (status === "quarantined") return "quarantined";
  if (status === "failed") return "failed";
  if (status === "paused" || status === "uploading" || status === "initializing" || status === "finalizing") return "paused";
  return "queued";
}
function pendingStatus(status: Status) { return status === "queued" || status === "paused" || status === "failed"; }
function commentEditableStatus(status: Status) { return pendingStatus(status) || status === "quarantined"; }
function groupEditableStatus(status: Status) { return pendingStatus(status) || status === "quarantined"; }

function SlideConfirm({ label, busyLabel, disabled, busy, onConfirm, className = "" }: { label: string; busyLabel?: string; disabled?: boolean; busy?: boolean; onConfirm: () => void; className?: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const reset = useCallback(() => { dragRef.current = null; setProgress(0); }, []);
  const start = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || busy) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !trackRef.current) return;
    const width = Math.max(1, trackRef.current.getBoundingClientRect().width - 56);
    setProgress(Math.max(0, Math.min(100, ((event.clientX - drag.startX) / width) * 100)));
  };
  const finish = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const confirmed = progress >= 85;
    reset();
    if (confirmed && !disabled && !busy) onConfirm();
  };
  return <div ref={trackRef} className={`relative min-h-14 min-w-[260px] flex-1 overflow-hidden rounded-2xl border border-teal-300 bg-teal-50 sm:max-w-md ${className}`}>
    <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-teal-700/15 transition-[width]" style={{ width: `${progress}%` }}/>
    <button type="button" disabled={disabled || busy} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={reset} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !disabled && !busy) { event.preventDefault(); onConfirm(); } }} className="relative flex min-h-14 w-full touch-pan-y select-none items-center gap-3 px-2 pr-4 text-left text-sm font-black text-teal-950 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`${label}. Húzza jobbra a vezérlőt, vagy használja az Enter/billentyűzetes megerősítést.`}>
      <span className="absolute top-1.5 grid h-11 w-11 place-items-center rounded-xl bg-teal-800 text-white shadow-md" style={{ left: `calc(${progress}% - ${progress * 0.56}px)`, transition: "left 120ms ease-out" }}>{busy ? <LoaderCircle size={18} className="animate-spin"/> : <ArrowRight size={19}/>}</span>
      <span className="min-w-0 flex-1 px-14 text-center">{busy ? (busyLabel || label) : progress >= 85 ? "Engedje el a véglegesítéshez" : label}</span>
    </button>
  </div>;
}

export default function DropPublicHexUploader({
  packageInfo,
  uploadToken,
  allowFileComments,
  imageOnly = false,
  defaultImageSizePreset = "medium",
  remindGalleryCleanup = false,
  allowImageGroups = false,
  allowQuickVoiceNote = false,
  quickVoiceSecondsPerNote = 60,
  uploaderName = "Publikus Drop feladó",
  initialWorkflowStep = 0,
  onStartNewTransfer,
  onClose,
}: Props) {
  const queueRef = useRef<Item[]>([]);
  const uploadAllRef = useRef<() => void>(() => undefined);
  const finalizeInFlightRef = useRef(false);
  const networkResumeTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [running, setRunning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [message, setMessage] = useState("");
  const [workflowStep, setWorkflowStep] = useState(() => Math.max(0, Math.min(DROP_QUICK_SEND_WORKFLOW_STEPS.length - 1, initialWorkflowStep)));
  const [reportMode, setReportMode] = useState<DropReportMode>("none");
  const [saveToDevice, setSaveToDevice] = useState(false);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [deletedUndo, setDeletedUndo] = useState<DeletedUndo | null>(null);
  const swipeStartRef = useRef<Record<string, { x: number; y: number; pointerId: number; axis: "pending" | "horizontal" | "vertical" }>>({});
  const deleteUndoTimerRef = useRef<number | null>(null);
  const settingsStepRef = useRef<HTMLDivElement | null>(null);
  const imagesStepRef = useRef<HTMLDivElement | null>(null);
  const reviewStepRef = useRef<HTMLDivElement | null>(null);
  const saveStepRef = useRef<HTMLDivElement | null>(null);
  const reportStepRef = useRef<HTMLDivElement | null>(null);
  const finalizeStepRef = useRef<HTMLDivElement | null>(null);
  const [imageSizePreset, setImageSizePreset] = useState<DropImageSizePreset>(defaultImageSizePreset);
  const [metadataPolicy, setMetadataPolicy] = useState<DropImageMetadataPolicy>("strip");
  const [galleryCleanupReminder, setGalleryCleanupReminder] = useState(remindGalleryCleanup);
  const [website, setWebsite] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [network, setNetwork] = useState<DropNetworkState>(() => getDropNetworkState());
  const [persistentStorage, setPersistentStorage] = useState<boolean | null>(null);
  const [restoredCount, setRestoredCount] = useState(0);
  const [expandedMobile, setExpandedMobile] = useState<Set<string>>(() => new Set());
  const [groups, setGroups] = useState<DropImageGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [visibleGroupId, setVisibleGroupId] = useState("__all__");
  const [appendGroupNameToFilename, setAppendGroupNameToFilename] = useState(true);
  const [exportGroupsAsFolders, setExportGroupsAsFolders] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [ungroupedGroupName, setUngroupedGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [fileNameRule, setFileNameRule] = useState<DropFileNameRule>("dimpro_photo");
  const [globalPhotoLabel, setGlobalPhotoLabel] = useState("helyszini_foto");
  const [groupPhotoLabels, setGroupPhotoLabels] = useState<Record<string, string>>({});
  const [lastAddedIds, setLastAddedIds] = useState<string[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [groupMutationBusy, setGroupMutationBusy] = useState("");
  const uploadZoneRef = useRef<HTMLDivElement | null>(null);
  const voiceSessionRef = useRef<DimproBrowserVoiceSession | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceTargetRef = useRef<string | null>(null);
  const [voiceItemId, setVoiceItemId] = useState<string | null>(null);
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState(Math.max(10, Math.min(60, quickVoiceSecondsPerNote)));
  const [voicePreviewText, setVoicePreviewText] = useState("");
  const [voiceFeedbackByItem, setVoiceFeedbackByItem] = useState<Record<string, VoiceFeedback>>({});

  useDropAutomaticWakeLock(`public-uploader:${packageInfo.id}`, preparing || running || finalizing);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => () => { queueRef.current.forEach(revokePreparedDropFile); abortRef.current?.abort(); voiceSessionRef.current?.abort(); if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current); if (networkResumeTimerRef.current) window.clearTimeout(networkResumeTimerRef.current); }, []);

  useEffect(() => {
    let cancelled = false;
    void(async () => {
      await pruneDropQueueStore().catch(() => 0);
      const storage = await requestDropPersistentStorage().catch(() => ({ supported: false, persisted: false, quota: null, usage: null }));
      if (!cancelled) setPersistentStorage(storage.supported ? storage.persisted : null);
      const restored = await restoreDropQueue(packageInfo.id).catch(() => []);
      if (cancelled) { restored.forEach(revokePreparedDropFile); return; }
      if (restored.length) {
        const items: Item[] = restored.map((item) => ({
          ...item,
          id: item.itemId,
          status: item.status === "paused" ? "paused" : item.status,
          fileId: item.fileId,
        }));
        setQueue(items);
        setRestoredCount(items.length);
        setMessage(`${items.length} helyi fájl visszaállítva. A már elkészült fájlrészek után folytatható a feltöltés.`);
        if (items.some((item) => item.autoResume && pendingStatus(item.status))) window.setTimeout(() => uploadAllRef.current(), 700);
      }
      setRestoring(false);
    })();
    return () => { cancelled = true; };
  }, [packageInfo.id]);

  useEffect(() => subscribeDropNetworkState((next) => {
    setNetwork(next);
    if (!next.online || !queueRef.current.some((item) => item.autoResume && pendingStatus(item.status)) || running || finalizing || delivered) return;
    if (networkResumeTimerRef.current) window.clearTimeout(networkResumeTimerRef.current);
    networkResumeTimerRef.current = window.setTimeout(() => {
      networkResumeTimerRef.current = null;
      if (getDropNetworkState().online && queueRef.current.some((item) => item.autoResume && pendingStatus(item.status))) uploadAllRef.current();
    }, 1_600);
  }), [delivered, finalizing, running]);

  useEffect(() => {
    const resume = () => {
      if (queueRef.current.some((item) => item.autoResume && pendingStatus(item.status)) && !running && !finalizing && !delivered) void uploadAllRef.current();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden" && queueRef.current.some((item) => item.autoResume && pendingStatus(item.status))) void registerDropBackgroundResume();
      if (document.visibilityState === "visible") resume();
    };
    window.addEventListener(DROP_UPLOAD_RESUME_EVENT, resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener(DROP_UPLOAD_RESUME_EVENT, resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [delivered, finalizing, running]);

  const loadGroups = useCallback(async () => {
    if (!allowImageGroups) return;
    const response = await fetch("/api/drop/access/groups", {
      headers: { Authorization: `Bearer ${uploadToken}` },
      cache: "no-store",
    });
    const payload = await response.json() as { groups?: DropImageGroup[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "A képcsoportok nem tölthetők be.");
    const next = payload.groups || [];
    setGroups(next);
    setSelectedGroupId((current) => current && next.some((group) => group.id === current) ? current : next[0]?.id || "");
  }, [allowImageGroups, uploadToken]);

  useEffect(() => {
    if (!allowImageGroups) return;
    void loadGroups().catch((error) => setMessage(error instanceof Error ? error.message : "A képcsoportok nem tölthetők be."));
  }, [allowImageGroups, loadGroups]);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) || null, [groups, selectedGroupId]);
  const selectedGroupLabelKey = selectedGroupId || "__ungrouped__";
  const composePhotoLabel = useCallback((baseValue: string, groupValue: string, appendGroup: boolean) => {
    const base = baseValue.trim() || "helyszini_foto";
    const suffix = appendGroup ? groupValue.trim() : "";
    return [base, suffix].filter(Boolean).join("_");
  }, []);
  const selectedGroupSuffix = (groupPhotoLabels[selectedGroupLabelKey] || selectedGroup?.name || "").trim();
  const effectivePhotoLabel = composePhotoLabel(globalPhotoLabel, selectedGroupSuffix, appendGroupNameToFilename);
  const visibleQueue = useMemo(() => visibleGroupId === "__all__" ? queue : queue.filter((item) => visibleGroupId === "__ungrouped__" ? !item.groupId : item.groupId === visibleGroupId), [queue, visibleGroupId]);
  const groupDisplayCount = useCallback((groupId: string | null) => {
    const localCount = queue.filter((item) => groupId ? item.groupId === groupId : !item.groupId).length;
    const serverCount = groupId ? groups.find((group) => group.id === groupId)?.fileCount || 0 : 0;
    return Math.max(localCount, serverCount);
  }, [groups, queue]);

  const createGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!allowImageGroups || name.length < 2 || creatingGroup || running) return;
    setCreatingGroup(true);
    setMessage("");
    try {
      const response = await fetch("/api/drop/access/groups", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${uploadToken}` },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json() as { group?: DropImageGroup; error?: string };
      if (!response.ok || !payload.group) throw new Error(payload.error || "A képcsoport nem hozható létre.");
      setGroups((items) => items.some((item) => item.id === payload.group!.id) ? items : [...items, payload.group!]);
      setSelectedGroupId(payload.group.id);
      setVisibleGroupId(payload.group.id);
      setNewGroupName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A képcsoport nem hozható létre.");
    } finally { setCreatingGroup(false); }
  }, [allowImageGroups, creatingGroup, newGroupName, running, uploadToken]);

  const updateGroup = useCallback(async (groupId: string, name: string) => {
    const normalized = name.trim();
    if (normalized.length < 2 || groupMutationBusy || running) return;
    setGroupMutationBusy(`update:${groupId}`);
    try {
      const response = await fetch("/api/drop/access/groups", { method: "PATCH", headers: { "content-type": "application/json", Authorization: `Bearer ${uploadToken}` }, body: JSON.stringify({ groupId, name: normalized }) });
      const payload = await response.json() as { group?: DropImageGroup; error?: string };
      if (!response.ok || !payload.group) throw new Error(payload.error || "A képcsoport nem módosítható.");
      const previous = groups.find((group) => group.id === groupId);
      setGroups((items) => items.map((group) => group.id === groupId ? payload.group! : group));
      setQueue((items) => items.map((item) => item.groupId === groupId ? { ...item, groupName: payload.group!.name } : item));
      for (const item of queueRef.current.filter((candidate) => candidate.groupId === groupId)) void patchDropQueueItem(packageInfo.id, item.id, { groupName: payload.group.name }).catch(() => undefined);
      if (previous) {
        setGroupPhotoLabels((labels) => ({ ...labels, [groupId]: labels[groupId] === previous.name ? payload.group!.name : labels[groupId] }));
      }
      setEditingGroupId(null); setEditingGroupName("");
      setMessage(`A(z) „${payload.group.name}” csoport neve módosítva.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A képcsoport nem módosítható."); } finally { setGroupMutationBusy(""); }
  }, [groupMutationBusy, groups, packageInfo.id, running, uploadToken]);

  const deleteGroup = useCallback(async (groupId: string) => {
    if (groupMutationBusy || running) return;
    const target = groups.find((group) => group.id === groupId);
    if (!target || !window.confirm(`Törli a(z) „${target.name}” logikai csoportot? A képek nem törlődnek, Csoport nélkül állapotba kerülnek.`)) return;
    setGroupMutationBusy(`delete:${groupId}`);
    try {
      const response = await fetch("/api/drop/access/groups", { method: "DELETE", headers: { "content-type": "application/json", Authorization: `Bearer ${uploadToken}` }, body: JSON.stringify({ groupId }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A képcsoport nem törölhető.");
      setGroups((items) => items.filter((group) => group.id !== groupId));
      setQueue((items) => items.map((item) => item.groupId === groupId ? { ...item, groupId: null, groupName: null } : item));
      for (const item of queueRef.current.filter((candidate) => candidate.groupId === groupId)) void patchDropQueueItem(packageInfo.id, item.id, { groupId: null, groupName: null }).catch(() => undefined);
      if (selectedGroupId === groupId) setSelectedGroupId("");
      if (visibleGroupId === groupId) setVisibleGroupId("__all__");
      setMessage(`A(z) „${target.name}” csoport törölve. A képek megmaradtak, csoport nélkül.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A képcsoport nem törölhető."); } finally { setGroupMutationBusy(""); }
  }, [groupMutationBusy, groups, packageInfo.id, running, selectedGroupId, uploadToken, visibleGroupId]);

  function chooseUploadGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setVisibleGroupId(groupId || "__ungrouped__");
    setGroupManagerOpen(false);
    window.setTimeout(() => uploadZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  const totalBytes = useMemo(() => queue.reduce((sum, item) => sum + item.uploadSize, 0), [queue]);
  const originalBytes = useMemo(() => queue.reduce((sum, item) => sum + item.originalSize, 0), [queue]);
  const totalProgress = useMemo(() => {
    if (!totalBytes) return 0;
    return Math.round(queue.reduce((sum, item) => sum + item.uploadSize * (item.progress / 100), 0) / totalBytes * 100);
  }, [queue, totalBytes]);
  const savings = originalBytes > 0 ? Math.max(0, Math.round((1 - totalBytes / originalBytes) * 100)) : 0;

  const persist = useCallback(async (item: Item) => {
    await persistDropQueueItem({
      packageId: packageInfo.id,
      itemId: item.id,
      clientUploadId: item.clientUploadId,
      blob: item.uploadFile,
      uploadName: item.uploadFile.name,
      uploadType: item.uploadFile.type,
      uploadLastModified: item.uploadFile.lastModified,
      originalName: item.originalName,
      originalType: item.originalFile.type,
      originalSize: item.originalSize,
      displayName: item.displayName,
      capturedAt: item.capturedAt,
      capturedAtSource: item.capturedAtSource,
      uploadedAt: item.uploadedAt,
      sequenceNumber: item.sequenceNumber,
      customLabel: item.customLabel,
      uploadSize: item.uploadSize,
      optimized: item.optimized,
      optimizationNote: item.optimizationNote,
      width: item.width,
      height: item.height,
      comment: item.comment,
      groupId: item.groupId,
      groupName: item.groupName,
      status: persistedStatus(item.status),
      progress: item.progress,
      message: item.message,
      fileId: item.fileId || null,
      autoResume: item.autoResume,
      createdAt: new Date().toISOString(),
      expiresAt: packageInfo.expiresAt,
    });
  }, [packageInfo.expiresAt, packageInfo.id]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (preparing || running || delivered) return;
    const incoming = Array.from(files);
    const serverFileCount = Math.max(packageInfo.currentFileCount || 0, queueRef.current.filter((item) => item.status === "quarantined").length);
    const localNotUploaded = queueRef.current.filter((item) => item.status !== "quarantined").length;
    if (serverFileCount + localNotUploaded + incoming.length > packageInfo.maxFileCount) {
      setMessage(`Legfeljebb ${packageInfo.maxFileCount} fájl küldhető.`); return;
    }
    setPreparing(true); setMessage("");
    try {
      const prepared = await prepareDropFiles(incoming, {
        packageCode: packageInfo.publicCode,
        packageTitle: packageInfo.title,
        nameRule: fileNameRule,
        customPrefix: "",
        photoLabel: fileNameRule === "dimpro_photo" ? effectivePhotoLabel : undefined,
        sequenceStart: Math.max(packageInfo.currentFileCount || 0, ...queueRef.current.map((item) => item.sequenceNumber || 0)) + 1,
        imageOptimization: getDropImageOptimizationOptions(imageSizePreset, metadataPolicy),
      });
      const tooLarge = prepared.find((item) => item.uploadSize > packageInfo.maxFileSizeBytes);
      if (tooLarge) { prepared.forEach(revokePreparedDropFile); throw new Error(`A(z) ${tooLarge.displayName} meghaladja a ${formatBytes(packageInfo.maxFileSizeBytes)} fájlméretet.`); }
      const knownServerBytes = Math.max(packageInfo.currentTotalSizeBytes || 0, queueRef.current.filter((item) => item.status === "quarantined").reduce((sum, item) => sum + item.uploadSize, 0));
      const localPendingBytes = queueRef.current.filter((item) => item.status !== "quarantined").reduce((sum, item) => sum + item.uploadSize, 0);
      const nextTotal = knownServerBytes + localPendingBytes + prepared.reduce((sum, item) => sum + item.uploadSize, 0);
      if (nextTotal > packageInfo.maxTotalSizeBytes) { prepared.forEach(revokePreparedDropFile); throw new Error(`A küldemény optimalizált mérete meghaladja a ${formatBytes(packageInfo.maxTotalSizeBytes)} keretet.`); }
      const next = prepared.map((item): Item => {
        const id = `${item.originalName}-${item.originalSize}-${createDropClientRandomId()}`;
        return {
          ...item,
          id,
          clientUploadId: createStableDropClientUploadId(`public_${packageInfo.id}_${id}`, item.uploadFile),
          status: "queued",
          progress: 0,
          message: item.optimized ? "Optimalizálva · helyben mentve" : "Helyben mentve · feltöltésre vár",
          comment: "",
          groupId: selectedGroup?.id || null,
          groupName: selectedGroup?.name || null,
          fileId: null,
          autoResume: false,
        };
      });
      await Promise.all(next.map(persist));
      setQueue((items) => [...items, ...next]);
      setLastAddedIds(next.map((item) => item.id));
      setMessage(`${next.length} fájl biztonságosan elmentve ezen a készüléken.`); setWorkflowStep(2);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A fájlok előkészítése sikertelen."); }
    finally { setPreparing(false); }
  }, [delivered, effectivePhotoLabel, fileNameRule, imageSizePreset, metadataPolicy, packageInfo.currentFileCount, packageInfo.currentTotalSizeBytes, packageInfo.id, packageInfo.maxFileCount, packageInfo.maxFileSizeBytes, packageInfo.maxTotalSizeBytes, packageInfo.publicCode, packageInfo.title, persist, preparing, running, selectedGroup]);

  function patch(id: string, value: Partial<Item>, persistPatch = false) {
    setQueue((items) => items.map((item) => item.id === id ? { ...item, ...value } : item));
    if (persistPatch) {
      const patchValue: Record<string, unknown> = {};
      if (value.comment !== undefined) patchValue.comment = value.comment;
      if (value.groupId !== undefined) patchValue.groupId = value.groupId;
      if (value.groupName !== undefined) patchValue.groupName = value.groupName;
      if (value.displayName !== undefined) patchValue.displayName = value.displayName;
      if (value.customLabel !== undefined) patchValue.customLabel = value.customLabel;
      if (value.clientUploadId !== undefined) patchValue.clientUploadId = value.clientUploadId;
      if (value.uploadFile !== undefined) {
        patchValue.uploadName = value.uploadFile.name;
        patchValue.uploadType = value.uploadFile.type;
        patchValue.uploadLastModified = value.uploadFile.lastModified;
        patchValue.uploadSize = value.uploadFile.size;
      }
      if (value.status !== undefined) patchValue.status = persistedStatus(value.status);
      if (value.progress !== undefined) patchValue.progress = value.progress;
      if (value.message !== undefined) patchValue.message = value.message;
      if (value.fileId !== undefined) patchValue.fileId = value.fileId || null;
      if (value.autoResume !== undefined) patchValue.autoResume = value.autoResume;
      void patchDropQueueItem(packageInfo.id, id, patchValue).catch(() => undefined);
    }
  }

  function setVoiceFeedback(itemId: string | null, state: VoiceFeedbackState, text: string) {
    if (!itemId) return;
    setVoiceFeedbackByItem((current) => ({ ...current, [itemId]: { state, text } }));
  }

  function finishVoiceNote(text: string, commit: boolean) {
    const targetId = voiceTargetRef.current;
    if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = null;
    voiceSessionRef.current = null;
    voiceTargetRef.current = null;
    if (commit && targetId && text) {
      const item = queueRef.current.find((candidate) => candidate.id === targetId);
      if (item && commentEditableStatus(item.status)) {
        const combined = [item.comment.trim(), text].filter(Boolean).join(item.comment.trim() ? " " : "").slice(0, 2000);
        updateComment(targetId, combined);
        setVoiceFeedback(targetId, "ready", "Átirat elkészült és bekerült a kép megjegyzésébe. Küldés előtt tovább szerkeszthető.");
        setMessage("A diktált szöveg hozzáfűzve a kép megjegyzéséhez.");
      } else {
        setVoiceFeedback(targetId, "error", "Az átirat elkészült, de a kép megjegyzése ebben az állapotban már nem módosítható.");
      }
    } else if (commit && targetId) {
      setVoiceFeedback(targetId, "error", "A diktálás lezárult, de nem érkezett felismerhető szöveg. Próbálja újra, vagy használja a telefon billentyűzetének mikrofonját.");
      setMessage("Nem érkezett felismerhető átirat a böngészőtől.");
    } else if (targetId) {
      setVoiceFeedback(targetId, "cancelled", "A diktálás megszakítva. Nem került szöveg a megjegyzésbe.");
    }
    setVoiceItemId(null);
    setVoicePreviewText("");
    setVoiceSecondsLeft(Math.max(10, Math.min(60, quickVoiceSecondsPerNote)));
  }

  function stopVoiceNote(commit = true) {
    if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = null;
    const targetId = voiceTargetRef.current;
    if (commit) setVoiceFeedback(targetId, "processing", "Diktálás lezárása · az átirat véglegesítése folyamatban…");
    const session = voiceSessionRef.current;
    if (!session) {
      finishVoiceNote("", commit);
      return;
    }
    session.stop(commit);
  }

  async function startVoiceNote(itemId: string) {
    if (!allowQuickVoiceNote || !imageOnly || !allowFileComments || finalizing || delivered) return;
    const item = queueRef.current.find((candidate) => candidate.id === itemId);
    if (!item || !commentEditableStatus(item.status)) return;
    if (typeof window === "undefined") return;
    if (!dimproBrowserVoiceSupported()) {
      setVoiceFeedback(itemId, "error", "Ezen az eszközön vagy böngészőben nincs támogatott közvetlen beszédfelismerés. Használja a telefon billentyűzetének mikrofonját vagy a kézi gépelést.");
      setMessage("A böngésző nem támogat közvetlen beszédfelismerést.");
      return;
    }
    setVoiceFeedback(itemId, "processing", "Mikrofonengedély ellenőrzése…");
    try {
      await requestDropMicrophonePermission();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "A mikrofonengedély ellenőrzése sikertelen.";
      setVoiceFeedback(itemId, "error", detail);
      setMessage(detail);
      return;
    }

    if (voiceSessionRef.current) {
      voiceSessionRef.current.abort();
      voiceSessionRef.current = null;
    }
    const maximum = Math.max(10, Math.min(60, quickVoiceSecondsPerNote));
    voiceTargetRef.current = itemId;
    setVoiceItemId(itemId);
    setVoiceSecondsLeft(maximum);
    setVoicePreviewText("");

    const session = new DimproBrowserVoiceSession({
      language: "hu-HU",
      onTranscript: (text) => {
        if (voiceTargetRef.current !== itemId) return;
        setVoicePreviewText(text);
        if (text) setVoiceFeedback(itemId, "recording", "Beszéd felismerve · a diktálás folytatódik.");
      },
      onState: (state, detail) => {
        if (voiceTargetRef.current !== itemId) return;
        if (state === "error") {
          setVoiceFeedback(itemId, "error", detail);
          setMessage(detail);
        } else {
          setVoiceFeedback(itemId, "recording", detail);
        }
      },
      onEnd: ({ text, commit }) => {
        if (voiceTargetRef.current !== itemId) return;
        finishVoiceNote(text, commit);
      },
    });
    voiceSessionRef.current = session;
    setVoiceFeedback(itemId, "recording", "DIMPRO diktálás aktív · ha a mobil böngésző megszakítja a felismerést, automatikusan folytatjuk.");
    try {
      session.start();
    } catch (error) {
      voiceSessionRef.current = null;
      voiceTargetRef.current = null;
      setVoiceItemId(null);
      const detail = error instanceof Error ? error.message : "A beszédfelismerés nem indítható el.";
      setVoiceFeedback(itemId, "error", detail);
      setMessage(detail);
      return;
    }

    voiceTimerRef.current = window.setInterval(() => {
      setVoiceSecondsLeft((current) => {
        const next = Math.max(0, current - 1);
        if (next === 0) window.setTimeout(() => stopVoiceNote(true), 0);
        return next;
      });
    }, 1000);
  }

  function renderVoiceStatus(itemId: string, compact = false) {
    const feedback = voiceFeedbackByItem[itemId];
    const active = voiceItemId === itemId;
    if (!feedback && !active) return null;
    const state = active ? (feedback?.state || "recording") : feedback?.state;
    const style = state === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : state === "ready" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : state === "processing" ? "border-amber-300 bg-amber-50 text-amber-900" : state === "cancelled" ? "border-slate-300 bg-slate-50 text-slate-700" : voiceSecondsLeft <= 5 ? "border-rose-300 bg-rose-50 text-rose-900" : voiceSecondsLeft <= 15 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-cyan-200 bg-cyan-50 text-cyan-900";
    return <div className={`mt-2 rounded-lg border ${compact ? "px-2.5 py-2 text-[11px]" : "px-3 py-2 text-xs"} font-bold ${style}`}>
      {active ? <><strong>Felvétel · hátralévő idő: 00:{String(voiceSecondsLeft).padStart(2, "0")}</strong>{voicePreviewText ? <span className="mt-1 block font-medium">Élő átirat: {voicePreviewText}</span> : <span className="mt-1 block font-medium">Beszéljen a mikrofonba…</span>}</> : null}
      {feedback?.text ? <span className={`${active ? "mt-1" : ""} block font-medium`}>{feedback.text}</span> : null}
    </div>;
  }

  function updateComment(id: string, comment: string) { patch(id, { comment }, true); }
  function renameQueuedFile(id: string, requestedName: string, customLabel?: string) {
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (!item || running || !pendingStatus(item.status)) return;
    const displayName = sanitizeDropManualFileName(requestedName, item.displayName);
    if (displayName === item.displayName && customLabel === undefined) return;
    const uploadFile = new File([item.uploadFile], displayName, { type: item.uploadFile.type, lastModified: item.uploadFile.lastModified });
    const clientUploadId = createStableDropClientUploadId(`public_${packageInfo.id}_${item.id}`, uploadFile);
    patch(id, { displayName, uploadFile, clientUploadId, customLabel: customLabel ?? item.customLabel }, true);
  }
  function updatePhotoLabel(id: string, label: string) {
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (!item || running || !pendingStatus(item.status)) return;
    const normalizedLabel = label.trim() || "helyszini_foto";
    const extension = item.uploadFile.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "jpg";
    const displayName = buildDropPhotoDisplayName({ originalName: item.originalName, outputExtension: extension, capturedAt: item.capturedAt, uploadedAt: item.uploadedAt, sequenceNumber: item.sequenceNumber, customLabel: normalizedLabel });
    renameQueuedFile(id, displayName, normalizedLabel);
  }
  function outputExtension(item: Item) { return item.uploadFile.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || item.originalName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "bin"; }
  function replaceExtension(name: string, extension: string) {
    const stem = name.replace(/\.[^.]+$/, "");
    return `${stem}.${extension}`;
  }
  function groupSuffixForItem(item: Item, labels = groupPhotoLabels) {
    const key = item.groupId || "__ungrouped__";
    return (labels[key] || item.groupName || "").trim();
  }
  function labelForItem(item: Item, appendGroup = appendGroupNameToFilename, baseValue = globalPhotoLabel, labels = groupPhotoLabels) {
    return composePhotoLabel(baseValue, groupSuffixForItem(item, labels), appendGroup);
  }
  async function moveItemToGroup(id: string, nextGroupId: string, targetOverride?: DropImageGroup | null, internalBulk = false) {
    if (!allowImageGroups || running || finalizing || delivered || (!internalBulk && groupMutationBusy)) return;
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (!item || !groupEditableStatus(item.status)) return;
    const targetGroup = nextGroupId ? (targetOverride?.id === nextGroupId ? targetOverride : groups.find((group) => group.id === nextGroupId) || null) : null;
    if (nextGroupId && !targetGroup) { setMessage("A kiválasztott képcsoport nem található."); return; }
    if ((item.groupId || "") === (targetGroup?.id || "")) return;

    const previousGeneratedLabel = labelForItem(item);
    const movedItem = { ...item, groupId: targetGroup?.id || null, groupName: targetGroup?.name || null };
    let nextLabel = item.customLabel;
    let nextDisplayName = item.displayName;
    if (fileNameRule === "dimpro_photo" && (!item.customLabel || item.customLabel === previousGeneratedLabel)) {
      nextLabel = labelForItem(movedItem);
      nextDisplayName = buildDropPhotoDisplayName({
        originalName: item.originalName,
        outputExtension: outputExtension(item),
        capturedAt: item.capturedAt,
        uploadedAt: item.uploadedAt,
        sequenceNumber: item.sequenceNumber,
        customLabel: nextLabel,
      });
    }

    if (!internalBulk) setGroupMutationBusy(`file:${id}`);
    try {
      if (pendingStatus(item.status)) {
        const patchValue: Partial<Item> = { groupId: targetGroup?.id || null, groupName: targetGroup?.name || null, customLabel: nextLabel, displayName: nextDisplayName };
        if (nextDisplayName !== item.displayName) {
          const uploadFile = new File([item.uploadFile], nextDisplayName, { type: item.uploadFile.type, lastModified: item.uploadFile.lastModified });
          patchValue.uploadFile = uploadFile;
          patchValue.clientUploadId = createStableDropClientUploadId(`public_${packageInfo.id}_${item.id}`, uploadFile);
        }
        patch(id, patchValue, true);
      } else if (item.fileId) {
        const response = await fetch("/api/drop/access/files/group", {
          method: "PATCH",
          headers: { "content-type": "application/json", Authorization: `Bearer ${uploadToken}` },
          body: JSON.stringify({ fileId: item.fileId, groupId: targetGroup?.id || null, displayName: nextDisplayName }),
        });
        const payload = await response.json() as { file?: { id: string; groupId: string | null; groupName: string | null; displayName: string }; error?: string };
        if (!response.ok || !payload.file) throw new Error(payload.error || "A kép nem helyezhető át a kiválasztott csoportba.");
        patch(id, { groupId: payload.file.groupId, groupName: payload.file.groupName, displayName: payload.file.displayName, customLabel: nextLabel }, true);
        if (!internalBulk) await loadGroups();
      }
      if (!internalBulk) setMessage(`A kép átkerült ide: ${targetGroup?.name || "Csoport nélkül"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kép csoportváltása sikertelen.");
    } finally {
      if (!internalBulk) setGroupMutationBusy("");
    }
  }

  async function createGroupFromUngrouped() {
    const name = ungroupedGroupName.trim();
    const candidates = queueRef.current.filter((item) => !item.groupId && groupEditableStatus(item.status));
    if (!allowImageGroups || name.length < 2 || !candidates.length || running || finalizing || delivered || groupMutationBusy) return;
    setGroupMutationBusy("bulk:ungrouped");
    setMessage("");
    try {
      const response = await fetch("/api/drop/access/groups", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${uploadToken}` },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json() as { group?: DropImageGroup; error?: string };
      if (!response.ok || !payload.group) throw new Error(payload.error || "A képcsoport nem hozható létre.");
      setGroups((items) => items.some((item) => item.id === payload.group!.id) ? items : [...items, payload.group!]);
      for (const item of candidates) await moveItemToGroup(item.id, payload.group.id, payload.group, true);
      setSelectedGroupId(payload.group.id);
      setVisibleGroupId(payload.group.id);
      setUngroupedGroupName("");
      await loadGroups();
      setMessage(`${candidates.length} kép átkerült a(z) „${payload.group.name}” csoportba.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csoport nélküli képek áthelyezése sikertelen.");
    } finally {
      setGroupMutationBusy("");
    }
  }

  function renderItemGroupSelector(item: Item, compact = false) {
    if (!allowImageGroups) return null;
    return <label className={compact ? "block border-t border-slate-200 bg-teal-50/50 px-3 py-2" : "mt-3 block"}>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-teal-800">Csoport</span>
      <select value={item.groupId || ""} onChange={(event) => void moveItemToGroup(item.id, event.target.value)} disabled={running || finalizing || delivered || Boolean(groupMutationBusy) || !groupEditableStatus(item.status)} className="h-10 w-full rounded-xl border border-teal-200 bg-white px-3 text-xs font-bold text-teal-950 outline-none focus:border-teal-500">
        <option value="">Csoport nélkül</option>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      <span className="mt-1 block text-[10px] leading-4 text-slate-500">A kép a küldemény véglegesítéséig másik logikai csoportba áthelyezhető.</span>
    </label>;
  }

  function applyNameRuleToPending(rule: DropFileNameRule) {
    if (running || preparing || delivered) return;
    setFileNameRule(rule);
    for (const item of queueRef.current) {
      if (!pendingStatus(item.status)) continue;
      let name = item.displayName;
      let label = item.customLabel;
      const extension = outputExtension(item);
      if (rule === "dimpro_photo") {
        label = labelForItem(item);
        name = buildDropPhotoDisplayName({ originalName: item.originalName, outputExtension: extension, capturedAt: item.capturedAt, uploadedAt: item.uploadedAt, sequenceNumber: item.sequenceNumber, customLabel: label });
      } else if (rule === "preserve_original") {
        name = replaceExtension(sanitizeDropOriginalFileName(item.originalName, true), extension);
      } else {
        name = replaceExtension(sanitizeDropOriginalFileName(item.originalName, false), extension);
      }
      renameQueuedFile(item.id, name, label);
    }
  }
  function applyGlobalPhotoLabel(value: string) {
    const previousBase = globalPhotoLabel.trim() || "helyszini_foto";
    const normalized = value.trim() || "helyszini_foto";
    setGlobalPhotoLabel(normalized);
    for (const item of queueRef.current) {
      if (!pendingStatus(item.status)) continue;
      const previousGenerated = labelForItem(item, appendGroupNameToFilename, previousBase);
      if (!item.customLabel || item.customLabel === previousGenerated) {
        const nextGenerated = labelForItem(item, appendGroupNameToFilename, normalized);
        updatePhotoLabel(item.id, nextGenerated);
      }
    }
  }
  function applyGroupPhotoLabel(groupKey: string, value: string) {
    const previousLabels = groupPhotoLabels;
    const normalized = value.trim();
    const nextLabels = { ...previousLabels, [groupKey]: normalized };
    setGroupPhotoLabels(nextLabels);
    for (const item of queueRef.current) {
      if (!pendingStatus(item.status) || (item.groupId || "__ungrouped__") !== groupKey) continue;
      const previousGenerated = labelForItem(item, appendGroupNameToFilename, globalPhotoLabel, previousLabels);
      if (!item.customLabel || item.customLabel === previousGenerated) {
        const nextGenerated = labelForItem(item, appendGroupNameToFilename, globalPhotoLabel, nextLabels);
        updatePhotoLabel(item.id, nextGenerated);
      }
    }
  }
  function applyAppendGroupPreference(nextValue: boolean) {
    const previous = appendGroupNameToFilename;
    setAppendGroupNameToFilename(nextValue);
    for (const item of queueRef.current) {
      if (!pendingStatus(item.status)) continue;
      const previousGenerated = labelForItem(item, previous);
      if (!item.customLabel || item.customLabel === previousGenerated) updatePhotoLabel(item.id, labelForItem(item, nextValue));
    }
    void saveGroupPreferences({ appendGroupNameToFilename: nextValue });
  }
  async function saveGroupPreferences(patchValue: { appendGroupNameToFilename?: boolean; exportGroupsAsFolders?: boolean }) {
    const nextAppend = patchValue.appendGroupNameToFilename ?? appendGroupNameToFilename;
    const nextFolders = patchValue.exportGroupsAsFolders ?? exportGroupsAsFolders;
    try {
      const response = await fetch(`/api/drop/public/packages/${encodeURIComponent(packageInfo.id)}/preferences`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appendGroupNameToFilename: nextAppend, exportGroupsAsFolders: nextFolders }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A csoport-export beállítása nem menthető.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csoport-export beállítása nem menthető.");
    }
  }
  function undoLastAdd() {
    const removable = new Set(lastAddedIds);
    if (!removable.size || running || finalizing) return;
    const ids = queueRef.current.filter((item) => removable.has(item.id) && pendingStatus(item.status)).map((item) => item.id);
    ids.forEach(remove);
    setLastAddedIds([]);
    setMessage(ids.length ? `${ids.length} legutóbb hozzáadott fájl visszavonva.` : "A legutóbbi fájlok már feltöltésre kerültek, ezért innen nem vonhatók vissza.");
  }
  function toggleExpanded(id: string) { setExpandedMobile((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function remove(id: string) {
    setQueue((items) => {
      const found = items.find((item) => item.id === id);
      if (found) revokePreparedDropFile(found);
      return items.filter((item) => item.id !== id);
    });
    void removeDropQueueItem(packageInfo.id, id).catch(() => undefined);
  }

  async function clearQueue() {
    queueRef.current.forEach(revokePreparedDropFile);
    setQueue([]); setRestoredCount(0); setLastAddedIds([]);
    await clearDropQueuePackage(packageInfo.id).catch(() => undefined);
  }

  async function commentFile(fileId: string, comment: string) {
    if (!allowFileComments) return;
    const response = await dropFetchWithRetry(`/api/drop/public/packages/${encodeURIComponent(packageInfo.id)}/comments`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId, commentText: comment.slice(0, 2000) }),
    }, { onRetry: (detail) => setMessage(detail) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "A fájlmegjegyzés mentése sikertelen.");
  }

  async function syncUploadedComments() {
    if (!allowFileComments) return;
    const uploaded = queueRef.current.filter((item) => item.fileId && item.status === "quarantined");
    for (const item of uploaded) {
      if (!item.fileId) continue;
      await commentFile(item.fileId, item.comment);
    }
  }

  async function finalizeDelivery() {
    if (finalizeInFlightRef.current || delivered) return;
    finalizeInFlightRef.current = true; setFinalizing(true); setMessage("Megjegyzések mentése és csomagkézbesítés előkészítése…");
    try {
      await syncUploadedComments();
      setMessage("Megjegyzések mentve · vírusellenőrzés és csomagkézbesítés előkészítése…");
      for (let attempt = 0; attempt < 36; attempt += 1) {
        await waitForDropOnline();
        const response = await dropFetchWithRetry(`/api/drop/public/packages/${encodeURIComponent(packageInfo.id)}/finalize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportMode }) }, { attempts: 3, skipRetryStatuses: [425], onRetry: (detail) => setMessage(detail) });
        const payload = await response.json() as { error?: string; code?: string; details?: { totalCount?: number; readyCount?: number; pendingCount?: number }; result?: { delivery?: { sent: number; failed: number; alreadySent?: number }; workflow?: { recipientEmails?: string[]; notificationDetail?: string | null } } };
        if (response.ok) {
          setDelivered(true); setWorkflowStep(5);
          const deliverySent = payload.result?.delivery?.sent;
          const recipientFallback = payload.result?.workflow?.recipientEmails?.length;
          const sentCount = typeof deliverySent === "number" ? deliverySent : typeof recipientFallback === "number" ? recipientFallback : null;
          setMessage(`A küldemény elkészült.${sentCount !== null ? ` ${sentCount} címzett egy-egy összesített értesítése elküldve.` : " A címzettek értesítése elküldve."}${galleryCleanupReminder ? " A telefon galériájából a böngésző biztonsági okból nem törölhet; a sikeres küldés után a kiválasztott fotókat most kézzel törölheti." : ""}`);
          await clearDropQueuePackage(packageInfo.id).catch(() => undefined);
          dispatchDropLocalNotification({ title: "DIMPRO Drop · küldemény elkészült", body: `${packageInfo.title} kézbesítése befejeződött.`, tag: `drop-delivered-${packageInfo.id}`, url: "/send" });
          return;
        }
        if (response.status === 425 || payload.code === "DROP_PUBLIC_FILES_NOT_READY") {
          const total = payload.details?.totalCount;
          const ready = payload.details?.readyCount;
          setMessage(typeof total === "number" && typeof ready === "number"
            ? `Vírusellenőrzés folyamatban · ${ready}/${total} kép ellenőrizve. A küldés automatikusan folytatódik.`
            : "Vírusellenőrzés folyamatban. A képek biztonságosan beérkeztek; a küldés automatikusan folytatódik.");
          await sleep(8_000); continue;
        }
        if (payload.code === "DROP_PUBLIC_FINALIZE_IN_PROGRESS") { setMessage("A csomag kézbesítése már folyamatban van…"); await sleep(2_500); continue; }
        throw new Error(payload.error || "A küldemény véglegesítése sikertelen.");
      }
      throw new Error("A vírusellenőrzés továbbra is folyamatban van. A képek biztonságosan beérkeztek; a háttérfolyamat automatikusan befejezi a kézbesítést.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A véglegesítés sikertelen."); }
    finally { finalizeInFlightRef.current = false; setFinalizing(false); }
  }

  async function uploadAll() {
    if (running || finalizing || delivered || restoring) return;
    const pending = queueRef.current.filter((item) => pendingStatus(item.status));
    if (!pending.length) { setMessage("Nincs új feltöltésre váró fájl. Válasszon másik csoportot és adjon hozzá képeket, vagy véglegesítse a küldeményt."); return; }
    const abortController = new AbortController();
    abortRef.current = abortController;
    setRunning(true); setMessage("");
    pending.forEach((item) => patch(item.id, { autoResume: true }, true));
    let intentPool: DropClientUploadIntent[] = [];
    let allSucceeded = true;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        if (abortController.signal.aborted) { allSucceeded = false; break; }
        await waitForDropOnline(abortController.signal);
        if (!intentPool.length) {
          setMessage("Robotvédelmi ellenőrzés…");
          intentPool = await requestDropUploadIntentBatch({
            endpoint: "/api/drop/access/uploads/intent",
            count: recommendedDropIntentBatchCount(pending.slice(index).map((candidate) => candidate.uploadSize)),
            authorization: `Bearer ${uploadToken}`,
          });
          setMessage("");
        }
        const intent = intentPool.shift();
        if (!intent) throw new Error("A feltöltési biztonsági engedély hiányzik.");
        let initialized: DropInitializedUpload | null = null;
        try {
          patch(item.id, { status: "initializing", message: "Biztonságos munkamenet helyreállítása…", autoResume: true }, true);
          const response = await dropFetchWithRetry("/api/drop/access/uploads/init", {
            method: "POST",
            headers: { "content-type": "application/json", Authorization: `Bearer ${uploadToken}` },
            body: JSON.stringify({
              fileName: item.displayName,
              originalFileName: item.originalName,
              displayFileName: item.displayName,
              sourceOriginalSizeBytes: item.originalSize,
              sizeBytes: item.uploadFile.size,
              mimeType: item.uploadFile.type || "application/octet-stream",
              groupId: item.groupId,
              clientUploadId: item.clientUploadId,
              uploadedByName: uploaderName,
              rulesAccepted: true,
              rulesVersion: DROP_UPLOAD_RULES_VERSION,
              rulesAcceptedAt: new Date().toISOString(),
              robotGuard: { intentToken: intent.token, website },
            }),
          }, { signal: abortController.signal, onRetry: (detail) => patch(item.id, { status: "paused", message: detail }, true) });
          const payload = await response.json() as { initialized?: DropInitializedUpload; error?: string };
          if (!response.ok || !payload.initialized) throw new Error(payload.error || "A feltöltési munkamenet nem hozható létre.");
          initialized = payload.initialized;
          patch(item.id, { status: "uploading", message: initialized.completedPartNumbers?.length ? `Folytatás ${initialized.completedPartNumbers.length} kész rész után…` : "Fájl küldése…" }, true);
          await uploadDropInitialized({
            initialized,
            file: item.uploadFile,
            signal: abortController.signal,
            onNetworkState: (detail) => { patch(item.id, { status: "paused", message: detail }, true); void registerDropBackgroundResume(); },
            onProgress: (progress, detail) => patch(item.id, { status: "uploading", progress, message: detail }),
            onCheckpoint: async (checkpoint) => {
              await patchDropQueueItem(packageInfo.id, item.id, { status: "paused", progress: checkpoint.progress, message: `${checkpoint.completedPartNumbers.length} fájlrész kész · folytatható`, autoResume: true });
            },
          });
          patch(item.id, { status: "finalizing", progress: 100, message: "Integritás-ellenőrzés…" }, true);
          const completed = await dropFetchWithRetry(initialized.completeUrl, { method: "POST", headers: { Authorization: `Bearer ${initialized.uploadToken}` } }, { signal: abortController.signal, onRetry: (detail) => patch(item.id, { status: "paused", message: detail }, true) });
          const completedPayload = await completed.json() as { error?: string };
          if (!completed.ok) throw new Error(completedPayload.error || "A feltöltés véglegesítése sikertelen.");
          const fileId = initialized.file?.id || null;
          if (fileId && item.comment.trim()) await commentFile(fileId, item.comment);
          patch(item.id, { status: "quarantined", progress: 100, message: "Feltöltve · vírusellenőrzés folyamatban", fileId, autoResume: false }, true);
          initialized = null;
        } catch (error) {
          allSucceeded = false;
          const aborted = error instanceof DOMException && error.name === "AbortError";
          const offline = !getDropNetworkState().online || !navigator.onLine;
          const failure = aborted ? "Feltöltés szüneteltetve · a kész részek megmaradtak" : offline ? "Nincs kapcsolat · automatikus folytatásra vár" : error instanceof Error ? error.message : "A feltöltés sikertelen.";
          if (initialized && initialized.protocol !== "multipart" && !aborted) {
            await fetch(initialized.abortUrl, { method: "DELETE", headers: { "content-type": "application/json", Authorization: `Bearer ${initialized.uploadToken}` }, body: JSON.stringify({ reason: failure }) }).catch(() => undefined);
          }
          patch(item.id, { status: aborted || offline ? "paused" : "failed", message: failure, autoResume: !aborted }, true);
          if (!aborted && !offline) setMessage("Feltöltési hiba: " + failure);
          if (offline) void registerDropBackgroundResume();
          if (aborted || offline) break;
        }
      }
      if (allSucceeded) { setMessage("A feltöltések elkészültek, az azonnali vírusellenőrzés elindult. Ellenőrizze a mentési és riportbeállításokat, majd zárja le a küldeményt."); setWorkflowStep(3); }
    } catch (error) {
      allSucceeded = false;
      const aborted = error instanceof DOMException && error.name === "AbortError";
      setMessage(aborted ? "A feltöltés szünetel. A kész részek és a helyi sor megmaradtak." : error instanceof Error ? error.message : "A feltöltés sikertelen.");
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
    if (allSucceeded) setMessage("A kiválasztott fájlok feltöltése elkészült. Most hozzáadhat további képeket ebbe vagy másik csoportba. A küldemény csak a külön, jobbra húzható véglegesítési megerősítés után kerül lezárásra.");
  }
  useEffect(() => { uploadAllRef.current = () => void uploadAll(); });

  function pauseUpload() {
    abortRef.current?.abort();
    queueRef.current.filter((item) => item.status === "uploading" || item.status === "initializing" || item.status === "finalizing").forEach((item) => patch(item.id, { status: "paused", message: "Feltöltés szüneteltetve · folytatható", autoResume: false }, true));
  }

  function goToStep(step: number) {
    const safeStep = Math.max(0, Math.min(DROP_QUICK_SEND_WORKFLOW_STEPS.length - 1, step));
    setWorkflowStep(safeStep);
    const refs = [settingsStepRef, imagesStepRef, reviewStepRef, saveStepRef, reportStepRef, finalizeStepRef];
    window.requestAnimationFrame(() => refs[safeStep]?.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function commitSwipeDelete() {
    if (!deletedUndo) return;
    revokePreparedDropFile(deletedUndo.item);
    void removeDropQueueItem(packageInfo.id, deletedUndo.item.id).catch(() => undefined);
    setDeletedUndo(null);
    if (deleteUndoTimerRef.current) window.clearTimeout(deleteUndoTimerRef.current);
    deleteUndoTimerRef.current = null;
  }

  function softDelete(itemId: string) {
    if (running || finalizing) return;
    if (deletedUndo) commitSwipeDelete();
    const index = queueRef.current.findIndex((item) => item.id === itemId);
    const item = queueRef.current[index];
    if (!item || !pendingStatus(item.status)) return;
    setQueue((items) => items.filter((candidate) => candidate.id !== itemId));
    setSwipeOffsets((current) => ({ ...current, [itemId]: 0 }));
    setDeletedUndo({ item, index });
    setMessage(`${item.displayName} törölve. 6 másodpercig visszavonható.`);
    deleteUndoTimerRef.current = window.setTimeout(() => {
      revokePreparedDropFile(item);
      void removeDropQueueItem(packageInfo.id, item.id).catch(() => undefined);
      setDeletedUndo((current) => current?.item.id === item.id ? null : current);
    }, 6000);
  }

  function undoSwipeDelete() {
    if (!deletedUndo) return;
    if (deleteUndoTimerRef.current) window.clearTimeout(deleteUndoTimerRef.current);
    const restored = deletedUndo;
    setQueue((items) => { const next = [...items]; next.splice(Math.min(restored.index, next.length), 0, restored.item); return next; });
    void persist(restored.item);
    setDeletedUndo(null);
    deleteUndoTimerRef.current = null;
    setMessage("Törlés visszavonva.");
  }

  function swipeStart(itemId: string, event: React.PointerEvent<HTMLElement>) {
    if (running || finalizing) return;
    swipeStartRef.current[itemId] = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, axis: "pending" };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function swipeMove(itemId: string, event: React.PointerEvent<HTMLElement>) {
    const start = swipeStartRef.current[itemId];
    if (!start || start.pointerId !== event.pointerId) return;
    const rawX = event.clientX - start.x;
    const rawY = event.clientY - start.y;
    if (start.axis === "pending") {
      if (Math.abs(rawX) < 8 && Math.abs(rawY) < 8) return;
      if (Math.abs(rawY) > Math.abs(rawX)) {
        start.axis = "vertical";
        setSwipeOffsets((current) => ({ ...current, [itemId]: 0 }));
        return;
      }
      start.axis = "horizontal";
    }
    if (start.axis === "vertical") return;
    const delta = Math.max(-120, Math.min(120, rawX));
    setSwipeOffsets((current) => ({ ...current, [itemId]: delta }));
  }
  function swipeEnd(item: Item) {
    const offset = swipeOffsets[item.id] || 0;
    delete swipeStartRef.current[item.id];
    if (offset <= -72) softDelete(item.id);
    else if (offset >= 72 && pendingStatus(item.status)) {
      patch(item.id, { autoResume: true, message: "Feltöltésre kész · indítsa a feltöltést" }, true);
      setMessage(`${item.displayName}: feltöltésre kész.`);
    }
    setSwipeOffsets((current) => ({ ...current, [item.id]: 0 }));
  }

  async function saveQueuedImagesToDevice() {
    const files = queueRef.current
      .filter((item) => item.uploadFile.type.startsWith("image/"))
      .map((item) => item.originalFile.type.startsWith("image/") && item.originalFile.size === item.originalSize ? item.originalFile : item.uploadFile);
    if (!files.length) { setMessage("Nincs telefonra menthető kép a sorban."); return; }
    try {
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2500);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      setMessage(`${files.length} kép mentése elindítva a telefonra. A DIMPRO nem nyit meg megosztási menüt.`);
    } catch {
      setMessage("A telefonra mentés nem sikerült. Próbálja meg újra a képek mentését.");
    }
  }

  function statusIcon(item: Item) {
    if (item.status === "quarantined") return <CheckCircle2 size={18} className="shrink-0 text-emerald-600"/>;
    if (item.status === "failed") return <AlertTriangle size={18} className="shrink-0 text-rose-600"/>;
    if (item.status === "paused") return <PauseCircle size={18} className="shrink-0 text-amber-600"/>;
    return item.previewUrl ? <ImageIcon size={18} className="shrink-0 text-cyan-700"/> : <FileText size={18} className="shrink-0 text-cyan-700"/>;
  }

  return <section data-drop-offline-queue className="relative mt-6 rounded-[1.75rem] border border-cyan-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><label>Weboldal<input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1}/></label></div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-700">DIMPRO HexaUpload · DROP 1.2.12</p><h2 className="mt-2 text-2xl font-black text-slate-950">{imageOnly ? "Képek küldése" : "Fájlok és képek"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">A helyi queue oldalfrissítés után is megmarad. A multipart feltöltés a már elkészült fájlrészek után folytatódik.</p></div></div>

    <nav className="sticky top-2 z-[70] mt-4 rounded-2xl border border-cyan-200 bg-white/95 p-2 shadow-lg backdrop-blur" aria-label="GyorsSend lépések">
      <div className="grid grid-cols-6 gap-1">
        {DROP_QUICK_SEND_WORKFLOW_STEPS.map((label, index) => <button key={label} type="button" onClick={() => goToStep(index)} aria-label={`${index + 1}. lépés: ${label}`} className={`grid min-h-11 place-items-center rounded-xl px-1 py-2 text-xs font-black transition sm:flex sm:gap-2 sm:px-3 ${workflowStep === index ? "bg-cyan-800 text-white shadow" : "bg-slate-50 text-slate-700 hover:bg-cyan-50"}`} aria-current={workflowStep === index ? "step" : undefined}><span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] ${workflowStep === index ? "bg-white text-cyan-900" : index < workflowStep ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{index + 1}</span><span className="hidden sm:inline">{label}</span></button>)}
      </div>
      <p className="mt-1.5 text-center text-[11px] font-black text-slate-600 sm:hidden">{workflowStep + 1}/{DROP_QUICK_SEND_WORKFLOW_STEPS.length} · {DROP_QUICK_SEND_WORKFLOW_STEPS[workflowStep]}</p>
    </nav>
    <div ref={settingsStepRef} className="scroll-mt-28"/>
    {workflowStep === 0 ? <div>
      <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-cyan-800">1. Beállítások</p><h3 className="mt-1 text-lg font-black text-slate-950">Az ajánlott beállításokkal azonnal folytathatja</h3><p className="mt-1 text-sm leading-6 text-slate-600">A DIMPRO automatikusan optimalizálja a képeket. Csak akkor nyissa meg a további beállításokat, ha valamit módosítani szeretne.</p></div>
      <details className="mt-3 rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-800">További beállítások <span className="ml-1 text-xs font-semibold text-slate-500">· opcionális</span></summary><div className="border-t border-slate-200 px-1 pb-1">

    {allowImageGroups ? <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <div className="flex items-start gap-3"><Images size={21} className="mt-0.5 shrink-0 text-teal-800"/><div><p className="text-xs font-black uppercase tracking-[.14em] text-teal-800">Logikai képcsoportok</p><h3 className="mt-1 text-base font-black text-slate-950">Következő feltöltés: {selectedGroup?.name || "Csoport nélkül"}</h3><p className="mt-1 text-xs leading-5 text-slate-700">A csoport alapból csak logikai címke: nem hoz létre fizikai mappát. A következő Galéria / Kamera képek mindig a fent jelzett aktív csoportba kerülnek.</p></div></div>
      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem]">
        <label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-teal-900">Következő képek csoportja</span><select value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setVisibleGroupId(event.target.value || "__ungrouped__"); }} disabled={running || preparing || creatingGroup} className={inputControlClass}><option value="">Csoport nélkül</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {groupDisplayCount(group.id)} fájl</option>)}</select></label>
        <label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-teal-900">Új logikai csoport</span><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createGroup(); } }} disabled={running || preparing || creatingGroup} placeholder="pl. Gépészet" className={inputControlClass}/></label>
        <button type="button" onClick={() => void createGroup()} disabled={newGroupName.trim().length < 2 || running || preparing || creatingGroup} className="mt-[19px] grid h-12 w-12 place-items-center rounded-xl bg-teal-800 text-white disabled:bg-slate-300" aria-label="Új logikai képcsoport létrehozása">{creatingGroup ? <LoaderCircle size={17} className="animate-spin"/> : <FolderPlus size={17}/>}</button>
      </div>
      <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[.08em] text-teal-900">Megjelenített képek</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setVisibleGroupId("__all__")} className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${visibleGroupId === "__all__" ? "border-teal-600 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-900"}`}>Összes · {queue.length}</button><button type="button" onClick={() => setVisibleGroupId("__ungrouped__")} className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${visibleGroupId === "__ungrouped__" ? "border-teal-600 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-900"}`}>Csoport nélkül · {groupDisplayCount(null)}</button>{groups.map((group) => <button key={group.id} type="button" onClick={() => setVisibleGroupId(group.id)} className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${visibleGroupId === group.id ? "border-teal-600 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-900"}`}>{group.name} · {groupDisplayCount(group.id)}</button>)}</div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2"><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-teal-200 bg-white p-3"><input type="checkbox" checked={appendGroupNameToFilename} onChange={(event) => applyAppendGroupPreference(event.target.checked)} disabled={running || delivered} className="mt-0.5 accent-teal-700"/><span><strong className="block text-xs text-slate-950">Csoportmegnevezés a rendezett fájlnévben</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">Alapból bekapcsolva. Példa: `..._F0001_helyszini_foto_gepeszet.jpg`.</span></span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={exportGroupsAsFolders} onChange={(event) => { const next = event.target.checked; setExportGroupsAsFolders(next); void saveGroupPreferences({ exportGroupsAsFolders: next }); }} disabled={running || delivered} className="mt-0.5 accent-teal-700"/><span><strong className="block text-xs text-slate-950">Külön csoportmappák ZIP / Drive exportban</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">Alapból kikapcsolva. Aki mappás struktúrát szeretne, itt külön bekapcsolhatja.</span></span></label></div>
    </div> : null}

    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
      <div className="flex items-start gap-3"><FileText size={20} className="mt-0.5 shrink-0 text-violet-800"/><div><p className="text-xs font-black uppercase tracking-[.14em] text-violet-800">Fájlnévkezelés</p><h3 className="mt-1 text-base font-black text-slate-950">Eredeti név megőrzése és rendezett fotónév</h3><p className="mt-1 text-xs leading-5 text-slate-700">Az eredeti fájlnév mindig megmarad háttéradatként. A letöltési név külön szabály szerint készül, és feltöltés előtt képenként módosítható.</p></div></div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <button type="button" onClick={() => applyNameRuleToPending("safe_original")} disabled={running || preparing || delivered} className={`rounded-xl border p-3 text-left ${fileNameRule === "safe_original" ? "border-violet-500 bg-white shadow-sm" : "border-violet-100 bg-violet-50"}`}><strong className="block text-xs text-slate-950">DIMPRO szabványos</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">Ékezet nélkül, szóköz helyett alulvonás, problémás jelek nélkül.</span></button>
        <button type="button" onClick={() => applyNameRuleToPending("preserve_original")} disabled={running || preparing || delivered} className={`rounded-xl border p-3 text-left ${fileNameRule === "preserve_original" ? "border-violet-500 bg-white shadow-sm" : "border-violet-100 bg-violet-50"}`}><strong className="block text-xs text-slate-950">Eredeti név megtartása</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">Ékezet és szóköz marad; csak a fájlrendszert zavaró karakterek kerülnek ki.</span></button>
        <button type="button" onClick={() => applyNameRuleToPending("dimpro_photo")} disabled={running || preparing || delivered} className={`rounded-xl border p-3 text-left ${fileNameRule === "dimpro_photo" ? "border-violet-500 bg-white shadow-sm" : "border-violet-100 bg-violet-50"}`}><strong className="block text-xs text-slate-950">DIMPRO rendezett fotónév · ajánlott</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">260807_0740_260808_F0001_helyszini_bej.jpg</span></button>
      </div>
      {fileNameRule === "dimpro_photo" ? <div className="mt-3 grid gap-3 rounded-xl border border-violet-200 bg-white p-3 md:grid-cols-2"><label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-violet-800">Alap megnevezés az összes fotóhoz</span><input value={globalPhotoLabel} onChange={(event) => setGlobalPhotoLabel(event.target.value)} onBlur={(event) => applyGlobalPhotoLabel(event.target.value)} disabled={running || preparing || delivered} placeholder="helyszini_foto" className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold"/><span className="mt-1 block text-[10px] leading-4 text-slate-500">A feltöltés előtt egyszer adható meg; minden új rendezett fotónév végére bekerül.</span></label>{allowImageGroups ? <label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-teal-800">Csoport fájlnév-utótagja · opcionális</span><input value={groupPhotoLabels[selectedGroupLabelKey] ?? ""} onChange={(event) => setGroupPhotoLabels((current) => ({ ...current, [selectedGroupLabelKey]: event.target.value }))} onBlur={(event) => applyGroupPhotoLabel(selectedGroupLabelKey, event.target.value)} disabled={running || preparing || delivered} placeholder={`${selectedGroup?.name || "Csoport nélkül"} · pl. eszaki_homlokzat`} className="w-full rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-semibold"/><span className="mt-1 block text-[10px] leading-4 text-slate-500">Ha üres, a csoport neve kerül az alapmegnevezés mögé. Ha megadja, ez az utótag kerül a csoport képeinek fájlnevébe.</span></label> : null}<p className="md:col-span-2 text-[11px] font-semibold leading-5 text-violet-950">A készítés dátuma/időpontja JPEG-nél elsőként EXIF-ből, egyébként a fájl dátumából, végső esetben a feltöltés időpontjából készül. A fotósorszám F0001-től növekszik. Egy adott kép kártyáján a megnevezés továbbra is külön felülírható.</p></div> : null}
    </div>

    <div className="mt-4 rounded-2xl border border-cyan-100 bg-slate-50 p-4">
      <DropImageSizeSelector
        value={imageSizePreset}
        onChange={setImageSizePreset}
        disabled={running || preparing || delivered}
        recommendedPreset={imageOnly ? "small" : "medium"}
        preserveMetadata={metadataPolicy === "preserve"}
      />
      <div className="mt-4 border-t border-slate-200 pt-4">
        <DropImageMetadataSelector
          value={metadataPolicy}
          onChange={(next) => { setMetadataPolicy(next); if (next === "preserve") setImageSizePreset("original"); }}
          disabled={running || preparing || delivered}
        />
      </div>
      {remindGalleryCleanup ? <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border p-3 ${galleryCleanupReminder?"border-amber-400 bg-amber-50":"border-slate-200 bg-white"}`}><span className="flex items-start gap-3"><input type="checkbox" checked={galleryCleanupReminder} onChange={(event) => setGalleryCleanupReminder(event.target.checked)} disabled={running || delivered} className="mt-0.5 accent-amber-700"/><span><strong className="block text-xs text-amber-950">Törlési emlékeztető</strong><span className="mt-1 block text-[11px] leading-5 text-amber-900">Sikeres küldés után jelzi, hogy a kiválasztott fotók kézzel törölhetők a galériából.</span></span></span></label>
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 opacity-75" aria-disabled="true"><strong className="block text-xs text-slate-700">Automatikus galériatörlés</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">Böngészőből/PWA-ból nem engedélyezett. Későbbi DIMPRO natív mobilappban lesz megvalósítható.</span></div>
      </div> : null}
    </div>

    <div className={`mt-4 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold ${network.online ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      {network.online ? <Database size={16}/> : <CloudOff size={16}/>}<span>{network.online ? "Online · szerver elérhető" : "Offline · a fájlok ezen a készüléken megmaradnak"}</span><span className="ml-auto">Helyi tár: {persistentStorage === true ? "tartós" : persistentStorage === false ? "böngésző által kezelve" : "ellenőrzés alatt"}</span>
    </div>

    {allowImageGroups ? <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-teal-300 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.1em] text-teal-800">Kamera / Galéria célcsoport</p><p className="mt-0.5 text-sm font-black text-slate-950">{selectedGroup?.name || "Csoport nélkül"}</p></div><select value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setVisibleGroupId(event.target.value || "__ungrouped__"); }} disabled={running || preparing || creatingGroup} className="h-11 min-w-52 rounded-xl border border-teal-300 bg-teal-50 px-3 text-sm font-bold text-teal-950 outline-none focus:ring-4 focus:ring-teal-100"><option value="">Csoport nélkül</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {groupDisplayCount(group.id)} fájl</option>)}</select></div> : null}

      </div></details>
      <div className="mt-4 flex justify-end"><button type="button" onClick={() => goToStep(1)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-cyan-800 px-5 py-3 text-sm font-black text-white">Tovább a képekhez <ArrowRight size={17}/></button></div>
    </div> : null}

    <div ref={imagesStepRef} className="scroll-mt-28"/>
    <div className={workflowStep === 1 ? "block" : "hidden"}>
      <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-cyan-800">2. Képek</p><h3 className="mt-1 text-lg font-black text-slate-950">Adja hozzá a küldendő képeket</h3><p className="mt-1 text-sm leading-6 text-slate-600">Használhatja a kamerát, a galériát vagy a fájlválasztót. A képeket még a következő lépésben ellenőrizheti.</p></div>
    <div ref={uploadZoneRef} className="mt-5"><DropHexUploadZone accept={imageOnly ? acceptedImageExtensions : acceptedExtensions} disabled={running || finalizing || delivered} busy={preparing || running || finalizing || restoring} imageMode allowCamera title={imageOnly ? "Fotók hozzáadása" : "Húzza ide a küldendő fájlokat"} description="Kattintással, galériából vagy kamerából is hozzáadható. A kiválasztott Nagy, Közepes vagy Kicsi képméret a helyi előkészítéskor érvényesül." progress={totalProgress} onFiles={addFiles} onExternalOpen={() => goToStep(1)}/></div>
    {!running && !finalizing && !delivered && lastAddedIds.length ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={undoLastAdd} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"><RotateCcw size={15}/> Legutóbbi hozzáadás visszavonása</button><span className="self-center text-[11px] font-semibold text-slate-500">A névszabály a feltöltés megkezdése előtt bármikor módosítható; a várakozó fájlneveket a rendszer újraszámolja.</span></div> : null}

    {restoring ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950"><LoaderCircle size={17} className="animate-spin"/>Helyi feltöltési sor visszaállítása…</div> : null}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => goToStep(0)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700">Vissza</button><button type="button" onClick={() => goToStep(2)} disabled={queue.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-800 px-4 py-2.5 text-xs font-black text-white disabled:bg-slate-300">Tovább az ellenőrzéshez <ArrowRight size={15}/></button></div>
    </div>

    <div ref={reviewStepRef} className="scroll-mt-28"/>
    {queue.length ? <div className="mt-5">
      <div className={workflowStep === 2 ? "block" : "hidden"}>
      <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-cyan-800">3. Ellenőrzés</p><h3 className="mt-1 text-lg font-black text-slate-950">Nézze át a képeket</h3><p className="mt-1 text-sm leading-6 text-slate-600">Itt törölhet, megjegyzést írhat vagy képcsoportot válthat. Semmi nem vész el, ha visszalép.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-slate-600">Feltöltési sor · {queue.length} fájl{visibleGroupId !== "__all__" ? ` · ebből megjelenítve ${visibleQueue.length}` : ""}{restoredCount ? ` · ${restoredCount} visszaállítva` : ""}</p><p className="mt-1 text-xs font-semibold text-slate-500">Eredeti: {formatBytes(originalBytes)} · Küldendő: {formatBytes(totalBytes)}{savings ? ` · ${savings}% megtakarítás` : ""}</p></div><strong className="text-sm text-cyan-800">{totalProgress}%</strong></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-700 transition-[width]" style={{ width: `${totalProgress}%` }}/></div>

      <div className="mt-4 space-y-2 sm:hidden">
        {visibleQueue.map((item) => {
          const expanded = expandedMobile.has(item.id);
          const swipeOffset = swipeOffsets[item.id] || 0;
          return <article key={item.id} data-drop-queue-item data-drop-queue-status={item.status} draggable={!running && pendingStatus(item.status)} onDragStart={() => setDraggedItemId(item.id)} onDragEnd={() => setDraggedItemId(null)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative overflow-hidden bg-white">
              <div aria-hidden="true" className={`absolute inset-0 z-0 flex items-center justify-between bg-gradient-to-r from-emerald-100 via-slate-50 to-rose-100 px-4 text-xs font-black transition-opacity ${Math.abs(swipeOffset) > 8 ? "opacity-100" : "opacity-0"}`}>
                <span className={`inline-flex items-center gap-2 text-emerald-950 transition-opacity ${swipeOffset > 12 ? "opacity-100" : "opacity-0"}`}><PlayCircle size={17}/> Feltöltésre kész</span>
                <span className={`ml-auto inline-flex items-center gap-2 text-rose-950 transition-opacity ${swipeOffset < -12 ? "opacity-100" : "opacity-0"}`}><Trash2 size={17}/> Törlés</span>
              </div>
              <button type="button" onClick={() => toggleExpanded(item.id)} onPointerDown={(event) => swipeStart(item.id, event)} onPointerMove={(event) => swipeMove(item.id, event)} onPointerUp={() => swipeEnd(item)} onPointerCancel={() => setSwipeOffsets((current) => ({ ...current, [item.id]: 0 }))} className={`relative z-10 flex w-full touch-pan-y items-center gap-3 p-3 text-left transition-transform ${swipeOffset < 0 ? "bg-rose-50" : swipeOffset > 0 ? "bg-emerald-50" : "bg-white"}`} style={{ transform: `translateX(${swipeOffset}px)` }}>
                {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover"/> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><FileText size={24}/></span>}
                {statusIcon(item)}
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-slate-950">{item.displayName}</strong>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${item.groupName ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{item.groupName || "Csoport nélkül"}</span>
                  <span className="mt-1 block truncate text-[11px] text-slate-500">{item.message}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full bg-cyan-700" style={{ width: `${item.progress}%` }}/></span>
                </span>
                {expanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
              </button>
            </div>
            {expanded ? <div className="relative z-10 border-t border-slate-200 bg-white p-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600"><strong className="text-slate-800">Eredeti:</strong> {item.originalName}<br/><strong className="text-slate-800">Méret:</strong> {formatBytes(item.originalSize)} → {formatBytes(item.uploadSize)}</div>
              {renderItemGroupSelector(item)}
              <label className="mt-3 block"><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Letöltési fájlnév</span><input key={item.displayName} defaultValue={item.displayName} onBlur={(event) => renameQueuedFile(item.id, event.target.value)} disabled={running || !pendingStatus(item.status)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"/></label>
              {fileNameRule === "dimpro_photo" && item.previewUrl ? <label className="mt-3 block"><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-violet-700">Kép rövid neve / fájlnév-kiegészítés</span><input defaultValue={item.customLabel} onBlur={(event) => updatePhotoLabel(item.id, event.target.value)} disabled={running || !pendingStatus(item.status)} placeholder="pl. gephaz_csovezetek" className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold"/></label> : null}
              <p className={`mt-3 rounded-xl border px-3 py-2 text-[11px] font-semibold leading-5 ${item.optimized ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{item.optimizationNote}</p>
              {allowFileComments ? <div className="mt-3"><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Megjegyzés ehhez a képhez</span>{allowQuickVoiceNote && imageOnly ? <button type="button" onClick={() => voiceItemId === item.id ? stopVoiceNote(true) : void startVoiceNote(item.id)} disabled={finalizing || delivered || !commentEditableStatus(item.status)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black ${voiceItemId === item.id ? "border-rose-300 bg-rose-50 text-rose-800" : "border-cyan-200 bg-cyan-50 text-cyan-800"}`}>{voiceItemId === item.id ? <MicOff size={14}/> : <Mic size={14}/>} {voiceItemId === item.id ? `Leállítás · 00:${String(voiceSecondsLeft).padStart(2,"0")}` : "Diktálás"}</button> : null}</div><textarea value={item.comment} onChange={(event) => updateComment(item.id, event.target.value.slice(0, 2000))} onBlur={() => { if (item.fileId) void commentFile(item.fileId, item.comment).catch((error) => setMessage(error instanceof Error ? error.message : "A megjegyzés mentése sikertelen.")); }} disabled={finalizing || delivered} placeholder="Írja ide a képen látható munkarészt, hibát vagy információt…" className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-5 outline-none focus:border-cyan-500"/>{renderVoiceStatus(item.id, true)}</div> : null}
              {!running && pendingStatus(item.status) ? <button type="button" onClick={() => softDelete(item.id)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"><X size={14}/> Kép eltávolítása</button> : null}
            </div> : null}
          </article>;
        })}
      </div>

      <div className="mt-4 hidden gap-4 sm:grid md:grid-cols-2 xl:grid-cols-3">
        {visibleQueue.map((item) => <article key={item.id} data-drop-queue-item data-drop-queue-status={item.status} draggable={!running && pendingStatus(item.status)} onDragStart={() => setDraggedItemId(item.id)} onDragEnd={() => setDraggedItemId(null)} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
          {item.previewUrl ? <button type="button" onClick={() => setPreview({ url: item.previewUrl!, name: item.displayName })} className="group relative block aspect-[4/3] w-full overflow-hidden bg-slate-200 text-left" aria-label={`${item.displayName} kép nagyítása`}><img src={item.previewUrl} alt={item.displayName} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"/><span className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-xl bg-slate-950/75 text-white backdrop-blur"><Maximize2 size={16}/></span>{item.optimized ? <span className="absolute bottom-2 left-2 rounded-full bg-emerald-700/90 px-2.5 py-1 text-[10px] font-black text-white">Optimalizálva</span> : null}</button> : <div className="grid aspect-[4/3] w-full place-items-center bg-slate-100 text-slate-400"><div className="text-center"><FileText className="mx-auto" size={34}/><p className="mt-2 text-xs font-black">Nincs képelőnézet</p></div></div>}
          <div className="flex flex-1 flex-col p-4"><div className="flex items-start gap-3">{statusIcon(item)}<div className="min-w-0 flex-1"><strong className="block break-words text-sm leading-5 text-slate-950">{item.displayName}</strong>{item.groupName ? <span className="mt-1 inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-black text-teal-800">{item.groupName}</span> : null}<p className="mt-1 text-xs leading-5 text-slate-500">{formatBytes(item.originalSize)} → {formatBytes(item.uploadSize)} · {item.message}</p></div>{!running && pendingStatus(item.status) ? <button type="button" onClick={() => softDelete(item.id)} className="shrink-0 rounded-lg border border-slate-300 bg-white p-2 text-slate-500" aria-label={`${item.displayName} eltávolítása`}><X size={14}/></button> : null}</div>{renderItemGroupSelector(item)}<label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Letöltési fájlnév</span><input key={item.displayName} defaultValue={item.displayName} onBlur={(event) => renameQueuedFile(item.id, event.target.value)} disabled={running || !pendingStatus(item.status)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"/></label>{fileNameRule === "dimpro_photo" && item.previewUrl ? <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.08em] text-violet-700">Kép rövid neve / fájlnév-kiegészítés</span><input defaultValue={item.customLabel} onBlur={(event) => updatePhotoLabel(item.id, event.target.value)} disabled={running || !pendingStatus(item.status)} placeholder="pl. eszaki_homlokzat" className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold"/><span className="mt-1 block text-[10px] leading-4 text-slate-500">Eredeti név: {item.originalName} · sorszám: F{String(item.sequenceNumber).padStart(4,"0")}</span></label> : null}<p className={`mt-3 rounded-xl border px-3 py-2 text-[11px] font-semibold leading-5 ${item.optimized ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>{item.optimizationNote}</p>{allowFileComments ? <div className="mt-3"><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-black uppercase tracking-[.08em] text-slate-600">Megjegyzés ehhez a képhez</span>{allowQuickVoiceNote && imageOnly ? <button type="button" onClick={() => voiceItemId === item.id ? stopVoiceNote(true) : void startVoiceNote(item.id)} disabled={finalizing || delivered || !commentEditableStatus(item.status)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black ${voiceItemId === item.id ? "border-rose-300 bg-rose-50 text-rose-800" : "border-cyan-200 bg-cyan-50 text-cyan-800"}`}>{voiceItemId === item.id ? <MicOff size={14}/> : <Mic size={14}/>} {voiceItemId === item.id ? `Leállítás · 00:${String(voiceSecondsLeft).padStart(2,"0")}` : "Diktálás"}</button> : null}</div><textarea value={item.comment} onChange={(event) => updateComment(item.id, event.target.value.slice(0, 2000))} onBlur={() => { if (item.fileId) void commentFile(item.fileId, item.comment).catch((error) => setMessage(error instanceof Error ? error.message : "A megjegyzés mentése sikertelen.")); }} disabled={finalizing || delivered} placeholder="Írja ide a képen látható munkarészt, hibát vagy információt…" className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-cyan-500"/>{renderVoiceStatus(item.id)}{allowQuickVoiceNote && imageOnly ? <p className="mt-1 text-[10px] text-slate-500">A DIMPRO nem rögzít hangfájlt; a böngésző/eszköz beszédfelismerése csak szerkeszthető szöveget ad vissza.</p> : null}</div> : null}</div>
        </article>)}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => goToStep(1)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700">Vissza a képekhez</button><button type="button" onClick={() => goToStep(3)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-800 px-4 py-2.5 text-xs font-black text-white">Tovább a mentéshez <ArrowRight size={15}/></button></div>
      </div>

      <div ref={saveStepRef} className="scroll-mt-28"/>
      <div className={workflowStep === 3 ? "block" : "hidden"}>
      <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-sky-800">4. Mentés</p><h3 className="mt-1 text-lg font-black text-slate-950">Szeretné a képeket ezen az eszközön is megtartani?</h3><p className="mt-1 text-sm leading-6 text-slate-600">Ez opcionális. Ha nem kapcsolja be, a küldési folyamat ettől még teljesen működik.</p></div>
      {imageOnly ? <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4"><div className="flex items-start gap-3"><Smartphone size={20} className="mt-0.5 text-sky-800"/><div className="flex-1"><p className="text-[10px] font-black uppercase tracking-[.1em] text-sky-800">Mentési beállítások</p><strong className="mt-1 block text-sm text-slate-950">Képek mentése a telefonra is</strong><p className="mt-1 text-xs leading-5 text-slate-600">A DIMPRO közvetlen képfájl-mentést indít, és nem nyitja meg a Messenger / Outlook / SMS megosztási menüt. Ha az eredeti kamerakép még elérhető, azt menti; visszaállított munkamenetnél az optimalizált változatot. A telefon a képet a saját média-/galériakezelési szabályai szerint tárolja.</p><label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-sky-200 bg-white p-3"><input type="checkbox" checked={saveToDevice} onChange={(event) => setSaveToDevice(event.target.checked)} className="h-5 w-5 accent-sky-700"/><span className="text-xs font-black text-slate-900">Mentés a telefonra is</span></label>{saveToDevice ? <button type="button" onClick={() => void saveQueuedImagesToDevice()} disabled={!queue.some((item) => item.uploadFile.type.startsWith("image/"))} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 text-xs font-black text-white disabled:bg-slate-300"><Download size={16}/> Képek mentése a telefonra</button> : null}</div></div></div> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => goToStep(2)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700">Vissza</button><button type="button" onClick={() => goToStep(4)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-800 px-4 py-2.5 text-xs font-black text-white">Tovább a riporthoz <ArrowRight size={15}/></button></div>
      </div>

      <div ref={reportStepRef} className="scroll-mt-28"/>
      <div className={workflowStep === 4 ? "block" : "hidden"}>
      <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4"><p className="text-[10px] font-black uppercase tracking-[.1em] text-violet-800">Riport</p><h3 className="mt-1 text-base font-black text-slate-950">A riportküldés nem automatikus és nem kötelező</h3><p className="mt-1 text-xs leading-5 text-slate-600">Válassza ki, mi történjen a végleges riporttal. Az alapbeállítás nem küld riportot.</p><div className="mt-3 grid gap-2 md:grid-cols-3">{([
        ["none", "Riportküldés nélkül", "A küldemény lezárható automatikus riport-e-mail nélkül; belső megőrzési riport a retention szabályok miatt készülhet."],
        ["generate_only", "Riport készítése", "A riport elkészül, de e-mailben nem kerül kiküldésre."],
        ["generate_send", "Riport készítése és küldése", "A riport a beállított címzetteknek kiküldhető."],
      ] as const).map(([value, title, detail]) => <button key={value} type="button" onClick={() => setReportMode(value)} className={`rounded-xl border p-3 text-left ${reportMode === value ? "border-violet-500 bg-white shadow-sm ring-2 ring-violet-100" : "border-violet-100 bg-violet-50"}`}><strong className="block text-xs text-slate-950">{title}</strong><span className="mt-1 block text-[11px] leading-5 text-slate-600">{detail}</span></button>)}</div></div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => goToStep(3)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700">Vissza</button><button type="button" onClick={() => goToStep(5)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-800 px-4 py-2.5 text-xs font-black text-white">Tovább a lezáráshoz <ArrowRight size={15}/></button></div>
      </div>

      <div ref={finalizeStepRef} className="scroll-mt-28"/>
      <div className={workflowStep === 5 ? "block" : "hidden"}>
      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-emerald-800">6. Lezárás</p><h3 className="mt-1 text-lg font-black text-slate-950">A küldemény készen áll a befejezésre</h3><p className="mt-1 text-sm leading-6 text-slate-600">{queue.length} kép van a csomagban. A lezárás csak az alábbi külön megerősítéssel indul el.</p></div>
      {draggedItemId ? <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = draggedItemId; setDraggedItemId(null); if (id) remove(id); }} className="mt-5 flex min-h-24 items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-rose-400 bg-rose-50 px-4 py-5 text-sm font-black text-rose-800"><Trash2 size={22}/> Húzza ide a képkártyát a törléshez</div> : null}
      {!delivered ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.1em] text-emerald-800">Következő lépés</p><strong className="text-sm text-slate-950">További feltöltés ebbe vagy másik csoportba</strong><p className="mt-1 text-xs leading-5 text-slate-600">Aktív csoport: <strong>{selectedGroup?.name || "Csoport nélkül"}</strong>. {groups.length ? groups.map((group) => `${group.name}: ${groupDisplayCount(group.id)} fájl`).join(" · ") : "Még nincs külön csoport."}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => uploadZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} disabled={running || preparing || finalizing} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-black text-emerald-900"><FolderPlus size={16}/> További feltöltés ide</button>{allowImageGroups ? <button type="button" onClick={() => setGroupManagerOpen(true)} disabled={running || preparing || finalizing} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-xs font-black text-teal-900"><FolderCog size={16}/> Másik csoport / kezelés</button> : null}</div></div>
        <div className="mt-4 flex flex-wrap gap-3 border-t border-emerald-200 pt-4">
          <button type="button" onClick={() => void uploadAll()} disabled={finalizing || restoring || running || !queue.some((item) => pendingStatus(item.status))} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:bg-slate-300">{running ? <LoaderCircle size={17} className="animate-spin"/> : <PlayCircle size={17}/>} {queue.some((item) => item.status === "paused") ? "Feltöltés folytatása" : "Fájlok feltöltése"}</button>
          {running ? <button type="button" onClick={pauseUpload} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900"><PauseCircle size={17}/> Szüneteltetés</button> : null}
          {!running && queue.length > 0 && queue.every((item) => item.status === "quarantined") ? <SlideConfirm label="Húzza jobbra a küldemény véglegesítéséhez" busyLabel="Kézbesítés folyamatban…" disabled={restoring} busy={finalizing} onConfirm={() => void finalizeDelivery()}/> : null}
          {!running && !finalizing ? <button type="button" onClick={() => void clearQueue()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700"><Trash2 size={16}/> Lista ürítése</button> : null}
        </div><p className="mt-3 text-[11px] font-semibold leading-5 text-emerald-950">A fájlok feltöltése önmagában nem küld e-mailt. A küldemény lezárása külön, jobbra húzható megerősítéssel történik. A riportküldés a fenti Riport lépés választását követi.</p></div> : null}
      <div className="mt-4"><button type="button" onClick={() => goToStep(4)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700">Vissza a riporthoz</button></div>
      </div>
    </div> : null}
    {!delivered && queue.length === 0 && workflowStep >= 2 ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><strong className="text-sm text-amber-950">Még nincs kiválasztott kép.</strong><p className="mt-1 text-xs leading-5 text-amber-900">Lépjen vissza a Képek pontra, és adjon hozzá legalább egy képet.</p><button type="button" onClick={() => goToStep(1)} className="mt-3 min-h-11 rounded-xl bg-amber-800 px-4 py-2.5 text-xs font-black text-white">Vissza a képekhez</button></div> : null}

    {delivered ? <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950"><CheckCircle2 size={24}/><h3 className="mt-2 text-lg font-black">A képek elküldve</h3><p className="mt-1 text-sm leading-6">A küldési folyamat befejeződött. Nem kell további gombot keresnie ezen a munkameneten belül.</p><div className="mt-4 flex flex-wrap gap-3">{onStartNewTransfer ? <button type="button" onClick={onStartNewTransfer} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"><RotateCcw size={16}/> Új képfeltöltés / Send</button> : null}{onClose ? <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-black text-emerald-900"><ArrowLeft size={16}/> Bezárás / kezdőlap</button> : null}</div></div> : null}
    {deletedUndo ? <div className="fixed bottom-4 left-1/2 z-[140] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl"><span className="max-w-[55vw] truncate">Kép törölve</span><button type="button" onClick={undoSwipeDelete} className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-slate-950">Visszavonás</button></div> : null}
    {message ? <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${delivered ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{finalizing ? <LoaderCircle size={16} className="mr-2 inline animate-spin"/> : null}{message}</div> : null}

    {allowImageGroups && !delivered ? <><button type="button" onClick={() => setGroupManagerOpen(true)} className="fixed bottom-24 right-4 z-[88] inline-flex h-14 items-center gap-2 rounded-full border border-teal-200 bg-teal-800 px-4 text-xs font-black text-white shadow-2xl sm:bottom-6 sm:right-6" aria-label="Képcsoportok kezelése"><FolderCog size={20}/><span className="max-w-28 truncate">{selectedGroup?.name || "Csoportok"}</span></button>{groupManagerOpen ? <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Képcsoportok kezelése" onClick={() => setGroupManagerOpen(false)}><section className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-[1.75rem] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.13em] text-teal-800">Képcsoportok</p><h3 className="mt-1 text-xl font-black text-slate-950">Váltás és csoportkezelés</h3><p className="mt-1 text-xs leading-5 text-slate-600">Válassza ki, melyik csoportba kerüljenek a következő képek. A csoport logikai címke; törlése nem törli a fotókat.</p></div><button type="button" onClick={() => setGroupManagerOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"><X size={18}/></button></div><button type="button" onClick={() => chooseUploadGroup("")} className={`mt-4 flex w-full items-center justify-between rounded-xl border p-3 text-left ${!selectedGroupId ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"}`}><span><strong className="block text-sm text-slate-950">Csoport nélkül</strong><span className="text-xs text-slate-500">{groupDisplayCount(null)} fájl · rendszerkategória</span></span><span className="text-xs font-black text-teal-800">Kiválasztás</span></button>{groupDisplayCount(null) > 0 ? <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] font-bold leading-5 text-amber-950">A csoport nélküli képekből egy lépésben valódi csoport készíthető.</p><div className="mt-2 flex gap-2"><input value={ungroupedGroupName} onChange={(event) => setUngroupedGroupName(event.target.value)} placeholder="Új csoport neve" className="h-10 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold"/><button type="button" onClick={() => void createGroupFromUngrouped()} disabled={groupMutationBusy !== "" || ungroupedGroupName.trim().length < 2} className="rounded-lg bg-amber-700 px-3 text-[11px] font-black text-white disabled:bg-slate-300">Csoport létrehozása ezekből</button></div></div> : null}<div className="mt-2 space-y-2">{groups.map((group) => <div key={group.id} className={`rounded-xl border p-3 ${selectedGroupId === group.id ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"}`}>{editingGroupId === group.id ? <div className="flex gap-2"><input value={editingGroupName} onChange={(event) => setEditingGroupName(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-teal-200 px-3 text-sm font-semibold"/><button type="button" onClick={() => void updateGroup(group.id, editingGroupName)} disabled={groupMutationBusy !== "" || editingGroupName.trim().length < 2} className="rounded-lg bg-teal-800 px-3 text-xs font-black text-white disabled:bg-slate-300">Mentés</button><button type="button" onClick={() => { setEditingGroupId(null); setEditingGroupName(""); }} className="rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600">Mégse</button></div> : <><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => chooseUploadGroup(group.id)} className="min-w-0 flex-1 text-left"><strong className="block truncate text-sm text-slate-950">{group.name}</strong><span className="text-xs text-slate-500">{groupDisplayCount(group.id)} fájl · következő feltöltéshez kiválasztható</span></button><span className="text-xs font-black text-teal-800">{selectedGroupId === group.id ? "Aktív" : "Váltás"}</span></div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }} disabled={groupMutationBusy !== ""} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700">Átnevezés</button><button type="button" onClick={() => void deleteGroup(group.id)} disabled={groupMutationBusy !== ""} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700">Törlés</button></div></>}</div>)}</div><div className="mt-4 border-t border-slate-200 pt-4"><p className="text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Új csoport</p><div className="mt-2 flex gap-2"><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="pl. Gépészet" className="h-11 min-w-0 flex-1 rounded-xl border border-teal-200 px-3 text-sm font-semibold"/><button type="button" onClick={() => void createGroup()} disabled={creatingGroup || newGroupName.trim().length < 2} className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 text-xs font-black text-white disabled:bg-slate-300"><FolderPlus size={15}/> Létrehozás</button></div></div></section></div> : null}</> : null}

    {preview ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4" role="dialog" aria-modal="true" aria-label={`${preview.name} nagyított előnézete`} onClick={() => setPreview(null)}><button type="button" onClick={() => setPreview(null)} className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-950 shadow-xl" aria-label="Előnézet bezárása"><X size={22}/></button><div className="max-h-[92vh] max-w-[94vw]" onClick={(event) => event.stopPropagation()}><img src={preview.url} alt={preview.name} className="max-h-[84vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl"/><p className="mt-3 break-words text-center text-sm font-bold text-white">{preview.name}</p></div></div> : null}
  </section>;
}
