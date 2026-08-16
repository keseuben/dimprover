"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  Database,
  Download,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  HardDrive,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  RotateCcw,
  X,
} from "lucide-react";
import styles from "./DriveWorkspace.module.css";

type DriveFolder = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
};
type DriveVersion = {
  id: string;
  versionNumber: number;
  revisionCode: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  storageProvider?: string;
  storageKey?: string | null;
  createdAt: string;
};
type DriveDocument = {
  id: string;
  folderId: string;
  name: string;
  extension: string;
  mimeType: string;
  description: string;
  source: string;
  currentVersionNumber: number;
  updatedAt: string;
  currentVersion: DriveVersion | null;
};
type DriveTree = {
  projectId: string;
  folders: DriveFolder[];
  documents: DriveDocument[];
  summary: {
    folderCount: number;
    documentCount: number;
    versionCount: number;
    metadataOnlyCount: number;
    totalSizeBytes: number;
    latestCursor: number;
  };
};
type HealthPayload = {
  ok?: boolean;
  error?: string;
  database?: {
    ready: boolean;
    expectedSchemaVersion: string;
    actualSchemaVersion: string | null;
    errorCode: string | null;
    tables: Record<string, boolean>;
  };
  storage?: {
    version: string;
    mode: string;
    provider: string;
    databaseReady: boolean;
    storageConfigured: boolean;
    credentialsConfigured: boolean;
    bucketConfigured: boolean;
    realObjectWriteEnabled: boolean;
    realObjectDownloadEnabled: boolean;
    quarantineRequired: boolean;
    maxUploadBytes: number;
    maxUploadMb: number;
    signedUrlTtlSeconds: number;
    warning: string;
    nextStep: string;
  };
  security?: {
    version: string;
    scannerSource: string;
    ready: boolean;
    mode: string;
    socketConfigured: boolean;
    maxScanMb: number;
    ping: string | null;
    engine: string | null;
    engineVersion: string | null;
    signatureVersion: string | null;
    signatureDate: string | null;
    errorCode: string | null;
    releaseRule: string;
  };
  review?: {
    version: string;
    databaseReady: boolean;
    expectedSchemaVersion: string;
    actualSchemaVersion: string | null;
    pendingCleanupCount: number | null;
    cleanupExecutable: boolean;
    ready: boolean;
    nextStep: string;
  };
};

type UploadInitPayload = {
  ok?: boolean;
  error?: string;
  upload?: { id: string; status: string; finalVersionStatus: string };
  signedUpload?: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
  completeUrl?: string;
  abortUrl?: string;
};

type DownloadPayload = {
  ok?: boolean;
  error?: string;
  download?: { url: string; fileName: string; expiresAt: string };
};

type UploadQueueStatus = "QUEUED" | "UPLOADING" | "VERIFYING" | "DONE" | "ERROR";
type UploadQueueItem = {
  id: string;
  file: File;
  targetFolderId: string;
  targetFolderPath: string;
  status: UploadQueueStatus;
  progress: number;
  message: string;
  error?: string;
  documentId?: string;
};

function putSignedFile(
  file: File,
  signedUpload: NonNullable<UploadInitPayload["signedUpload"]>,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(signedUpload.method, signedUpload.url, true);
    for (const [key, value] of Object.entries(signedUpload.headers || {})) request.setRequestHeader(key, value);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`A tárhelyfeltöltés sikertelen (${request.status}).`));
    };
    request.onerror = () => reject(new Error("A privát tárhely feltöltése hálózati hibával leállt."));
    request.onabort = () => reject(new Error("A privát tárhely feltöltése megszakadt."));
    request.send(file);
  });
}


type Props = {
  projectId: string;
  permissions?: string[];
};

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toLocaleString("hu-HU", { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function DriveWorkspace({ projectId, permissions = [] }: Props) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [tree, setTree] = useState<DriveTree | null>(null);
  const [apiPermissions, setApiPermissions] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "drop" | "other">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadBatchBusy, setUploadBatchBusy] = useState(false);
  const [externalDragActive, setExternalDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const effectivePermissions = [...new Set([...permissions, ...apiPermissions])];
  const canWrite = effectivePermissions.includes("document.write");
  const canApprove = effectivePermissions.includes("document.approve");
  const reviewReady = Boolean(health?.review?.ready);
  const securityScannerReady = Boolean(health?.security?.ready);
  const storageWriteEnabled = Boolean(health?.storage?.realObjectWriteEnabled);
  const storageDownloadEnabled = Boolean(health?.storage?.realObjectDownloadEnabled);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const healthResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/health`, { credentials: "same-origin", cache: "no-store" });
      const healthPayload = await healthResponse.json() as HealthPayload;
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A DRIVE Core állapota nem tölthető be.");
      setHealth(healthPayload);
      if (!healthPayload.database?.ready) {
        setTree(null);
        return;
      }
      const treeResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/tree`, { credentials: "same-origin", cache: "no-store" });
      const treePayload = await treeResponse.json() as { ok?: boolean; error?: string; tree?: DriveTree; permissions?: string[] };
      if (!treeResponse.ok || !treePayload.ok || !treePayload.tree) throw new Error(treePayload.error || "A projekt dokumentumtára nem tölthető be.");
      setTree(treePayload.tree);
      setApiPermissions(treePayload.permissions || []);
      setSelectedFolderId((current) => current === "all" || treePayload.tree?.folders.some((folder) => folder.id === current) ? current : "all");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A DRIVE Core betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const selectedFolder = tree?.folders.find((folder) => folder.id === selectedFolderId) || null;
  const folderScope = useMemo(() => {
    if (!tree || selectedFolderId === "all") return null;
    const ids = new Set<string>([selectedFolderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of tree.folders) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [selectedFolderId, tree]);
  const folderDocumentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!tree) return counts;
    for (const folder of tree.folders) {
      const ids = new Set<string>([folder.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const child of tree.folders) {
          if (child.parentId && ids.has(child.parentId) && !ids.has(child.id)) { ids.add(child.id); changed = true; }
        }
      }
      counts.set(folder.id, tree.documents.filter((document) => ids.has(document.folderId)).length);
    }
    return counts;
  }, [tree]);
  const childFolders = useMemo(() => (tree?.folders || []).filter((folder) => (selectedFolderId === "all" ? folder.parentId === null : folder.parentId === selectedFolderId)), [selectedFolderId, tree]);
  const dropDocumentCount = useMemo(() => (tree?.documents || []).filter((document) => document.source === "DROP").length, [tree]);
  const visibleDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return (tree?.documents || []).filter((document) => {
      const folderMatch = folderScope === null || folderScope.has(document.folderId);
      const sourceMatch = sourceFilter === "all" || (sourceFilter === "drop" ? document.source === "DROP" : document.source !== "DROP");
      const queryMatch = !normalized || `${document.name} ${document.description} ${document.extension}`.toLocaleLowerCase("hu-HU").includes(normalized);
      return folderMatch && sourceMatch && queryMatch;
    });
  }, [folderScope, query, sourceFilter, tree]);

  async function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/folders`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), parentId: form.get("parentId") || null }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A mappa létrehozása sikertelen.");
      setNotice("A mappa létrejött és bekerült a projekt auditnaplójába.");
      setShowFolderForm(false);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A mappa létrehozása sikertelen."); }
    finally { setBusy(false); }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folderId: form.get("folderId"), name: form.get("name"), originalName: form.get("name"),
          mimeType: form.get("mimeType"), revisionCode: form.get("revisionCode"),
          description: form.get("description"), source: "WEB",
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A dokumentum felvétele sikertelen.");
      setNotice("A dokumentum metaadat-rekordja és első verziója létrejött. Valós fájl még nem került tárhelyre.");
      setShowDocumentForm(false);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A dokumentum felvétele sikertelen."); }
    finally { setBusy(false); }
  }

  function patchUploadQueueItem(id: string, patch: Partial<UploadQueueItem>) {
    setUploadQueue((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function uploadQueueItem(item: UploadQueueItem) {
    let abortUrl = "";
    try {
      patchUploadQueueItem(item.id, { status: "UPLOADING", progress: 1, error: undefined, message: "Feltöltés előkészítése…" });
      const initResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/uploads/init`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folderId: item.targetFolderId,
          documentName: item.file.name,
          originalName: item.file.name,
          mimeType: item.file.type || "application/octet-stream",
          sizeBytes: item.file.size,
          description: "Többfájlos / drag & drop webes feltöltés a Projektkapu DRIVE felületéről.",
          revisionCode: "V1",
          changeNote: "Drive Web Upload UX 1.1 feltöltés.",
          source: "WEB",
        }),
      });
      const initPayload = await initResponse.json() as UploadInitPayload;
      if (!initResponse.ok || !initPayload.ok || !initPayload.signedUpload || !initPayload.completeUrl) {
        throw new Error(initPayload.error || "A feltöltési munkamenet nem hozható létre.");
      }
      abortUrl = initPayload.abortUrl || "";
      patchUploadQueueItem(item.id, { message: "Feltöltés a privát tárhelyre…" });
      await putSignedFile(item.file, initPayload.signedUpload, (progress) => patchUploadQueueItem(item.id, { progress }));

      patchUploadQueueItem(item.id, { status: "VERIFYING", progress: 100, message: "SHA-256 és biztonsági ellenőrzés…" });
      const completeResponse = await fetch(initPayload.completeUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const completePayload = await completeResponse.json() as {
        ok?: boolean;
        error?: string;
        session?: { finalVersionStatus?: string };
        document?: { id?: string };
        securityScan?: { scan?: { status?: string } };
      };
      if (!completeResponse.ok || !completePayload.ok) throw new Error(completePayload.error || "A feltöltés véglegesítése sikertelen.");
      const finalStatus = completePayload.session?.finalVersionStatus || "QUARANTINED";
      const scanStatus = completePayload.securityScan?.scan?.status;
      patchUploadQueueItem(item.id, {
        status: "DONE",
        progress: 100,
        documentId: completePayload.document?.id,
        message: scanStatus === "CLEAN"
          ? `Feltöltve · CLEAN · ${finalStatus}`
          : `Feltöltve · ${finalStatus}`,
      });
      return completePayload.document?.id || null;
    } catch (caught) {
      if (abortUrl) {
        await fetch(abortUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Drive Web Upload UX 1.1 kliensoldali feltöltés megszakadt." }),
        }).catch(() => undefined);
      }
      const message = caught instanceof Error ? caught.message : "A fájlfeltöltés sikertelen.";
      patchUploadQueueItem(item.id, { status: "ERROR", error: message, message });
      return null;
    }
  }

  async function processUploadBatch(items: UploadQueueItem[]) {
    if (!items.length || uploadBatchBusy) return;
    setUploadBatchBusy(true);
    setError("");
    setNotice(`Feltöltési sor indítása: ${items.length} fájl.`);
    let cursor = 0;
    let successCount = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const current = items[cursor++];
        const documentId = await uploadQueueItem(current);
        if (documentId) {
          successCount += 1;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await load();
    setUploadBatchBusy(false);
    setNotice(`${successCount}/${items.length} fájl feltöltése sikeres. A hibás tételek külön újrapróbálhatók.`);
  }

  function enqueueFiles(files: File[], targetFolderId: string) {
    if (!canWrite || uploadBatchBusy) {
      if (uploadBatchBusy) setError("Már fut egy feltöltési sor. Várd meg a befejezését, majd adj hozzá új fájlokat.");
      return;
    }
    if (!storageWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }
    const folder = tree?.folders.find((entry) => entry.id === targetFolderId);
    if (!folder) {
      setError("Feltöltés előtt válassz ki egy konkrét célmappát.");
      return;
    }
    const maxUploadBytes = health?.storage?.maxUploadBytes || Number.MAX_SAFE_INTEGER;
    const now = Date.now();
    const prepared = files.filter((file) => file.size > 0).map((file, index) => ({
      id: `drive-upload-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      targetFolderId: folder.id,
      targetFolderPath: folder.path,
      status: file.size > maxUploadBytes ? "ERROR" as const : "QUEUED" as const,
      progress: 0,
      message: file.size > maxUploadBytes ? `Túl nagy fájl · maximum ${health?.storage?.maxUploadMb || 0} MB` : "Feltöltésre vár",
      error: file.size > maxUploadBytes ? "A fájl meghaladja a Drive feltöltési méretkorlátját." : undefined,
    }));
    if (!prepared.length) {
      setError("Nincs feltölthető, nem üres fájl a kiválasztásban.");
      return;
    }
    setUploadQueue((current) => [...prepared, ...current]);
    const runnable = prepared.filter((item) => item.status === "QUEUED");
    if (runnable.length) void processUploadBatch(runnable);
  }

  function submitFileUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetFolderId = String(form.get("folderId") || "");
    const files = form.getAll("file").filter((value): value is File => value instanceof File && value.size > 0);
    enqueueFiles(files, targetFolderId);
    if (files.length) setShowUploadForm(false);
  }

  function retryUpload(item: UploadQueueItem) {
    if (uploadBatchBusy) return;
    const retry = { ...item, status: "QUEUED" as const, progress: 0, error: undefined, message: "Újrapróbálásra vár" };
    setUploadQueue((items) => items.map((entry) => entry.id === item.id ? retry : entry));
    void processUploadBatch([retry]);
  }

  function isExternalFileDrag(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types || []).includes("Files");
  }

  function handleExternalDragEnter(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setExternalDragActive(true);
  }

  function handleExternalDragOver(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleExternalDragLeave(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setExternalDragActive(false);
  }

  function handleExternalDrop(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setExternalDragActive(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (selectedFolderId === "all") {
      setError("A behúzott fájlok feltöltése előtt válassz ki egy célmappát a bal oldali mappafában.");
      return;
    }
    enqueueFiles(files, selectedFolderId);
  }

  async function downloadDocument(document: DriveDocument) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/download`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: document.currentVersion?.id || null }),
      });
      const payload = await response.json() as DownloadPayload;
      if (!response.ok || !payload.ok || !payload.download?.url) {
        throw new Error(payload.error || "A letöltési link nem hozható létre.");
      }
      window.location.assign(payload.download.url);
      setNotice(`Rövid életű letöltési link kiadva: ${payload.download.fileName}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A dokumentum letöltése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function scanDocumentVersion(document: DriveDocument) {
    const version = document.currentVersion;
    if (!version) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/versions/${encodeURIComponent(version.id)}/security-scan`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json() as {
        ok?: boolean; error?: string; scan?: { status?: string; engine?: string | null; engineVersion?: string | null; signatureName?: string | null };
        autoRejected?: boolean;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A DRIVE vírusvizsgálat sikertelen.");
      if (payload.scan?.status === "CLEAN") {
        setNotice(`ClamAV ellenőrzés: TISZTA${payload.scan.engineVersion ? ` · ${payload.scan.engine || "ClamAV"} ${payload.scan.engineVersion}` : ""}. A verzió most jóváhagyható.`);
      } else if (payload.scan?.status === "INFECTED" || payload.autoRejected) {
        setError(`A fájl vírusveszély miatt automatikusan elutasításra került${payload.scan?.signatureName ? `: ${payload.scan.signatureName}` : "."}`);
      } else {
        setNotice(`Vírusellenőrzési állapot: ${payload.scan?.status || "ismeretlen"}.`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A DRIVE vírusvizsgálat sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewDocumentVersion(document: DriveDocument, action: "APPROVE" | "REJECT") {
    const version = document.currentVersion;
    if (!version) return;
    const promptText = action === "APPROVE"
      ? "Jóváhagyási megjegyzés (nem kötelező):"
      : "Elutasítás indoka (kötelező):";
    const note = window.prompt(promptText, action === "APPROVE" ? "Ellenőrizve, kiadható." : "");
    if (note === null) return;
    if (action === "REJECT" && note.trim().length < 3) {
      setError("Elutasításkor legalább rövid indoklás szükséges.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/versions/${encodeURIComponent(version.id)}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json() as {
        ok?: boolean; error?: string; idempotent?: boolean;
        cleanup?: { deleted?: boolean; error?: string | null };
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A karanténdöntés rögzítése sikertelen.");
      if (action === "APPROVE") {
        setNotice(payload.idempotent ? "A dokumentumverzió már jóvá volt hagyva." : "A dokumentumverzió jóváhagyva és auditálva.");
      } else if (payload.cleanup?.deleted) {
        setNotice("A dokumentumverzió elutasítva, az objektum törölve és a döntés auditálva.");
      } else {
        setNotice(`A dokumentumverzió elutasítva. ${payload.cleanup?.error || "Az objektumtörlés függőben maradt."}`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A karanténdöntés sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className={styles.statePanel}><Loader2 className={styles.spin} size={28} /><strong>DRIVE Core betöltése</strong><span>Projektmappák és jogosultságok ellenőrzése…</span></section>;
  }

  if (error && !health) {
    return <section className={styles.statePanel}><AlertTriangle size={28} /><strong>A dokumentumtár nem tölthető be</strong><span>{error}</span><button type="button" onClick={() => void load()}><RefreshCw size={15} /> Újrapróbálás</button></section>;
  }

  if (!health?.database?.ready) {
    const tableCount = Object.values(health?.database?.tables || {}).filter(Boolean).length;
    const totalTables = Object.keys(health?.database?.tables || {}).length || 7;
    return (
      <section className={styles.setupPanel}>
        <div className={styles.setupIcon}><Database size={30} /></div>
        <div>
          <span>DRIVE CORE 0.3.0 · ADATBÁZIS ELŐKÉSZÍTÉS</span>
          <h2>A Projektkapu dokumentumtár kódja elkészült</h2>
          <p>A működés biztonságosan le van tiltva, amíg a DRIVE Core Supabase-sémája nincs alkalmazva. A Project Core és a többi modul változatlanul működik.</p>
          <div className={styles.setupChecks}>
            <b><ShieldCheck size={16} /> Project Core jogosultság bekötve</b>
            <b><History size={16} /> Audit- és változáskurzor előkészítve</b>
            <b><HardDrive size={16} /> Metaadat-only tárhelymód</b>
          </div>
          <div className={styles.sqlName}><code>DIMPRO_PROJEKTKAPU_DRIVE_CORE_V030_BOOTSTRAP.sql</code><small>{tableCount}/{totalTables} adatbázistábla elérhető</small></div>
          <p className={styles.setupFootnote}>A fájl futtatása után a rendszer létrehozza a projekt alapmappáit. Valós fájlfeltöltés csak a következő, objektumtárhelyet aktiváló fejlesztési körben indul.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`${styles.workspace} ${externalDragActive ? styles.workspaceDragActive : ""}`}
      data-drive-upload-v110="1.1.0"
      onDragEnter={handleExternalDragEnter}
      onDragOver={handleExternalDragOver}
      onDragLeave={handleExternalDragLeave}
      onDrop={handleExternalDrop}
    >
      <header className={styles.workspaceHeader}>
        <div>
          <span>DIMPRO DRIVE · PROJEKTFÁJLOK</span>
          <h2>Projektfájlok egy rendezett helyen</h2>
          <p>Mappák, Dropból érkező képcsoportok és dokumentumverziók közös projektstruktúrában.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void load()} title="Dokumentumtár frissítése"><RefreshCw size={16} /> Frissítés</button>
          {canWrite && <button type="button" onClick={() => setShowFolderForm((value) => !value)}><FolderPlus size={16} /> Új mappa</button>}
          {canWrite && <button
            type="button"
            className={styles.primary}
            disabled={!storageWriteEnabled || busy}
            title={storageWriteEnabled ? "Fájl feltöltése a privát DRIVE objektumtárhelyre" : health?.storage?.warning || "A privát tárhely még nem aktív."}
            onClick={() => setShowUploadForm((value) => !value)}
          ><UploadCloud size={16} /> Fájl feltöltése</button>}
        </div>
      </header>

      <div className={styles.metrics}>
        <article><Folder size={18} /><div><strong>{tree?.summary.folderCount || 0}</strong><span>Projektmappa</span></div></article>
        <article><File size={18} /><div><strong>{tree?.summary.documentCount || 0}</strong><span>Dokumentum</span></div></article>
        <article><Archive size={18} /><div><strong>{dropDocumentCount}</strong><span>Dropból archivált</span></div></article>
        <article><UploadCloud size={18} /><div><strong>{formatBytes(tree?.summary.totalSizeBytes || 0)}</strong><span>Összes fájlméret</span></div></article>
      </div>

      <details className={styles.systemDetails}>
        <summary><SlidersHorizontal size={17} /><div><strong>Rendszerállapot és haladó műveletek</strong><span>Tárhely, karantén, verziók és szinkronadatok</span></div><b>Megnyitás</b></summary>
        <div className={styles.systemDetailsBody}>
          <div className={styles.technicalActions}>
            <span>Verziók: {tree?.summary.versionCount || 0} · Szinkronkurzor: #{tree?.summary.latestCursor || 0}</span>
            {canWrite && <button type="button" onClick={() => setShowDocumentForm((value) => !value)}><FilePlus2 size={15} /> Csak metaadat felvétele</button>}
          </div>
      <div className={`${styles.storageStatus} ${storageWriteEnabled ? styles.storageStatusReady : styles.storageStatusBlocked}`}>
        <span><HardDrive size={17} /></span>
        <div>
          <strong>Privát objektumtárhely · 0.4.0</strong>
          <p>{health?.storage?.warning || "A tárhelyállapot nem érhető el."}</p>
        </div>
        <b>{health?.storage?.databaseReady ? "SQL kész" : "SQL szükséges"}</b>
        <b>{health?.storage?.storageConfigured ? "S3 beállítva" : "S3 nincs beállítva"}</b>
        <b>{storageWriteEnabled ? `Feltöltés aktív · max. ${health?.storage?.maxUploadMb || 0} MB` : "Feltöltés tiltva"}</b>
      </div>

      <div className={`${styles.reviewStatus} ${securityScannerReady ? styles.reviewStatusReady : styles.reviewStatusBlocked}`}>
        <ShieldCheck size={16} />
        <div>
          <b>{securityScannerReady ? "ClamAV vírusvédelem aktív" : "ClamAV vírusvédelem nem elérhető"}</b>
          <span>{securityScannerReady
            ? `${health?.security?.engine || "ClamAV"}${health?.security?.engineVersion ? ` ${health.security.engineVersion}` : ""} · minden WEB/DESKTOP feltöltés karanténból indul`
            : `Fail-closed: jóváhagyás tiltva · ${health?.security?.errorCode || "scanner unavailable"}`}</span>
        </div>
      </div>

      <div className={`${styles.reviewStatus} ${reviewReady ? styles.reviewStatusReady : styles.reviewStatusBlocked}`}>
        <ShieldCheck size={17} />
        <div>
          <strong>Karanténellenőrzés · 0.4.1</strong>
          <span>{health?.review?.nextStep || "A review állapot nem érhető el."}</span>
        </div>
        <b>{reviewReady ? "Review aktív" : "Review SQL szükséges"}</b>
        <b>Függő takarítás: {health?.review?.pendingCleanupCount ?? "–"}</b>
      </div>

        </div>
      </details>

      {(error || notice) && <div className={error ? styles.errorNotice : styles.successNotice}>{error || notice}</div>}

      {uploadQueue.length > 0 && <section className={styles.uploadQueue} data-drive-upload-queue="1.1.0">
        <header>
          <div><UploadCloud size={17} /><span><strong>Feltöltési sor</strong><small>{uploadQueue.filter((item) => item.status === "DONE").length}/{uploadQueue.length} kész · maximum 2 párhuzamos feltöltés</small></span></div>
          <button type="button" disabled={uploadBatchBusy} onClick={() => setUploadQueue((items) => items.filter((item) => !["DONE", "ERROR"].includes(item.status)))}>Lezárt tételek törlése</button>
        </header>
        <div className={styles.uploadQueueList}>
          {uploadQueue.map((item) => <article key={item.id} className={styles[`uploadQueue${item.status}`] || ""}>
            <span className={styles.uploadQueueIcon}>{item.status === "DONE" ? <Check size={15} /> : item.status === "ERROR" ? <AlertTriangle size={15} /> : <UploadCloud size={15} />}</span>
            <div className={styles.uploadQueueInfo}>
              <strong>{item.file.name}</strong>
              <small>{formatBytes(item.file.size)} · {item.targetFolderPath} · {item.message}</small>
              <div className={styles.uploadProgress}><i style={{ width: `${item.progress}%` }} /></div>
            </div>
            <b>{item.status === "UPLOADING" ? `${item.progress}%` : item.status === "VERIFYING" ? "Ellenőrzés" : item.status === "DONE" ? "Kész" : item.status === "ERROR" ? "Hiba" : "Sorban"}</b>
            {item.status === "ERROR" && <button type="button" disabled={uploadBatchBusy} onClick={() => retryUpload(item)} title="Feltöltés újrapróbálása"><RotateCcw size={14} /> Újra</button>}
          </article>)}
        </div>
      </section>}

      {(showFolderForm || showDocumentForm || showUploadForm) && (
        <div className={styles.formsRow}>
          {showFolderForm && <form onSubmit={submitFolder} className={styles.formCard}>
            <header><FolderPlus size={17} /><strong>Új projektmappa</strong></header>
            <label>Szülőmappa<select name="parentId" defaultValue={selectedFolderId === "all" ? "" : selectedFolderId}><option value="">Projekt gyökér</option>{tree?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}</select></label>
            <label>Mappa neve<input name="name" required maxLength={120} placeholder="például Kiviteli tervek" /></label>
            <footer><button type="button" onClick={() => setShowFolderForm(false)}>Mégse</button><button type="submit" disabled={busy}>{busy ? "Mentés…" : "Mappa létrehozása"}</button></footer>
          </form>}
          {showDocumentForm && <form onSubmit={submitDocument} className={styles.formCard}>
            <header><FilePlus2 size={17} /><strong>Dokumentum metaadat</strong></header>
            <label>Célmappa<select name="folderId" required defaultValue={selectedFolderId === "all" ? tree?.folders[0]?.id || "" : selectedFolderId}><option value="" disabled>Válassz mappát</option>{tree?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}</select></label>
            <label>Dokumentumnév<input name="name" required maxLength={240} placeholder="például E-03_Alaprajz.pdf" /></label>
            <div className={styles.formSplit}><label>Revízió<input name="revisionCode" defaultValue="V1" maxLength={40} /></label><label>MIME-típus<input name="mimeType" defaultValue="application/pdf" /></label></div>
            <label>Leírás<textarea name="description" rows={2} placeholder="Rövid tartalmi leírás" /></label>
            <small>Csak dokumentumrekordot hoz létre. Fájlbájt nem kerül tárhelyre.</small>
            <footer><button type="button" onClick={() => setShowDocumentForm(false)}>Mégse</button><button type="submit" disabled={busy}>{busy ? "Mentés…" : "Dokumentum felvétele"}</button></footer>
          </form>}
          {showUploadForm && storageWriteEnabled && <form onSubmit={submitFileUpload} className={`${styles.formCard} ${styles.uploadForm}`}>
            <header><UploadCloud size={17} /><strong>Többfájlos feltöltés a privát DRIVE tárhelyre</strong></header>
            <label>Célmappa<select name="folderId" required defaultValue={selectedFolderId === "all" ? tree?.folders[0]?.id || "" : selectedFolderId}><option value="" disabled>Válassz mappát</option>{tree?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}</select></label>
            <label>Fájlok<input name="file" type="file" multiple required /></label>
            <div className={styles.uploadHint}><UploadCloud size={20} /><div><strong>Több fájlt is kijelölhetsz egyszerre</strong><span>Windows Intézőből vagy az asztalról közvetlenül a Drive felületre is behúzhatod őket. Külső drop esetén a bal oldalon kiválasztott mappa lesz a cél.</span></div></div>
            <small>Maximum fájlméret: {health?.storage?.maxUploadMb || 0} MB / fájl. Minden tétel ugyanazon signed upload → SHA-256 → karantén / vírusellenőrzési láncon halad át.</small>
            <footer><button type="button" onClick={() => setShowUploadForm(false)}>Mégse</button><button type="submit" disabled={uploadBatchBusy}>{uploadBatchBusy ? "Feltöltési sor fut…" : "Fájlok hozzáadása"}</button></footer>
          </form>}
        </div>
      )}

      {externalDragActive && <div className={styles.externalDropOverlay} aria-live="polite"><div><UploadCloud size={34} /><strong>Engedd el a fájlokat a feltöltéshez</strong><span>{selectedFolder ? `Célmappa: ${selectedFolder.path}` : "Előbb válassz célmappát a bal oldalon"}</span></div></div>}

      <div className={styles.browser}>
        <aside className={styles.folderPanel}>
          <header><strong>Projektmappák</strong><span>{tree?.folders.length || 0}</span></header>
          <button type="button" className={selectedFolderId === "all" ? styles.folderActive : ""} onClick={() => setSelectedFolderId("all")}><HardDrive size={16} /><span>Teljes dokumentumtár</span></button>
          {tree?.folders.map((folder) => {
            const depth = folder.path.split("/").length - 1;
            return <button key={folder.id} type="button" style={{ paddingLeft: 13 + depth * 17 }} className={selectedFolderId === folder.id ? styles.folderActive : ""} onClick={() => setSelectedFolderId(folder.id)}><Folder size={15} /><span>{folder.name}</span><small>{folderDocumentCounts.get(folder.id) || 0}</small></button>;
          })}
        </aside>

        <div className={styles.documentPanel}>
          <header className={styles.documentHeader}>
            <div><small>{selectedFolder ? selectedFolder.path : "Projektfájlok"}</small><strong>{selectedFolder?.name || "Teljes dokumentumtár"} · {visibleDocuments.length} fájl</strong></div>
            <div className={styles.documentTools}>
              <div className={styles.sourceFilters} aria-label="Dokumentumforrás szűrése">
                <button type="button" className={sourceFilter === "all" ? styles.filterActive : ""} onClick={() => setSourceFilter("all")}>Mind</button>
                <button type="button" className={sourceFilter === "drop" ? styles.filterActive : ""} onClick={() => setSourceFilter("drop")}>Drop</button>
                <button type="button" className={sourceFilter === "other" ? styles.filterActive : ""} onClick={() => setSourceFilter("other")}>Saját fájlok</button>
              </div>
              <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fájl keresése…" /></label>
            </div>
          </header>
          {childFolders.length > 0 && <div className={styles.folderCards}>
            {childFolders.map((folder) => <button key={folder.id} type="button" onClick={() => setSelectedFolderId(folder.id)}>
              <span><Folder size={18} /></span><div><strong>{folder.name}</strong><small>{folderDocumentCounts.get(folder.id) || 0} fájl az almappákkal együtt</small></div><ChevronRight size={16} />
            </button>)}
          </div>}
          <div className={styles.tableHeader}><span>Név</span><span>Verzió</span><span>Forrás</span><span>Méret</span><span>Módosítva</span><span>Művelet</span></div>
          <div className={styles.documentList}>
            {visibleDocuments.map((document) => (
              <article key={document.id}>
                <span className={styles.fileIcon}>{document.extension ? document.extension.toUpperCase().slice(0, 4) : "FILE"}</span>
                <div>
                  <strong>{document.name}</strong>
                  <small>{document.description || document.mimeType}</small>
                  {document.currentVersion && <span className={`${styles.versionStatus} ${styles[`versionStatus${document.currentVersion.status}`] || ""}`}>{document.currentVersion.status}</span>}
                </div>
                <b>V{document.currentVersionNumber}</b>
                <span className={document.source === "DROP" ? styles.dropSourceBadge : styles.sourceBadge}>{document.source === "DROP" ? "Drop" : document.source === "DESKTOP" ? "Desktop" : "Web"}</span>
                <span>{formatBytes(document.currentVersion?.sizeBytes || 0)}</span>
                <time>{formatDate(document.updatedAt)}</time>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    disabled={busy || !storageDownloadEnabled || document.currentVersion?.status !== "AVAILABLE"}
                    title={document.currentVersion?.status === "AVAILABLE"
                      ? storageDownloadEnabled ? "Rövid életű privát letöltési link kérése" : "A tárhelyletöltés nincs aktiválva."
                      : "Ez a verzió még nem elérhető fájlként."}
                    onClick={() => void downloadDocument(document)}
                    aria-label={`${document.name} letöltése`}
                  ><Download size={15} /></button>
                  {canApprove && document.currentVersion?.status === "QUARANTINED" && <>
                    <button
                      type="button"
                      className={styles.approveButton}
                      disabled={busy || !securityScannerReady}
                      title={securityScannerReady ? "ClamAV vírusellenőrzés indítása" : "A vírusellenőrző jelenleg nem elérhető; a jóváhagyás fail-closed."}
                      onClick={() => void scanDocumentVersion(document)}
                      aria-label={`${document.name} vírusellenőrzése`}
                    ><ShieldCheck size={15} /></button>
                    <button
                      type="button"
                      className={styles.approveButton}
                      disabled={busy || !reviewReady || !securityScannerReady}
                      title={!securityScannerReady ? "A jóváhagyás vírusellenőrző nélkül tiltott." : reviewReady ? "Karanténverzió jóváhagyása – csak CLEAN scan után" : "A Quarantine Review 0.4.1 SQL még nem aktív."}
                      onClick={() => void reviewDocumentVersion(document, "APPROVE")}
                      aria-label={`${document.name} jóváhagyása`}
                    ><Check size={15} /></button>
                    <button
                      type="button"
                      className={styles.rejectButton}
                      disabled={busy || !reviewReady}
                      title={reviewReady ? "Karanténverzió elutasítása" : "A Quarantine Review 0.4.1 SQL még nem aktív."}
                      onClick={() => void reviewDocumentVersion(document, "REJECT")}
                      aria-label={`${document.name} elutasítása`}
                    ><X size={15} /></button>
                  </>}
                </div>
              </article>
            ))}
            {!visibleDocuments.length && <div className={styles.empty}><File size={28} /><strong>Nincs megjeleníthető dokumentum</strong><span>A kiválasztott mappaágban és szűrésben nincs dokumentum.</span></div>}
          </div>
        </div>
      </div>

      <footer className={styles.storageFooter}><Database size={15} /><span>Adatforrás: Supabase/PostgreSQL · Objektumtárhely: {health?.storage?.mode || "disabled"} · Signed URL: {health?.storage?.signedUrlTtlSeconds || 0} mp · Desktop változáskurzor: {tree?.summary.latestCursor || 0}</span></footer>
    </section>
  );
}
