"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, HardDrive, HelpCircle } from "lucide-react";
import HeaderLogoutIconButton from "@/components/auth/HeaderLogoutIconButton";
import BottomInspectorResizeHandle from "./BottomInspectorResizeHandle";
import BoxShelf from "./BoxShelf";
import CommanderPanel from "./CommanderPanel";
import CompareWorkspace from "./CompareWorkspace";
import DrivePremiumLoader from "./DrivePremiumLoader";
import DriveTransferCenter from "./DriveTransferCenter";
import { transferSpeedSample, isTransferTerminal, type TransferTask } from "@/app/lib/transfer-core/transferModel";
import { PersonalUploadHttpError, uploadPersonalFormWithProgress } from "@/app/lib/transfer-core/personalFormUpload";
import { PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION,
  isPersonalUploadSelectionAllowed } from "@/app/lib/content-core/personalUploadPolicy";
import DriveToolbar from "./DriveToolbar";
import FileGridPanel from "./FileGridPanel";
import FolderTreePanel, { type DriveLinkedProjectItem } from "./FolderTreePanel";
import PersonalDriveDetailsPanel, { type PersonalDriveDetailsItem } from "./PersonalDriveDetailsPanel";
import DriveRecentHome from "./DriveRecentHome";
import {sortedRecentUploads} from "@/app/lib/drive-core/recentUploadCore";
import PersonalDrivePreviewDrawer from "./PersonalDrivePreviewDrawer";
import PersonalDriveTrashPanel from "./PersonalDriveTrashPanel";
import TableFullscreenBar from "./TableFullscreenBar";
import type { DriveBox, DriveBoxLifecycleStatus, DriveCompareSeed, DriveDocument, DriveFolder, DriveLayoutMode, DriveStorageQuota, DriveViewMode, DriveVersion } from "./driveTypes";
import type { DriveNavigationRequest } from "./driveBuildInfo";
import type { DriveWorkspaceOption } from "./driveWorkspaceTypes";
import styles from "./DriveWorkspace.module.css";

type PersonalDriveItem = PersonalDriveDetailsItem & {
  objectId: string;
  folderId: string | null;
  retainedIndependently: boolean;
};

type PersonalDriveFolder = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ContentPayload = { ok?: boolean; error?: string; items?: PersonalDriveItem[]; nextOffset?: number | null };
/**
 * Read each page rather than silently truncating the user Drive at 250 items.
 * The 10k UI safety cap raises a visible error instead of hiding older files.
 */
async function fetchPersonalContentPages(): Promise<ContentPayload> {
  const items: PersonalDriveItem[] = [];
  const visitedOffsets = new Set<number>();
  let offset = 0;
  for (let page = 0; page < 51; page++) {
    if (visitedOffsets.has(offset)) throw new Error("A Saját Drive fájllapozása megakadt.");
    visitedOffsets.add(offset);
    const response = await fetch(`/api/drive/personal/content?offset=${offset}`, {
      credentials: "same-origin", cache: "no-store",
    });
    const payload = await response.json() as ContentPayload;
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || "A Saját Drive fájllistája nem tölthető be.");
    }
    items.push(...(payload.items || []));
    if (payload.nextOffset === null || payload.nextOffset === undefined) {
      return { ok: true, items, nextOffset: null };
    }
    if (items.length >= 10_000 || !Number.isSafeInteger(payload.nextOffset) || payload.nextOffset <= offset) {
      throw new Error("A Saját Drive fájllistája túl nagy vagy nem lapozható biztonságosan.");
    }
    offset = payload.nextOffset;
  }
  throw new Error("Túl sok fájllap érkezett; a régebbi fájlok elrejtése helyett a betöltés megszakadt.");
}
type FolderPayload = { ok?: boolean; ready?: boolean; error?: string; folders?: PersonalDriveFolder[] };
type ProjectLinksPayload = { ok?: boolean; error?: string; linkedProjects?: DriveLinkedProjectItem[]; availableProjects?: DriveLinkedProjectItem[] };
type BoxesPayload = { ok?: boolean; error?: string; boxes?: DriveBox[]; folderFeatureReady?: boolean; lifecycleFeatureReady?: boolean };
type StoragePayload = { ok?: boolean; error?: string; storage?: DriveStorageQuota };

type PersonalFolderRenameDialog = {
  folderId: string;
  originalName: string;
  displayName: string;
  error: string;
  busy: boolean;
};

type Props = {
  workspaceName: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  workspaceOptions: DriveWorkspaceOption[];
  selectedWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  onManageIdentities?: () => void;
  navigationRequest?: DriveNavigationRequest;
  storageQuota?: DriveStorageQuota | null;
  onStorageQuotaChange?: (quota: DriveStorageQuota | null) => void;
  onOpenHelp?: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function extensionFromName(value: string) {
  const clean = value.trim();
  const dot = clean.lastIndexOf(".");
  return dot > 0 && dot < clean.length - 1 ? clean.slice(dot + 1).toLowerCase() : "";
}

function buildDriveFolders(folders: PersonalDriveFolder[]): DriveFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const pathFor = (folder: PersonalDriveFolder) => {
    const names: string[] = [folder.name];
    const visited = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return "/" + names.join("/");
  };
  return folders.map((folder) => ({
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    displayName: folder.name,
    path: pathFor(folder),
    displayPath: pathFor(folder),
    sortOrder: folder.sortOrder,
    securityState: "NORMAL",
  }));
}

function itemToDocument(item: PersonalDriveItem): DriveDocument {
  const originalName = item.originalName || item.name;
  const extension = extensionFromName(originalName);
  const clean = item.securityStatus === "clean" && item.virusScanStatus === "clean";
  const version: DriveVersion = {
    id: item.objectId || item.id,
    versionNumber: 1,
    revisionNumber: 0,
    revisionCode: "",
    versionKind: "INITIAL",
    revisionReason: "",
    revisionDate: null,
    numberingOrigin: "SYSTEM",
    numberingCorrectionReason: "",
    numberingCorrectedBy: null,
    numberingCorrectedAt: null,
    originalName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256 || null,
    status: clean ? "AVAILABLE" : "QUARANTINED",
    createdAt: item.createdAt,
  };
  return {
    id: item.id,
    folderId: item.folderId || "all",
    name: item.name,
    extension,
    mimeType: item.mimeType,
    description: "",
    source: item.sourceSystem || "DRIVE",
    currentVersionNumber: 1,
    exportAlias: item.name,
    updatedAt: item.updatedAt,
    currentVersion: version,
  };
}

export default function PersonalDriveWorkspace({ workspaceName, userEmail, userDisplayName, workspaceOptions, selectedWorkspaceId, onWorkspaceChange, onManageIdentities, navigationRequest, storageQuota = null, onStorageQuotaChange, onOpenHelp }: Props) {
  const [items, setItems] = useState<PersonalDriveItem[]>([]);
  const [folders, setFolders] = useState<PersonalDriveFolder[]>([]);
  const [folderCoreReady, setFolderCoreReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewMode, setViewMode] = useState<DriveViewMode>("simple");
  const [layoutMode, setLayoutMode] = useState<DriveLayoutMode>("folders");
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [allFilesMode, setAllFilesMode] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [previewDocumentId, setPreviewDocumentId] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [favoriteDocumentIds, setFavoriteDocumentIds] = useState<string[]>([]);
  const [favoriteBusyDocumentIds, setFavoriteBusyDocumentIds] = useState<string[]>([]);
  const [personalDetailsDockOpen,setPersonalDetailsDockOpen]=useState(true);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [recentOnly,setRecentOnly]=useState(false);
  const [homeMode,setHomeMode]=useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [tableZoom, setTableZoom] = useState(90);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [fullTableInspectorOpen, setFullTableInspectorOpen] = useState(false);
  const [fullTableInspectorLayout, setFullTableInspectorLayout] = useState<"side" | "bottom">("side");
  const [splitDetailsHeight, setSplitDetailsHeight] = useState(330);
  const [foldersDetailsHeight, setFoldersDetailsHeight] = useState(280);
  const [newFolderEditorOpen, setNewFolderEditorOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderSaving, setNewFolderSaving] = useState(false);
  const [folderRenameDialog, setFolderRenameDialog] = useState<PersonalFolderRenameDialog | null>(null);
  const [linkedProjects, setLinkedProjects] = useState<DriveLinkedProjectItem[]>([]);
  const [availableProjects, setAvailableProjects] = useState<DriveLinkedProjectItem[]>([]);
  const [projectLinksDialogOpen, setProjectLinksDialogOpen] = useState(false);
  const [projectLinksBusyId, setProjectLinksBusyId] = useState("");
  const [boxes, setBoxes] = useState<DriveBox[]>([]);
  const [boxCoreReady, setBoxCoreReady] = useState(false);
  const [boxShelfOpen, setBoxShelfOpen] = useState(false);
  const [boxShelfHeight, setBoxShelfHeight] = useState(220);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSeedItems, setCompareSeedItems] = useState<DriveCompareSeed[]>([]);
  const [busy, setBusy] = useState(false);
  const [personalUploadEnabled, setPersonalUploadEnabled] = useState(false);
  const [personalTransferBusy, setPersonalTransferBusy] = useState(false);
  const [personalUploadMaxBytes, setPersonalUploadMaxBytes] = useState(0);
  const personalUploadFileInputRef = useRef<HTMLInputElement>(null);
  const personalTransferActiveRef = useRef(false);
  const personalTransferAbortRef = useRef(new Map<string, AbortController>());
  const personalTransferCancelledRef = useRef(new Set<string>());
  const personalTransferWorkspaceAliveRef = useRef(true);
  const [personalTransferTasks, setPersonalTransferTasks] = useState<TransferTask[]>([]);
  const personalTransferVerifyBusyRef = useRef(new Set<string>());
  const [personalTransferOpen, setPersonalTransferOpen] = useState(false);
  const [personalTransferMinimized, setPersonalTransferMinimized] = useState(false);
  const [bootLoaderVisible, setBootLoaderVisible] = useState(true);
  const [bootLoaderComplete, setBootLoaderComplete] = useState(false);
  const bootLoaderVisibleRef = useRef(true);
  const bootLoaderHoldTimerRef = useRef<number | null>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const fullscreenInspectTimerRef = useRef<number | null>(null);

  const cancelFullscreenInspectTimer = useCallback(() => {
    if (fullscreenInspectTimerRef.current !== null) {
      window.clearTimeout(fullscreenInspectTimerRef.current);
      fullscreenInspectTimerRef.current = null;
    }
  }, []);

  const scheduleFullscreenInspector = useCallback((documentId: string) => {
    cancelFullscreenInspectTimer();
    setSelectedDocumentId(documentId);
    fullscreenInspectTimerRef.current = window.setTimeout(() => {
      setFullTableInspectorOpen(true);
      fullscreenInspectTimerRef.current = null;
    }, 500);
  }, [cancelFullscreenInspectTimer]);

  const closeTableFullscreen = useCallback(() => {
    cancelFullscreenInspectTimer();
    setTableFullscreen(false);
    setFullTableInspectorOpen(false);
    setPreviewDocumentId("");
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [cancelFullscreenInspectTimer]);

  const toggleTableFullscreen = useCallback(() => {
    if (tableFullscreen) {
      closeTableFullscreen();
      return;
    }
    setTableFullscreen(true);
    setFullTableInspectorOpen(false);
    setPreviewDocumentId("");
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, [closeTableFullscreen, tableFullscreen]);

  const changeViewMode = useCallback((next: DriveViewMode) => {
    setViewMode(next);
    setLayoutMode("folders");
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const [contentPayload, folderResponse, projectLinksResponse, boxesResponse, storageResponse, favoritesResponse] = await Promise.all([
        fetchPersonalContentPages(),
        fetch("/api/drive/personal/folders", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/drive/personal/project-links", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/drive/personal/boxes", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/drive/personal/storage", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/drive/personal/favorites", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const folderPayload = await folderResponse.json() as FolderPayload;
      const projectLinksPayload = await projectLinksResponse.json() as ProjectLinksPayload;
      const boxesPayload = await boxesResponse.json() as BoxesPayload;
      const storagePayload = await storageResponse.json() as StoragePayload;
      const favoritesPayload = await favoritesResponse.json().catch(() => ({})) as { ok?: boolean; documentIds?: string[] };
      if (!contentPayload.ok) throw new Error(contentPayload.error || "A Saját Drive tartalma nem tölthető be.");
      if (!folderResponse.ok || !folderPayload.ok) throw new Error(folderPayload.error || "A Saját Drive mappái nem tölthetők be.");
      if (!projectLinksResponse.ok || !projectLinksPayload.ok) throw new Error(projectLinksPayload.error || "A kapcsolt projektek nem tölthetők be.");
      if (!boxesResponse.ok || !boxesPayload.ok) throw new Error(boxesPayload.error || "A Saját Drive CsomagBOX nem tölthető be.");
      if (!storageResponse.ok || !storagePayload.ok || !storagePayload.storage) throw new Error(storagePayload.error || "A Saját Drive tárhelyadata nem tölthető be.");
      const nextItems = contentPayload.items || [];
      const nextFolders = folderPayload.folders || [];
      setItems(nextItems);
      setFolders(nextFolders);
      setFolderCoreReady(folderPayload.ready === true);
      setLinkedProjects(projectLinksPayload.linkedProjects || []);
      setAvailableProjects(projectLinksPayload.availableProjects || []);
      setBoxes(boxesPayload.boxes || []);
      setBoxCoreReady(true);
      setFavoriteDocumentIds(favoritesResponse.ok && favoritesPayload.ok ? favoritesPayload.documentIds || [] : []);
      onStorageQuotaChange?.(storagePayload.storage);
      setSelectedFolderId((current) => current !== "all" && !nextFolders.some((folder) => folder.id === current) ? "all" : current);
      setSelectedDocumentId((current) => nextItems.some((item) => item.id === current) ? current : "");
      setSelectedDocumentIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
      if (bootLoaderVisibleRef.current) {
        setBootLoaderComplete(true);
        if (bootLoaderHoldTimerRef.current !== null) window.clearTimeout(bootLoaderHoldTimerRef.current);
        bootLoaderHoldTimerRef.current = window.setTimeout(() => {
          bootLoaderVisibleRef.current = false;
          setBootLoaderVisible(false);
          bootLoaderHoldTimerRef.current = null;
        }, 1800);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Saját Drive tartalma nem tölthető be.");
      if (bootLoaderVisibleRef.current) {
        bootLoaderVisibleRef.current = false;
        setBootLoaderVisible(false);
        setBootLoaderComplete(false);
      }
    }
  }, [onStorageQuotaChange]);

  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem("dimpro-drive-personal-view-v2");
      const storedLayout = window.localStorage.getItem("dimpro-drive-personal-layout-v3");
      const storedBoxOpen = window.localStorage.getItem("dimpro-drive-personal-box-open");
      const storedBoxHeight = Number(window.localStorage.getItem("dimpro-drive-personal-box-height") || "");
      if (storedView === "simple" || storedView === "engineering") setViewMode(storedView);
      if (["folders", "three", "two", "one", "split", "commander"].includes(storedLayout || "")) setLayoutMode(storedLayout as DriveLayoutMode);
      if (storedBoxOpen === "1") setBoxShelfOpen(true);
      if (Number.isFinite(storedBoxHeight) && storedBoxHeight >= 118) setBoxShelfHeight(storedBoxHeight);
    } catch {}
  }, []);

  useEffect(() => { try { window.localStorage.setItem("dimpro-drive-personal-view-v2", viewMode); } catch {} }, [viewMode]);
  useEffect(() => { try { window.localStorage.setItem("dimpro-drive-personal-layout-v3", layoutMode); } catch {} }, [layoutMode]);
  useEffect(() => { try { window.localStorage.setItem("dimpro-drive-personal-box-open", boxShelfOpen ? "1" : "0"); } catch {} }, [boxShelfOpen]);
  useEffect(() => { try { window.localStorage.setItem("dimpro-drive-personal-box-height", String(Math.round(boxShelfHeight))); } catch {} }, [boxShelfHeight]);

  useEffect(() => {
    personalTransferWorkspaceAliveRef.current = true;
    const controller = new AbortController();
    void fetch("/api/drive/personal/uploads", {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response): Promise<{enabled?:boolean;maxBytes?:number}> =>
      response.ok ? response.json() : {enabled:false,maxBytes:0})
      .then(response => {
        if (controller.signal.aborted) return;
        setPersonalUploadEnabled(response.enabled === true);
        setPersonalUploadMaxBytes(response.enabled === true ? Math.max(0, Number(response.maxBytes || 0)) : 0);
      }).catch(() => { if (!controller.signal.aborted) setPersonalUploadEnabled(false); });
    const controllers = personalTransferAbortRef.current;
    return () => {
      personalTransferWorkspaceAliveRef.current = false;
      controller.abort();
      controllers.forEach(item => item.abort());
    };
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!personalTransferActiveRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function updatePersonalTransfer(id: string, patch: Partial<TransferTask>) {
    setPersonalTransferTasks(current => current.map(item =>
      item.id === id ? {...item, ...patch, updatedAt: Date.now()} : item));
  }

  async function verifyPersonalTransfer(id: string) {
    if (personalTransferVerifyBusyRef.current.has(id)) return;
    const task = personalTransferTasks.find(item => item.id === id);
    if (!task || !["CONFIRMATION_UNKNOWN", "STATUS_UNAVAILABLE"].includes(task.phase)) return;
    personalTransferVerifyBusyRef.current.add(id);
    updatePersonalTransfer(id, { phase: "VERIFYING", speedBps: null,
      error: "A szerver mentési visszaigazolásának ellenőrzése. Nincs új feltöltés." });
    try {
      const response = await fetch(`/api/drive/personal/uploads/status/${encodeURIComponent(id)}`, {
        credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json() as {
        ok?: boolean; state?: string; contentRefId?: string; sizeBytes?: number; code?: string;
      };
      if (response.ok && response.status === 200 && result.ok === true
        && result.state === "VERIFIED_CLEAN" && result.sizeBytes === task.sizeBytes
        && typeof result.contentRefId === "string") {
        updatePersonalTransfer(id, { phase: "AVAILABLE", uploadedBytes: task.sizeBytes,
          speedBps: null, error: null, retryable: false });
        // Content list refresh failure cannot revoke a verified S3 receipt.
        void load().catch(() => setError("A mentés igazolt, de a fájllista frissítése sikertelen."));
      } else if (response.status === 202 && result.state === "PENDING_OR_NOT_FOUND") {
        updatePersonalTransfer(id, { phase: "CONFIRMATION_UNKNOWN", speedBps: null,
          error: "A mentés még nem igazolható. Ez nem bizonyítja a feltöltés sikertelenségét. Ne küldd újra automatikusan.",
          retryable: false });
      } else {
        updatePersonalTransfer(id, { phase: "STATUS_UNAVAILABLE", speedBps: null,
          error: "A mentett fájl épsége vagy jogosultsága nem igazolható. Újrafeltöltés helyett kérj ellenőrzést.",
          retryable: false });
      }
    } catch {
      updatePersonalTransfer(id, { phase: "STATUS_UNAVAILABLE", speedBps: null,
        error: "A szerver nem érhető el. A feltöltés eredménye továbbra is bizonytalan.",
        retryable: false });
    } finally {
      personalTransferVerifyBusyRef.current.delete(id);
    }
  }

  async function uploadPersonalFiles(files: File[]) {
    if (!personalUploadEnabled || personalTransferActiveRef.current || files.length < 1) return;
    if (!isPersonalUploadSelectionAllowed(files.length)) {
      setError(`Egy feltöltési sorba legfeljebb ${PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION} fájl jelölhető ki. A fájlok egyenként, biztonsági ellenőrzéssel kerülnek feltöltésre.`);
      if (personalUploadFileInputRef.current) personalUploadFileInputRef.current.value="";
      return;
    }
    personalTransferActiveRef.current = true;
    setPersonalTransferBusy(true);
    setPersonalTransferOpen(true);
    setPersonalTransferMinimized(false);
    setError("");
    setNotice("");
    const folderLabel = selectedFolder?.name || "Saját Drive gyökér";
    const targetFolderId = selectedFolderId === "all" ? "" : selectedFolderId;
    const tasks = files.map(file => ({ id: crypto.randomUUID(), file }));
    const pendingTasks: TransferTask[] = tasks.map(({id,file}) => ({
      id, fileName:file.name, folderName:folderLabel, sizeBytes:file.size,
      uploadedBytes:0, phase:"QUEUED", speedBps:null, error:null, updatedAt:Date.now(), retryable:false,
    }));
    setPersonalTransferTasks(current => [...current,...pendingTasks]);
    let succeeded = 0;
    const failures: string[] = [];
    try {
      // One POST at a time: small bounded memory, no concurrent per-user quota races.
      for (const {id,file} of tasks) {
        if (!personalTransferWorkspaceAliveRef.current) break;
        if (personalTransferCancelledRef.current.has(id)) {
          updatePersonalTransfer(id, {phase:"CANCELLED",speedBps:null,retryable:false});
          continue;
        }
        if (file.size < 1 || file.size > personalUploadMaxBytes) {
          updatePersonalTransfer(id,{phase:"ERROR", retryable:false,
            error:"A fájl nem felel meg a "+formatBytes(personalUploadMaxBytes)+" biztonságos méretkorlátnak."});
          failures.push(file.name); continue;
        }
        const controller = new AbortController();
        personalTransferAbortRef.current.set(id,controller);
        let sample: {loaded:number;at:number;smoothedBps:number|null} | null = null;
        let lastProgressRenderAt = -Infinity;
        updatePersonalTransfer(id,{phase:"UPLOADING",error:null});
        try {
          const result = await uploadPersonalFormWithProgress({
            file, folderId:targetFolderId,
            requestId:id, signal:controller.signal,
            onProgress:bytes => {
              const now = performance.now();
              sample = transferSpeedSample(sample, bytes, now);
              // Hundreds of files: limit React list updates to ~6/sec.
              if (now - lastProgressRenderAt >= 160 || bytes >= file.size) {
                lastProgressRenderAt = now;
                updatePersonalTransfer(id,{
                  uploadedBytes:bytes, speedBps:sample.smoothedBps, phase:"UPLOADING",
                });
              }
            },
            onNetworkSent:()=>updatePersonalTransfer(id,{
              uploadedBytes:file.size, speedBps:null, phase:"SCANNING",
            }),
          });
          succeeded++;
          updatePersonalTransfer(id,{
            phase:"AVAILABLE", uploadedBytes:file.size, speedBps:null, error:result.placedInFolder===false
              ? "A fájl a Saját Drive gyökerébe került; a célmappába helyezés nem sikerült." : null,
            retryable:false,
          });
          if (succeeded % 50 === 0 && personalTransferWorkspaceAliveRef.current) await load();
        } catch (reason) {
          const error=reason instanceof PersonalUploadHttpError ? reason : null;
          const cancelled=controller.signal.aborted;
          const uncertain=error?.uncertain === true;
          updatePersonalTransfer(id,{
            phase:uncertain?"CONFIRMATION_UNKNOWN":cancelled?"CANCELLED":
              error?.status===422?"INFECTED":"ERROR",
            error:reason instanceof Error ? reason.message : "A fájlfeltöltés sikertelen.",
            speedBps:null, retryable:false,
          });
          failures.push(file.name);
        } finally { personalTransferAbortRef.current.delete(id); }
      }
      if (personalTransferWorkspaceAliveRef.current) {
        await load();
        setNotice(succeeded ? succeeded+" fájl ellenőrzötten a Saját Drive-ba került." : "");
        if (failures.length) setError(failures.length+" fájl nem fejeződött be igazoltan. Az Átvitelek panelen ellenőrizhetők.");
      }
    } finally {
      personalTransferActiveRef.current = false;
      if (personalTransferWorkspaceAliveRef.current) {
        setPersonalTransferBusy(false);
        if (personalUploadFileInputRef.current) personalUploadFileInputRef.current.value="";
      }
    }
  }

  useEffect(() => {
    bootLoaderVisibleRef.current = true;
    setBootLoaderVisible(true);
    setBootLoaderComplete(false);
    void load();
    return () => {
      if (bootLoaderHoldTimerRef.current !== null) window.clearTimeout(bootLoaderHoldTimerRef.current);
      cancelFullscreenInspectTimer();
    };
  }, [cancelFullscreenInspectTimer, load]);

  useEffect(() => {
    if (!tableFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewDocumentId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPreviewDocumentId("");
        return;
      }
      if (fullTableInspectorOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setFullTableInspectorOpen(false);
        return;
      }
      if (!document.fullscreenElement) closeTableFullscreen();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        cancelFullscreenInspectTimer();
        setTableFullscreen(false);
        setFullTableInspectorOpen(false);
        setPreviewDocumentId("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [cancelFullscreenInspectTimer, closeTableFullscreen, fullTableInspectorOpen, previewDocumentId, tableFullscreen]);

  useEffect(() => {
    if (!navigationRequest) return;
    setHomeMode(navigationRequest.target==="home");
    setRecentOnly(navigationRequest.target==="recent");
    if (navigationRequest.target==="home" || navigationRequest.target==="recent") {
      setTrashMode(false);setFavoriteOnly(false);setSelectedFolderId("all");setQuery("");return;
    }
    if (navigationRequest.target === "trash") { setTrashMode(true); setFavoriteOnly(false); setPreviewDocumentId(""); return; }
    if (navigationRequest.target === "favorites") { setTrashMode(false); setFavoriteOnly(true); setSelectedFolderId("all"); return; }
    if (navigationRequest.target === "boxes") { setTrashMode(false); setBoxShelfOpen(true); return; }
    if (navigationRequest.target === "documents") { setTrashMode(false); setFavoriteOnly(false); }
  }, [navigationRequest]);

  const driveFolders = useMemo(() => buildDriveFolders(folders), [folders]);
  const commanderFolders = useMemo<DriveFolder[]>(() => [
    { id: "all", parentId: null, name: "Saját Drive", displayName: "Saját Drive", path: "/", displayPath: "/", sortOrder: -1, securityState: "NORMAL" },
    ...driveFolders.map((folder) => ({ ...folder, parentId: folder.parentId || "all" })),
  ], [driveFolders]);
  const documents = useMemo(() => items.map(itemToDocument), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const folderById = useMemo(() => new Map(driveFolders.map((folder) => [folder.id, folder])), [driveFolders]);
  const selectedFolder = selectedFolderId === "all" ? null : folderById.get(selectedFolderId) || null;
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || null;
  const previewDocument = documents.find((document) => document.id === previewDocumentId) || null;
  const selectedItem = selectedDocumentId ? itemById.get(selectedDocumentId) || null : null;
  const boxColorsByDocument = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const box of boxes) {
      for (const item of box.items || []) {
        const current = map[item.documentId] || [];
        map[item.documentId] = [...current, "blue"];
      }
    }
    return map;
  }, [boxes]);

  const descendantFolderIds = useMemo(() => {
    if (selectedFolderId === "all") return new Set<string>();
    const result = new Set<string>([selectedFolderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of driveFolders) if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) { result.add(folder.id); changed = true; }
    }
    return result;
  }, [driveFolders, selectedFolderId]);

  const visibleDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return documents.filter((document) => {
      const folderMatch = favoriteOnly || recentOnly ? true : selectedFolderId === "all" || (allFilesMode ? descendantFolderIds.has(document.folderId) : document.folderId === selectedFolderId);
      if (!folderMatch || (favoriteOnly && !favoriteDocumentIds.includes(document.id))) return false;
      if (recentOnly && !document.currentVersion) return false;
      if (!normalized) return true;
      const item = itemById.get(document.id);
      return [document.name, item?.originalName, item?.sourceSystem, document.extension].filter(Boolean).some((value) => String(value).toLocaleLowerCase("hu-HU").includes(normalized));
    }).sort((a,b)=>recentOnly ? (Date.parse(b.currentVersion?.createdAt || b.updatedAt) || 0)-(Date.parse(a.currentVersion?.createdAt || a.updatedAt)||0) : 0);
  }, [allFilesMode, descendantFolderIds, documents, favoriteDocumentIds, favoriteOnly, recentOnly, itemById, query, selectedFolderId]);

  const folderDocumentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents) if (document.folderId !== "all") counts.set(document.folderId, (counts.get(document.folderId) || 0) + 1);
    return counts;
  }, [documents]);
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.sizeBytes || 0), 0), [items]);
  const title = recentOnly ? "Legutóbbi feltöltések" : favoriteOnly ? "Kedvencek" : selectedFolder?.displayName || selectedFolder?.name || "Saját Drive";
  const subtitle = `${visibleDocuments.length} fájl${selectedFolder && allFilesMode ? " · almappákkal együtt" : ""}`;
  const folderNameForSelectedItem = selectedItem?.folderId ? folderById.get(selectedItem.folderId)?.displayName || folderById.get(selectedItem.folderId)?.name || "Saját Drive" : "Saját Drive";
  const breadcrumbParts = selectedFolder ? (selectedFolder.displayPath || selectedFolder.path).split("/").filter(Boolean) : [];

  const toggleFavorite = useCallback(async (document: DriveDocument) => {
    if (favoriteBusyDocumentIds.includes(document.id)) return;
    const favorite = !favoriteDocumentIds.includes(document.id);
    setFavoriteBusyDocumentIds((current) => [...new Set([...current, document.id])]);
    setError("");
    try {
      const response = await fetch("/api/drive/personal/favorites", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: document.id, favorite }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; documentIds?: string[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A kedvenc állapot nem menthető.");
      setFavoriteDocumentIds(payload.documentIds || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kedvenc állapot nem menthető.");
    } finally {
      setFavoriteBusyDocumentIds((current) => current.filter((id) => id !== document.id));
    }
  }, [favoriteBusyDocumentIds, favoriteDocumentIds]);

  const createFolder = useCallback(async (parentId: string | null, name: string) => {
    setError(""); setNotice("");
    const response = await fetch("/api/drive/personal/folders", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId, name }) });
    const payload = await response.json() as { ok?: boolean; error?: string; folder?: PersonalDriveFolder };
    if (!response.ok || !payload.ok || !payload.folder) throw new Error(payload.error || "A mappa nem hozható létre.");
    setFolders((current) => [...current, payload.folder as PersonalDriveFolder]);
    setSelectedFolderId(payload.folder.id);
    setNotice(`Mappa létrehozva: ${payload.folder.name}`);
    return payload.folder;
  }, []);

  const saveNewFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || newFolderSaving || !folderCoreReady) return;
    setNewFolderSaving(true);
    try {
      await createFolder(selectedFolderId === "all" ? null : selectedFolderId, name);
      setNewFolderName(""); setNewFolderEditorOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A mappa nem hozható létre."); }
    finally { setNewFolderSaving(false); }
  }, [createFolder, folderCoreReady, newFolderName, newFolderSaving, selectedFolderId]);

  function renameSelectedFolder() {
    if (!selectedFolder || !folderCoreReady) return;
    const currentName = selectedFolder.displayName || selectedFolder.name;
    setFolderRenameDialog({ folderId: selectedFolder.id, originalName: currentName, displayName: currentName, error: "", busy: false });
  }

  async function submitFolderRename() {
    const dialog = folderRenameDialog;
    if (!dialog || dialog.busy) return;
    const name = dialog.displayName.trim();
    if (!name) {
      setFolderRenameDialog((current) => current ? { ...current, error: "A mappa neve kötelező." } : current);
      return;
    }
    if (name === dialog.originalName) { setFolderRenameDialog(null); return; }
    setFolderRenameDialog((current) => current ? { ...current, busy: true, error: "" } : current);
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/drive/personal/folders/${encodeURIComponent(dialog.folderId)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; folder?: PersonalDriveFolder };
      if (!response.ok || !payload.ok || !payload.folder) throw new Error(payload.error || "A mappa átnevezése sikertelen.");
      setFolders((current) => current.map((folder) => folder.id === dialog.folderId ? { ...folder, ...payload.folder } : folder));
      setFolderRenameDialog(null);
      setNotice(`Mappa átnevezve: ${name}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A mappa átnevezése sikertelen.";
      setFolderRenameDialog((current) => current ? { ...current, busy: false, error: message } : current);
    }
  }

  const refreshProjectLinks = useCallback(async () => {
    const response = await fetch("/api/drive/personal/project-links", { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json() as ProjectLinksPayload;
    if (!response.ok || !payload.ok) throw new Error(payload.error || "A kapcsolt projektek nem tölthetők be.");
    setLinkedProjects(payload.linkedProjects || []);
    setAvailableProjects(payload.availableProjects || []);
  }, []);

  const attachProject = useCallback(async (projectId: string) => {
    if (projectLinksBusyId) return;
    setProjectLinksBusyId(projectId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/drive/personal/project-links", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projekt nem csatolható.");
      await refreshProjectLinks();
      setNotice("Projekt csatolva a Saját Drive-hoz.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A projekt nem csatolható."); }
    finally { setProjectLinksBusyId(""); }
  }, [projectLinksBusyId, refreshProjectLinks]);

  const detachProject = useCallback(async (projectId: string) => {
    if (projectLinksBusyId) return;
    setProjectLinksBusyId(projectId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/drive/personal/project-links", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projekt nem választható le.");
      await refreshProjectLinks();
      setNotice("Projekt leválasztva a Saját Drive-ról.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A projekt nem választható le."); }
    finally { setProjectLinksBusyId(""); }
  }, [projectLinksBusyId, refreshProjectLinks]);

  const refreshBoxes = useCallback(async () => {
    const response = await fetch("/api/drive/personal/boxes", { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json() as BoxesPayload;
    if (!response.ok || !payload.ok) throw new Error(payload.error || "A Saját Drive CsomagBOX nem tölthető be.");
    setBoxes(payload.boxes || []); setBoxCoreReady(true);
  }, []);

  const createBox = useCallback(async (input: { name:string; purpose:string; colorToken:string; iconKey:string; note:string }) => {
    setBusy(true); setError("");
    try { const response=await fetch("/api/drive/personal/boxes",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(input)}); const payload=await response.json() as {ok?:boolean;error?:string}; if(!response.ok||!payload.ok)throw new Error(payload.error||"A CsomagBOX nem hozható létre."); await refreshBoxes(); setNotice("CsomagBOX létrehozva."); }
    catch(caught){setError(caught instanceof Error?caught.message:"A CsomagBOX nem hozható létre.");throw caught;} finally{setBusy(false)}
  },[refreshBoxes]);

  const addDocumentToBox = useCallback(async (boxId:string, document:DriveDocument) => {
    setBusy(true); setError("");
    try { const response=await fetch(`/api/drive/personal/boxes/${encodeURIComponent(boxId)}/items`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({documentId:document.id,versionId:document.currentVersion?.id||null})}); const payload=await response.json() as {ok?:boolean;error?:string}; if(!response.ok||!payload.ok)throw new Error(payload.error||"A fájl nem adható a CsomagBOX-hoz."); await refreshBoxes(); }
    catch(caught){setError(caught instanceof Error?caught.message:"A fájl nem adható a CsomagBOX-hoz.");throw caught;} finally{setBusy(false)}
  },[refreshBoxes]);

  const removeBoxItem = useCallback(async (boxId:string,itemId:string) => {
    setBusy(true); setError(""); try { const response=await fetch(`/api/drive/personal/boxes/${encodeURIComponent(boxId)}/items/${encodeURIComponent(itemId)}`,{method:"DELETE",credentials:"same-origin"}); const payload=await response.json() as {ok?:boolean;error?:string}; if(!response.ok||!payload.ok)throw new Error(payload.error||"A fájl nem távolítható el a CsomagBOX-ból."); await refreshBoxes(); } catch(caught){setError(caught instanceof Error?caught.message:"A fájl nem távolítható el a CsomagBOX-ból.");throw caught;} finally{setBusy(false)}
  },[refreshBoxes]);

  const createBoxFolder = useCallback(async (boxId:string,parentId:string|null,name:string) => {
    setBusy(true); setError(""); try { const response=await fetch(`/api/drive/personal/boxes/${encodeURIComponent(boxId)}/folders`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({parentId,name})}); const payload=await response.json() as {ok?:boolean;error?:string}; if(!response.ok||!payload.ok)throw new Error(payload.error||"A CsomagBOX mappa nem hozható létre."); await refreshBoxes(); } catch(caught){setError(caught instanceof Error?caught.message:"A CsomagBOX mappa nem hozható létre.");throw caught;} finally{setBusy(false)}
  },[refreshBoxes]);

  const moveBoxItem = useCallback(async (boxId:string,itemId:string,folderId:string|null) => {
    setBusy(true); setError(""); try { const response=await fetch(`/api/drive/personal/boxes/${encodeURIComponent(boxId)}/items/${encodeURIComponent(itemId)}/move`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({folderId})}); const payload=await response.json() as {ok?:boolean;error?:string}; if(!response.ok||!payload.ok)throw new Error(payload.error||"A CsomagBOX elem nem helyezhető át."); await refreshBoxes(); } catch(caught){setError(caught instanceof Error?caught.message:"A CsomagBOX elem nem helyezhető át.");throw caught;} finally{setBusy(false)}
  },[refreshBoxes]);

  const setBoxLifecycle = useCallback(async (boxId:string,nextStatus:DriveBoxLifecycleStatus) => {
    setBusy(true); setError(""); try { const response=await fetch(`/api/drive/personal/boxes/${encodeURIComponent(boxId)}/lifecycle`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({nextStatus})}); const payload=await response.json() as {ok?:boolean;error?:string}; if(!response.ok||!payload.ok)throw new Error(payload.error||"A CsomagBOX állapot nem módosítható."); await refreshBoxes(); } catch(caught){setError(caught instanceof Error?caught.message:"A CsomagBOX állapot nem módosítható.");throw caught;} finally{setBusy(false)}
  },[refreshBoxes]);

  const downloadBoxArchive = useCallback((box: DriveBox, archiveName: string) => {
    const normalized = archiveName.trim();
    if (!normalized) return;
    const url = `/api/drive/personal/boxes/${encodeURIComponent(box.id)}/download?name=${encodeURIComponent(normalized)}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${normalized.replace(/\.zip$/i, "") || "DIMPRO_CsomagBOX"}.zip`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice(`ZIP csomag előkészítése: ${normalized}`);
  }, []);

  const openCompare = useCallback((seedItems?: DriveCompareSeed[]) => {
    const validSeeds: DriveCompareSeed[] = [];
    for (const seed of seedItems || []) {
      if (!seed.documentId || !documents.some((document) => document.id === seed.documentId)) continue;
      const key = `${seed.documentId}::${seed.versionId || "current"}`;
      if (validSeeds.some((item) => `${item.documentId}::${item.versionId || "current"}` === key)) continue;
      validSeeds.push({ documentId: seed.documentId, versionId: seed.versionId || null });
      if (validSeeds.length >= 2) break;
    }
    if (validSeeds.length >= 2) {
      setCompareSeedItems(validSeeds);
    } else {
      const selected = documents.find((document) => document.id === selectedDocumentId) || null;
      const fallback = documents.find((document) => document.id !== selected?.id) || null;
      setCompareSeedItems([
        selected ? { documentId: selected.id, versionId: selected.currentVersion?.id || null } : null,
        fallback ? { documentId: fallback.id, versionId: fallback.currentVersion?.id || null } : null,
      ].filter((item): item is DriveCompareSeed => Boolean(item)));
    }
    setCompareActive(true);
    setBoxShelfOpen(false);
  }, [documents, selectedDocumentId]);

  const openDocumentBox = useCallback((document: DriveDocument) => {
    setSelectedDocumentId(document.id);
    setBoxShelfOpen(true);
    if (fullTableInspectorOpen && fullTableInspectorLayout === "side") setFullTableInspectorOpen(false);
  }, [fullTableInspectorLayout, fullTableInspectorOpen]);

  const moveItem = useCallback(async (item: PersonalDriveItem, folderId: string | null) => {
    if (!folderCoreReady || (item.folderId || null) === folderId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(item.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ folderId }) });
      const payload = await response.json() as { ok?: boolean; error?: string; ref?: { folderId?: string | null; updatedAt?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A fájl nem helyezhető át.");
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, folderId: payload.ref?.folderId || null, updatedAt: payload.ref?.updatedAt || row.updatedAt } : row));
      setNotice("Fájl áthelyezve.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájl nem helyezhető át."); }
    finally { setBusy(false); }
  }, [folderCoreReady]);

  const moveDocument = useCallback(async (document: DriveDocument, targetFolderId: string) => {
    const item = itemById.get(document.id);
    if (!item) return;
    await moveItem(item, targetFolderId === "all" ? null : targetFolderId);
  }, [itemById, moveItem]);

  const deletePersonalDocuments = useCallback(async (documentIds: string[]) => {
    const refIds = [...new Set(documentIds.filter((id) => itemById.has(id)))];
    if (!refIds.length || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const preflightResponse = await fetch("/api/drive/personal/content/bulk-delete", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ refIds, mode: "preflight" }),
      });
      const preflight = await preflightResponse.json() as { ok?: boolean; error?: string; blocked?: boolean; dependencies?: Array<{ displayName: string; reference: string; status: string }> };
      if (!preflightResponse.ok || !preflight.ok) throw new Error(preflight.error || "A törlési előellenőrzés sikertelen.");
      if (preflight.blocked) {
        const lines = (preflight.dependencies || []).map((dependency) => `${dependency.displayName} → ${dependency.reference} (${dependency.status})`);
        setError(`A fájl nem törölhető, mert aktív CsomagBOX-kapcsolata van.${lines.length ? ` ${lines.join(" · ")}` : ""}`);
        return;
      }
      const names = refIds.map((id) => itemById.get(id)?.name || id);
      const approved = window.confirm(refIds.length === 1
        ? `Biztosan eltávolítod a Saját Drive-ból?\n\n${names[0]}\n\nA fizikai fájl nem törlődik azonnal.`
        : `Biztosan eltávolítod ezt a ${refIds.length} fájlt a Saját Drive-ból?\n\nA fizikai fájlok nem törlődnek azonnal.`);
      if (!approved) return;
      const response = await fetch("/api/drive/personal/content/bulk-delete", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ refIds }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; removedIds?: string[]; removedCount?: number; dependencies?: Array<{ displayName: string; reference: string }> };
      if (!response.ok || !payload.ok) {
        if (response.status === 409 && payload.dependencies?.length) {
          throw new Error(`A fájl időközben kapcsolódott CsomagBOX-hoz: ${payload.dependencies.map((dependency) => `${dependency.displayName} → ${dependency.reference}`).join(" · ")}`);
        }
        throw new Error(payload.error || "A Saját Drive törlés sikertelen.");
      }
      const removed = new Set(payload.removedIds || refIds);
      setItems((current) => current.filter((item) => !removed.has(item.id)));
      setSelectedDocumentIds((current) => current.filter((id) => !removed.has(id)));
      setSelectedDocumentId((current) => removed.has(current) ? "" : current);
      setPreviewDocumentId((current) => removed.has(current) ? "" : current);
      setNotice(`${payload.removedCount || removed.size} fájl eltávolítva a Saját Drive-ból.`);
      await refreshBoxes();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Saját Drive törlés sikertelen.");
    } finally {
      setBusy(false);
    }
  }, [busy, itemById, refreshBoxes]);

  const moveDocumentsToFolder = useCallback(async (documentIds: string[], targetFolderId: string) => {
    if (!folderCoreReady || busy) return;
    const refIds = [...new Set(documentIds)].filter((id) => itemById.has(id));
    if (!refIds.length) return;
    const folderId = targetFolderId === "all" ? null : targetFolderId;
    setBusy(true); setError(""); setNotice("");
    try {
      let moved = 0;
      for (const refId of refIds) {
        const item = itemById.get(refId);
        if (!item || (item.folderId || null) === folderId) continue;
        const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(refId)}`, {
          method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ folderId }),
        });
        const payload = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error || `${item.name} áthelyezése sikertelen.`);
        moved += 1;
      }
      await load();
      setSelectedDocumentIds([]);
      setNotice(`${moved} fájl áthelyezve.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájlok áthelyezése sikertelen."); }
    finally { setBusy(false); }
  }, [busy, folderCoreReady, itemById, load]);

  const moveFolderToFolder = useCallback(async (folderId: string, targetFolderId: string) => {
    if (!folderCoreReady || busy) return;
    const targetParentId = targetFolderId === "all" ? null : targetFolderId;
    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder || folder.parentId === targetParentId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/drive/personal/folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId: targetParentId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A mappa áthelyezése sikertelen.");
      await load();
      setSelectedFolderId(folderId);
      setNotice(`Mappa áthelyezve: ${folder.name}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A mappa áthelyezése sikertelen."); }
    finally { setBusy(false); }
  }, [busy, folderCoreReady, folders, load]);

  const downloadItem = useCallback(async (item: PersonalDriveDetailsItem) => {
    setError("");
    const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(item.id)}/download`, { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } };
    if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A fájl nem tölthető le.");
    const link = document.createElement("a"); link.href = payload.download.url; link.rel = "noopener"; link.click();
  }, []);

  const openDocument = useCallback((document: DriveDocument) => {
    cancelFullscreenInspectTimer();
    setSelectedDocumentId(document.id);
    if (tableFullscreen) setFullTableInspectorOpen(false);
    setPreviewDocumentId(document.id);
  }, [cancelFullscreenInspectTimer, tableFullscreen]);

  const browserClass = [styles.browser, layoutMode === "folders" ? styles.layoutFolders : "", layoutMode === "two" ? styles.layoutTwo : "", layoutMode === "one" ? styles.layoutOne : "", layoutMode === "split" ? styles.layoutSplit : "", layoutMode === "commander" ? styles.layoutCommander : ""].filter(Boolean).join(" ");
  const folderHidden = layoutMode !== "three" && layoutMode !== "folders";
  const detailsHidden = layoutMode === "one";

  const grid = () => <FileGridPanel
    title={title}
    subtitle={subtitle}
    documents={visibleDocuments}
    recentMode={recentOnly}
    selectedDocumentId={selectedDocumentId}
    viewMode={viewMode}
    onViewModeChange={changeViewMode}
    allowedViewModes={["simple", "engineering"]}
    onSelectDocument={(document) => {
      if (tableFullscreen) scheduleFullscreenInspector(document.id);
      else setSelectedDocumentId(document.id);
    }}
    onOpenDocument={(document) => void openDocument(document)}
    onRefresh={() => void load()}
    boxColorsByDocument={boxColorsByDocument}
    favoriteDocumentIds={favoriteDocumentIds}
    favoriteBusyDocumentIds={favoriteBusyDocumentIds}
    onToggleFavorite={(document) => void toggleFavorite(document)}
    metadataByDocument={{}}
    folders={favoriteOnly || recentOnly ? [] : driveFolders}
    selectedFolderId={selectedFolderId}
    allFilesMode={allFilesMode}
    onAllFilesModeChange={setAllFilesMode}
    currentFolder={favoriteOnly || recentOnly ? null : selectedFolder}
    onFolderChange={(folderId) => { setFavoriteOnly(false); setSelectedFolderId(folderId); setAllFilesMode(false); }}
    onNavigateParent={() => setSelectedFolderId(selectedFolder?.parentId || "all")}
    canWrite={folderCoreReady}
    canApprove={false}
    membershipRole=""
    busy={busy}
    tableZoom={tableZoom}
    dragPanEnabled
    selectedDocumentIds={selectedDocumentIds}
    onSelectionChange={setSelectedDocumentIds}
    canDelete
    canDeleteFolder={false}
    onDeleteSelected={deletePersonalDocuments}
    onOpenBrowserDocument={(document) => void openDocument(document)}
    onOpenBoxDocument={openDocumentBox}
    onDownloadDocument={(document) => { const item = itemById.get(document.id); if (item) void downloadItem(item).catch((caught) => setError(caught instanceof Error ? caught.message : "A fájl nem tölthető le.")); }}
    onMoveDocumentsToFolder={moveDocumentsToFolder}
    onMoveFolderToFolder={moveFolderToFolder}
    newFolderEditorOpen={newFolderEditorOpen}
    newFolderName={newFolderName}
    newFolderSaving={newFolderSaving}
    onNewFolderNameChange={setNewFolderName}
    onSaveNewFolder={() => void saveNewFolder()}
    onCancelNewFolder={() => { setNewFolderEditorOpen(false); setNewFolderName(""); }}
  />;

  if (bootLoaderVisible) return <DrivePremiumLoader complete={bootLoaderComplete} workspaceType="PERSONAL" />;

  if (trashMode) return (
    <div className={styles.workspaceWrap}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}><div className={styles.projectIcon}><HardDrive size={18} /></div><div><h1>{workspaceName}</h1><div className={styles.projectMeta}><span>Személyes DIMPRO tárhely</span><span className={styles.activeBadge}>Aktív</span>{storageQuota ? <span className={styles.projectStorageMeter} data-level={storageQuota.usagePercent >= storageQuota.criticalPercent ? "critical" : storageQuota.usagePercent >= storageQuota.warningPercent ? "warning" : "normal"} title={`Foglalt: ${formatBytes(storageQuota.occupiedBytes)} · Ebből függő feltöltések: ${formatBytes(storageQuota.reservedBytes || 0)} · Keret: ${formatBytes(storageQuota.quotaBytes)}`}><span className={styles.projectStorageLabel}>Tárhely {formatBytes(storageQuota.occupiedBytes)} / {formatBytes(storageQuota.quotaBytes)}</span><i><b style={{ width: `${Math.max(0, Math.min(100, storageQuota.usagePercent))}%` }} /></i></span> : null}</div></div></div>
        {workspaceOptions.length > 0 && selectedWorkspaceId ? <div className={styles.workspaceSelectorWrap}><label className={styles.workspaceSelectorLabel} htmlFor="drive-personal-trash-workspace-selector">Munkatér</label><select id="drive-personal-trash-workspace-selector" className={styles.workspaceSelector} value={selectedWorkspaceId} onChange={(event) => onWorkspaceChange(event.target.value)}>{workspaceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.code ? " · " + option.code : ""}</option>)}</select></div> : null}
        <div className={styles.headerActions}><button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button><button type="button" className={styles.headerAction} onClick={onOpenHelp}><HelpCircle size={14} /> Súgó</button><button type="button" className={`${styles.userPill} ${styles.userPillButton}`} onClick={onManageIdentities} title="E-mail-címek és munkahelyek kezelése"><span className={styles.avatar}>{(userDisplayName || userEmail || "D").trim().charAt(0).toUpperCase() || "D"}</span><div className={styles.userIdentityText}><strong>{userDisplayName || "DIMPRO felhasználó"}</strong><span title={userEmail || ""}>{userEmail || "—"}</span></div><span className={styles.userRoleBadge} data-role-tone="personal" title="Saját Drive tulajdonos" aria-label="Saját Drive tulajdonos">TUL</span></button><HeaderLogoutIconButton className={styles.headerLogout} iconSize={16} /></div>
      </header>
      <div className={styles.breadcrumb}><span>Saját Drive</span><span>› <strong>Lomtár</strong></span></div>
      <PersonalDriveTrashPanel onChanged={load} />
    </div>
  );

  return (
    <div className={`${styles.workspaceWrap} ${layoutMode === "split" ? styles.workspaceWrapSplit : ""}`}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <div className={styles.projectIcon}><HardDrive size={18} /></div>
          <div><h1>{workspaceName}</h1><div className={styles.projectMeta}><span>Személyes DIMPRO tárhely</span><span className={styles.activeBadge}>Aktív</span><span>{items.length} fájl</span>{storageQuota ? <span className={styles.projectStorageMeter} data-level={storageQuota.usagePercent >= storageQuota.criticalPercent ? "critical" : storageQuota.usagePercent >= storageQuota.warningPercent ? "warning" : "normal"} title={`Foglalt: ${formatBytes(storageQuota.occupiedBytes)} · Ebből függő feltöltések: ${formatBytes(storageQuota.reservedBytes || 0)} · Keret: ${formatBytes(storageQuota.quotaBytes)}`}><span className={styles.projectStorageLabel}>Tárhely {formatBytes(storageQuota.occupiedBytes)} / {formatBytes(storageQuota.quotaBytes)}</span><i><b style={{ width: `${Math.max(0, Math.min(100, storageQuota.usagePercent))}%` }} /></i></span> : <span>{formatBytes(totalBytes)}</span>}</div></div>
        </div>
        {workspaceOptions.length > 0 && selectedWorkspaceId ? <div className={styles.workspaceSelectorWrap}><label className={styles.workspaceSelectorLabel} htmlFor="drive-personal-workspace-selector">Munkatér</label><select id="drive-personal-workspace-selector" className={styles.workspaceSelector} value={selectedWorkspaceId} onChange={(event) => onWorkspaceChange(event.target.value)}>{workspaceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.code ? " · " + option.code : ""}</option>)}</select></div> : null}
        <div className={styles.headerActions}><button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button><button type="button" className={styles.headerAction} onClick={onOpenHelp}><HelpCircle size={14} /> Súgó</button><button type="button" className={`${styles.userPill} ${styles.userPillButton}`} onClick={onManageIdentities} title="E-mail-címek és munkahelyek kezelése"><span className={styles.avatar}>{(userDisplayName || userEmail || "D").trim().charAt(0).toUpperCase() || "D"}</span><div className={styles.userIdentityText}><strong>{userDisplayName || "DIMPRO felhasználó"}</strong><span title={userEmail || ""}>{userEmail || "—"}</span></div><span className={styles.userRoleBadge} data-role-tone="personal" title="Saját Drive tulajdonos" aria-label="Saját Drive tulajdonos">TUL</span></button><HeaderLogoutIconButton className={styles.headerLogout} iconSize={16} /></div>
      </header>

      <PersonalDrivePreviewDrawer document={previewDocument} open={Boolean(previewDocumentId && previewDocument)} onClose={() => setPreviewDocumentId("")} />

      {folderRenameDialog && (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Mappa átnevezése">
          <form className={`${styles.projectCreatePanel} ${styles.folderRenameDialogPanel}`} onSubmit={(event) => { event.preventDefault(); void submitFolderRename(); }}>
            <header>
              <div><small>DIMPRO Drive · Saját Drive</small><strong>Mappa átnevezése</strong><span>Az új név azonnal megjelenik a mappafában és a fájltáblában.</span></div>
              <button type="button" disabled={folderRenameDialog.busy} onClick={() => setFolderRenameDialog(null)} aria-label="Bezárás">×</button>
            </header>
            <label>Mappa neve<input autoFocus value={folderRenameDialog.displayName} maxLength={180} onChange={(event) => setFolderRenameDialog((current) => current ? { ...current, displayName: event.target.value, error: "" } : current)} onFocus={(event) => event.currentTarget.select()} /></label>
            {folderRenameDialog.error ? <div className={`${styles.notice} ${styles.noticeError}`}>{folderRenameDialog.error}</div> : null}
            <footer>
              <button type="button" disabled={folderRenameDialog.busy} onClick={() => setFolderRenameDialog(null)}>Mégsem</button>
              <button type="submit" disabled={folderRenameDialog.busy || !folderRenameDialog.displayName.trim()}>{folderRenameDialog.busy ? "Mentés…" : "Átnevezés"}</button>
            </footer>
          </form>
        </div>
      )}

      {projectLinksDialogOpen ? (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Kapcsolt projektek kezelése">
          <section className={`${styles.projectCreatePanel} ${styles.projectLinksDialogPanel}`}>
            <header><div><small>DIMPRO Drive · Saját Drive</small><strong>Kapcsolt projektek</strong><span>A csatolás csak nézeti kapcsolat. A projektfájlok nem másolódnak át a Saját Drive-ba.</span></div><button type="button" onClick={() => setProjectLinksDialogOpen(false)} aria-label="Bezárás">×</button></header>
            <div className={styles.projectLinksDialogBody}>
              <section className={styles.projectLinksColumn}><header><strong>Csatolt projektek</strong><span>{linkedProjects.length}</span></header><div className={styles.projectLinksList}>{linkedProjects.length ? linkedProjects.map((project) => <div key={project.id} className={`${styles.projectLinkCard} ${styles.projectLinkRemove}`}><div className={styles.projectLinkCardText}><strong>{project.name}</strong><span>{project.code || "Projekt"} · {project.access || "hozzáférés"}</span></div><button type="button" disabled={projectLinksBusyId === project.id} onClick={() => void detachProject(project.id)}>{projectLinksBusyId === project.id ? "…" : "Leválasztás"}</button></div>) : <div className={styles.projectLinksEmptyState}>Még nincs csatolt projekt.</div>}</div></section>
              <section className={styles.projectLinksColumn}><header><strong>Elérhető projektek</strong><span>{availableProjects.length}</span></header><div className={styles.projectLinksList}>{availableProjects.length ? availableProjects.map((project) => <div key={project.id} className={styles.projectLinkCard}><div className={styles.projectLinkCardText}><strong>{project.name}</strong><span>{project.code || "Projekt"} · {project.access || "hozzáférés"}</span></div><button type="button" disabled={projectLinksBusyId === project.id} onClick={() => void attachProject(project.id)}>{projectLinksBusyId === project.id ? "…" : "Csatolás"}</button></div>) : <div className={styles.projectLinksEmptyState}>Nincs további csatolható projekt.</div>}</div></section>
            </div>
            <footer><span>A projekt hozzáférési szabályai változatlanul érvényesek.</span><button type="button" onClick={() => setProjectLinksDialogOpen(false)}>Kész</button></footer>
          </section>
        </div>
      ) : null}

      <input ref={personalUploadFileInputRef} type="file" multiple hidden
        aria-label="Saját Drive – egy vagy több fájl feltöltése"
        onChange={event => { const files=Array.from(event.target.files || []);
          if (files.length) void uploadPersonalFiles(files); }} />
      <DriveToolbar
        query={query}
        onQueryChange={setQuery}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        tableFullscreen={tableFullscreen}
        onToggleTableFullscreen={toggleTableFullscreen}
        tableZoom={tableZoom}
        onTableZoomChange={setTableZoom}
        canWrite={folderCoreReady}
        canUpload={personalUploadEnabled && !personalTransferBusy}
        boxEnabled={boxCoreReady}
        compareEnabled={documents.length >= 2}
        onCreateFolder={() => { setNewFolderName(""); setNewFolderEditorOpen(true); }}
        onUpload={() => personalUploadFileInputRef.current?.click()}
        canUploadSelectedVersion={false}
        onUploadSelectedVersion={() => undefined}
        canUploadSelectedRevision={false}
        onUploadSelectedRevision={() => undefined}
        canOpenSelected={Boolean(selectedDocument?.currentVersion?.status === "AVAILABLE")}
        canDownloadSelected={Boolean(selectedDocument?.currentVersion?.status === "AVAILABLE")}
        canDownloadFolder={false}
        onOpenSelected={() => { if (selectedDocument) void openDocument(selectedDocument); }}
        onDownloadSelected={() => { if (selectedItem) void downloadItem(selectedItem).catch((caught) => setError(caught instanceof Error ? caught.message : "A fájl nem tölthető le.")); }}
        onDownloadFolder={() => undefined}
        boxCount={boxes.length}
        boxShelfOpen={boxShelfOpen}
        boxReady={boxCoreReady}
        onToggleBoxShelf={() => setBoxShelfOpen((current) => !current)}
        compareActive={compareActive}
        onToggleCompare={() => compareActive ? setCompareActive(false) : openCompare()}
        canIssueSelected={false}
        onIssueSelected={() => undefined}
      />

      {error ? <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div> : null}
      {!error && notice ? <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div> : null}
      {!folderCoreReady ? <div className={`${styles.notice} ${styles.noticeInfo}`}>A személyes mappamag nem aktív; a munkatér csak olvasási USER_ROOT módban érhető el.</div> : null}

      <div className={styles.breadcrumb}>
        <span>Saját Drive</span>
        {breadcrumbParts.map((part, index) => <span key={`${part}-${index}`}>› <strong>{part}</strong></span>)}
        {folderCoreReady && selectedFolder ? <button type="button" className={styles.folderRenameButton} onClick={renameSelectedFolder} disabled={busy}>Mappa átnevezése</button> : null}
      </div>

      {tableFullscreen ? <section className={`${styles.fullTableOverlay} ${fullTableInspectorOpen && fullTableInspectorLayout === "bottom" ? styles.fullTableOverlayBottomInspector : ""}`}>
        <TableFullscreenBar title={title} subtitle={subtitle} layoutMode={layoutMode} onLayoutModeChange={(next) => { setLayoutMode(next); closeTableFullscreen(); }} zoom={tableZoom} onZoomChange={setTableZoom} onToggleFullscreen={closeTableFullscreen} inspectorOpen={fullTableInspectorOpen} inspectorDisabled={!selectedItem} inspectorLayout={fullTableInspectorLayout} onToggleInspector={() => setFullTableInspectorOpen((current) => !current)} onInspectorLayoutChange={(next) => { setFullTableInspectorLayout(next); if (!fullTableInspectorOpen) setFullTableInspectorOpen(true); }} />
        <div className={styles.fullTableBody}>
          {grid()}
          {boxShelfOpen ? (
            <aside className={styles.fullTableBoxPanel} aria-label="CsomagBOX">
              <BoxShelf
                projectId="personal"
                variant="panel"
                open
                onOpenChange={setBoxShelfOpen}
                boxes={boxes}
                documents={documents}
                metadataByDocument={{}}
                selectedDocument={selectedDocument}
                canWrite={boxCoreReady}
                databaseReady={boxCoreReady}
                busy={busy}
                onCreateBox={createBox}
                onAddDocument={addDocumentToBox}
                onRemoveItem={removeBoxItem}
                onCreateFolder={createBoxFolder}
                onMoveItem={moveBoxItem}
                onDownloadBox={downloadBoxArchive}
                onSetLifecycle={setBoxLifecycle}
                historyEndpointForBox={(boxId) => `/api/drive/personal/boxes/${encodeURIComponent(boxId)}/history`}
                onOpenCompareBox={(box) => openCompare(box.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId })))}
              />
            </aside>
          ) : null}
        </div>
        {fullTableInspectorOpen ? <div className={styles.fullTableInspectorBackdrop} role="presentation" onPointerDown={() => setFullTableInspectorOpen(false)} /> : null}
        {fullTableInspectorOpen ? <aside className={`${styles.fullTableInspector} ${fullTableInspectorLayout === "bottom" ? styles.fullTableInspectorBottom : styles.fullTableInspectorSide}`} onPointerDown={(event) => event.stopPropagation()}>{fullTableInspectorLayout === "bottom" ? <BottomInspectorResizeHandle /> : null}<button type="button" className={styles.fullTableInspectorClose} onClick={() => setFullTableInspectorOpen(false)} aria-label="Dokumentumadatok bezárása">×</button><PersonalDriveDetailsPanel item={selectedItem} folderName={folderNameForSelectedItem} onDownload={downloadItem} responsiveClassName={`${styles.fullTableInspectorPanel} ${fullTableInspectorLayout === "bottom" ? `${styles.detailsSplitCard} ${styles.fullTableInspectorPanelBottom}` : ""}`} /></aside> : null}
      </section> : null}

      {homeMode && !compareActive && !tableFullscreen &&
        <DriveRecentHome name={workspaceName} scopeLabel="Saját Drive"
          documents={sortedRecentUploads(documents)}
          onShowAll={()=>{setHomeMode(false);setRecentOnly(true);setSelectedFolderId("all");}}
          onSelect={(document)=>{setHomeMode(false);setRecentOnly(false);setFavoriteOnly(false);
            setSelectedFolderId(document.folderId||"all");setSelectedDocumentId(document.id);}}
        />}
      <div ref={browserRef} hidden={homeMode && !compareActive && !tableFullscreen}
        className={`${browserClass} ${compareActive ? styles.browserCompareActive : ""}`} style={layoutMode === "split"
          ? {gridTemplateRows:personalDetailsDockOpen ? `minmax(0,1fr) 10px min(${splitDetailsHeight}px,70%)` : "minmax(0,1fr) 0px 36px"}
          : layoutMode === "folders"
            ? {gridTemplateRows:personalDetailsDockOpen ? `minmax(0,1fr) 10px min(${foldersDetailsHeight}px,70%)` : "minmax(0,1fr) 0px 36px"}
            : undefined}>
        {compareActive ? (
          <CompareWorkspace projectId="personal" workspaceType="PERSONAL" documents={documents} boxes={boxes} seedItems={compareSeedItems} onClose={() => setCompareActive(false)} />
        ) : layoutMode === "commander" ? <CommanderPanel folders={commanderFolders} documents={documents} selectedDocumentId={selectedDocumentId} canWrite={folderCoreReady} moveReady={folderCoreReady} busy={busy} onSelectDocument={(document) => setSelectedDocumentId(document.id)} onOpenDocument={(document) => void openDocument(document)} onMoveDocument={moveDocument} tableZoom={tableZoom} selectedDocumentIds={selectedDocumentIds} onSelectionChange={setSelectedDocumentIds} canDelete onDeleteSelected={deletePersonalDocuments} /> : <>
          <FolderTreePanel folders={driveFolders} selectedFolderId={selectedFolderId} documentCounts={folderDocumentCounts} totalDocumentCount={documents.length} onSelectFolder={(folderId) => { setFavoriteOnly(false); setSelectedFolderId(folderId); setAllFilesMode(false); }} onMoveDocumentsToFolder={moveDocumentsToFolder} onMoveFolderToFolder={moveFolderToFolder} linkedProjects={linkedProjects} onOpenLinkedProject={(project) => onWorkspaceChange(`project:${project.id}`)} onManageLinkedProjects={() => setProjectLinksDialogOpen(true)} responsiveClassName={`${styles.folderPanelResponsive} ${folderHidden ? styles.hiddenPanel : ""}`} />
          {grid()}
          {layoutMode === "split" || layoutMode === "folders" ? <div className={`${styles.splitResizeHandle} ${layoutMode === "folders" ? styles.foldersDetailsResizeHandle : ""} ${!personalDetailsDockOpen ? styles.detailsDockResizeHidden : ""}`} role="separator" aria-orientation="horizontal" onDoubleClick={() => { const height = browserRef.current?.getBoundingClientRect().height || 660; const half = Math.max(150, Math.floor((height - 10) / 2)); if (layoutMode === "folders") setFoldersDetailsHeight(half); else setSplitDetailsHeight(Math.max(250, half)); }} onPointerDown={(event) => { if(!personalDetailsDockOpen)return; event.preventDefault(); const startY = event.clientY; const startHeight = layoutMode === "folders" ? foldersDetailsHeight : splitDetailsHeight; const onMove = (moveEvent: PointerEvent) => { const delta = startY - moveEvent.clientY; if (layoutMode === "folders") { const height = browserRef.current?.getBoundingClientRect().height || 660; const max = Math.max(150, Math.floor((height - 10) / 2)); setFoldersDetailsHeight(Math.max(150, Math.min(max, startHeight + delta))); } else setSplitDetailsHeight(Math.max(250, Math.min(Math.max(300, window.innerHeight - 300), startHeight + delta))); }; const onUp = () => { document.body.style.cursor = ""; document.body.style.userSelect = ""; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); }; document.body.style.cursor = "row-resize"; document.body.style.userSelect = "none"; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true }); }}><span /></div> : null}
          <div className={layoutMode === "split" || layoutMode === "folders"
            ? `${styles.detailsDock} ${layoutMode === "folders" ? styles.foldersDetailsCard : ""} ${!personalDetailsDockOpen ? styles.detailsDockCollapsed : ""}`
            : styles.detailsDockPassthrough}>
            {(layoutMode === "split" || layoutMode === "folders") && <button type="button"
              className={styles.detailsDockBar} aria-expanded={personalDetailsDockOpen}
              onClick={()=>setPersonalDetailsDockOpen(current=>!current)}>
              <strong>Fájlrészletek</strong><span>{selectedDocument?.name || "Válassz egy fájlt"}</span>
              <span className={styles.detailsDockArrow}>{personalDetailsDockOpen?"⌄":"⌃"}</span>
            </button>}
            <div className={styles.detailsDockContent}
              hidden={!personalDetailsDockOpen && (layoutMode === "split" || layoutMode === "folders")}>
              <PersonalDriveDetailsPanel item={selectedItem} folderName={folderNameForSelectedItem}
                onDownload={downloadItem} responsiveClassName={`${styles.detailsResponsive} ${layoutMode === "split" || layoutMode === "folders" ? styles.detailsSplitCard : ""} ${detailsHidden ? styles.hiddenPanel : ""}`} />
            </div>
          </div>
        </>}
      </div>

      <BoxShelf
        projectId="personal"
        open={boxShelfOpen}
        onOpenChange={setBoxShelfOpen}
        boxes={boxes}
        documents={documents}
        metadataByDocument={{}}
        selectedDocument={selectedDocument}
        canWrite={boxCoreReady}
        databaseReady={boxCoreReady}
        busy={busy}
        onCreateBox={createBox}
        onAddDocument={addDocumentToBox}
        onRemoveItem={removeBoxItem}
        onCreateFolder={createBoxFolder}
        onMoveItem={moveBoxItem}
        onDownloadBox={downloadBoxArchive}
        onSetLifecycle={setBoxLifecycle}
        historyEndpointForBox={(boxId) => `/api/drive/personal/boxes/${encodeURIComponent(boxId)}/history`}
        onOpenCompareBox={(box) => openCompare(box.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId })))}
        shelfHeight={boxShelfHeight}
        onShelfHeightChange={setBoxShelfHeight}
        onResetShelfHeight={() => setBoxShelfHeight(Math.max(118, Math.round(window.innerHeight * 0.5)))}
      />
      <DriveTransferCenter
        tasks={personalTransferTasks}
        projectName={workspaceName}
        scope="PERSONAL"
        open={personalTransferOpen}
        minimized={personalTransferMinimized}
        onOpen={() => setPersonalTransferOpen(true)}
        onMinimize={() => setPersonalTransferMinimized(value => !value)}
        onClose={() => setPersonalTransferOpen(false)}
        onCancel={id => {
          personalTransferCancelledRef.current.add(id);
          const controller=personalTransferAbortRef.current.get(id);
          if (controller) controller.abort();
          else updatePersonalTransfer(id,{phase:"CANCELLED",speedBps:null,retryable:false});
        }}
        onRetry={() => setError("Biztonsági okból a Saját Drive feltöltés nem indít automatikus ismétlést.")}
        onVerify={id => { void verifyPersonalTransfer(id); }}
        retryDisabled
        onClearFinished={() => setPersonalTransferTasks(current => current.filter(task => !isTransferTerminal(task.phase)))}
      />
    </div>
  );
}
