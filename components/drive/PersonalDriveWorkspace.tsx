"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, HardDrive, HelpCircle } from "lucide-react";
import HeaderLogoutIconButton from "@/components/auth/HeaderLogoutIconButton";
import BottomInspectorResizeHandle from "./BottomInspectorResizeHandle";
import CommanderPanel from "./CommanderPanel";
import DrivePremiumLoader from "./DrivePremiumLoader";
import DriveToolbar from "./DriveToolbar";
import FileGridPanel from "./FileGridPanel";
import FolderTreePanel from "./FolderTreePanel";
import PersonalDriveDetailsPanel, { type PersonalDriveDetailsItem } from "./PersonalDriveDetailsPanel";
import TableFullscreenBar from "./TableFullscreenBar";
import type { DriveDocument, DriveFolder, DriveLayoutMode, DriveViewMode, DriveVersion } from "./driveTypes";
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

type ContentPayload = { ok?: boolean; error?: string; items?: PersonalDriveItem[] };
type FolderPayload = { ok?: boolean; ready?: boolean; error?: string; folders?: PersonalDriveFolder[] };

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
  workspaceOptions: DriveWorkspaceOption[];
  selectedWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
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

export default function PersonalDriveWorkspace({ workspaceName, userEmail, workspaceOptions, selectedWorkspaceId, onWorkspaceChange }: Props) {
  const [items, setItems] = useState<PersonalDriveItem[]>([]);
  const [folders, setFolders] = useState<PersonalDriveFolder[]>([]);
  const [folderCoreReady, setFolderCoreReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewMode, setViewMode] = useState<DriveViewMode>("simple");
  const [layoutMode, setLayoutMode] = useState<DriveLayoutMode>("three");
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [allFilesMode, setAllFilesMode] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [tableZoom, setTableZoom] = useState(100);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [fullTableInspectorOpen, setFullTableInspectorOpen] = useState(false);
  const [fullTableInspectorLayout, setFullTableInspectorLayout] = useState<"side" | "bottom">("side");
  const [splitDetailsHeight, setSplitDetailsHeight] = useState(330);
  const [newFolderEditorOpen, setNewFolderEditorOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderSaving, setNewFolderSaving] = useState(false);
  const [folderRenameDialog, setFolderRenameDialog] = useState<PersonalFolderRenameDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [bootLoaderVisible, setBootLoaderVisible] = useState(true);
  const [bootLoaderComplete, setBootLoaderComplete] = useState(false);
  const bootLoaderVisibleRef = useRef(true);
  const bootLoaderHoldTimerRef = useRef<number | null>(null);
  const browserRef = useRef<HTMLDivElement>(null);

  const closeTableFullscreen = useCallback(() => {
    setTableFullscreen(false);
    setFullTableInspectorOpen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const toggleTableFullscreen = useCallback(() => {
    if (tableFullscreen) {
      closeTableFullscreen();
      return;
    }
    setTableFullscreen(true);
    setFullTableInspectorOpen(false);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, [closeTableFullscreen, tableFullscreen]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [contentResponse, folderResponse] = await Promise.all([
        fetch("/api/drive/personal/content", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/drive/personal/folders", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const contentPayload = await contentResponse.json() as ContentPayload;
      const folderPayload = await folderResponse.json() as FolderPayload;
      if (!contentResponse.ok || !contentPayload.ok) throw new Error(contentPayload.error || "A Saját Drive tartalma nem tölthető be.");
      if (!folderResponse.ok || !folderPayload.ok) throw new Error(folderPayload.error || "A Saját Drive mappái nem tölthetők be.");
      const nextItems = contentPayload.items || [];
      const nextFolders = folderPayload.folders || [];
      setItems(nextItems);
      setFolders(nextFolders);
      setFolderCoreReady(folderPayload.ready === true);
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
  }, []);

  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem("dimpro-drive-personal-view");
      const storedLayout = window.localStorage.getItem("dimpro-drive-personal-layout");
      if (storedView === "simple" || storedView === "engineering") setViewMode(storedView);
      if (["three", "two", "one", "split", "commander"].includes(storedLayout || "")) setLayoutMode(storedLayout as DriveLayoutMode);
    } catch {}
  }, []);

  useEffect(() => { try { window.localStorage.setItem("dimpro-drive-personal-view", viewMode); } catch {} }, [viewMode]);
  useEffect(() => { try { window.localStorage.setItem("dimpro-drive-personal-layout", layoutMode); } catch {} }, [layoutMode]);

  useEffect(() => {
    bootLoaderVisibleRef.current = true;
    setBootLoaderVisible(true);
    setBootLoaderComplete(false);
    void load();
    return () => { if (bootLoaderHoldTimerRef.current !== null) window.clearTimeout(bootLoaderHoldTimerRef.current); };
  }, [load]);

  useEffect(() => {
    if (!tableFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) closeTableFullscreen();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setTableFullscreen(false);
        setFullTableInspectorOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [closeTableFullscreen, tableFullscreen]);

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
  const selectedItem = selectedDocumentId ? itemById.get(selectedDocumentId) || null : null;

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
      const folderMatch = selectedFolderId === "all" || (allFilesMode ? descendantFolderIds.has(document.folderId) : document.folderId === selectedFolderId);
      if (!folderMatch) return false;
      if (!normalized) return true;
      const item = itemById.get(document.id);
      return [document.name, item?.originalName, item?.sourceSystem, document.extension].filter(Boolean).some((value) => String(value).toLocaleLowerCase("hu-HU").includes(normalized));
    });
  }, [allFilesMode, descendantFolderIds, documents, itemById, query, selectedFolderId]);

  const folderDocumentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents) if (document.folderId !== "all") counts.set(document.folderId, (counts.get(document.folderId) || 0) + 1);
    return counts;
  }, [documents]);
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.sizeBytes || 0), 0), [items]);
  const title = selectedFolder?.displayName || selectedFolder?.name || "Saját Drive";
  const subtitle = `${visibleDocuments.length} fájl${selectedFolder && allFilesMode ? " · almappákkal együtt" : ""}`;
  const folderNameForSelectedItem = selectedItem?.folderId ? folderById.get(selectedItem.folderId)?.displayName || folderById.get(selectedItem.folderId)?.name || "Saját Drive" : "Saját Drive";
  const breadcrumbParts = selectedFolder ? (selectedFolder.displayPath || selectedFolder.path).split("/").filter(Boolean) : [];

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

  const downloadItem = useCallback(async (item: PersonalDriveDetailsItem) => {
    setError("");
    const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(item.id)}/download`, { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } };
    if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A fájl nem tölthető le.");
    const link = document.createElement("a"); link.href = payload.download.url; link.rel = "noopener"; link.click();
  }, []);

  const openDocument = useCallback(async (document: DriveDocument) => {
    setSelectedDocumentId(document.id);
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(document.id)}/preview`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; preview?: { url?: string } };
      if (!response.ok || !payload.ok || !payload.preview?.url) throw new Error(payload.error || "Az előnézet nem nyitható meg.");
      if (previewWindow) previewWindow.location.href = payload.preview.url; else window.open(payload.preview.url, "_blank", "noopener,noreferrer");
    } catch (caught) { previewWindow?.close(); setError(caught instanceof Error ? caught.message : "Az előnézet nem nyitható meg."); }
  }, []);

  const browserClass = [styles.browser, layoutMode === "two" ? styles.layoutTwo : "", layoutMode === "one" ? styles.layoutOne : "", layoutMode === "split" ? styles.layoutSplit : "", layoutMode === "commander" ? styles.layoutCommander : ""].filter(Boolean).join(" ");
  const folderHidden = layoutMode !== "three";
  const detailsHidden = layoutMode === "one";

  const grid = () => <FileGridPanel
    title={title}
    subtitle={subtitle}
    documents={visibleDocuments}
    selectedDocumentId={selectedDocumentId}
    viewMode={viewMode}
    onViewModeChange={setViewMode}
    allowedViewModes={["simple", "engineering"]}
    onSelectDocument={(document) => setSelectedDocumentId(document.id)}
    onOpenDocument={(document) => void openDocument(document)}
    onRefresh={() => void load()}
    metadataByDocument={{}}
    folders={driveFolders}
    selectedFolderId={selectedFolderId}
    allFilesMode={allFilesMode}
    onAllFilesModeChange={setAllFilesMode}
    currentFolder={selectedFolder}
    onFolderChange={(folderId) => { setSelectedFolderId(folderId); setAllFilesMode(false); }}
    onNavigateParent={() => setSelectedFolderId(selectedFolder?.parentId || "all")}
    canWrite={folderCoreReady}
    canApprove={false}
    membershipRole=""
    busy={busy}
    tableZoom={tableZoom}
    dragPanEnabled
    selectedDocumentIds={selectedDocumentIds}
    onSelectionChange={setSelectedDocumentIds}
    canDelete={false}
    canDeleteFolder={false}
    onOpenBrowserDocument={(document) => void openDocument(document)}
    onDownloadDocument={(document) => { const item = itemById.get(document.id); if (item) void downloadItem(item).catch((caught) => setError(caught instanceof Error ? caught.message : "A fájl nem tölthető le.")); }}
    newFolderEditorOpen={newFolderEditorOpen}
    newFolderName={newFolderName}
    newFolderSaving={newFolderSaving}
    onNewFolderNameChange={setNewFolderName}
    onSaveNewFolder={() => void saveNewFolder()}
    onCancelNewFolder={() => { setNewFolderEditorOpen(false); setNewFolderName(""); }}
  />;

  if (bootLoaderVisible) return <DrivePremiumLoader complete={bootLoaderComplete} workspaceType="PERSONAL" />;

  return (
    <div className={`${styles.workspaceWrap} ${layoutMode === "split" ? styles.workspaceWrapSplit : ""}`}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <div className={styles.projectIcon}><HardDrive size={18} /></div>
          <div><h1>{workspaceName}</h1><div className={styles.projectMeta}><span>Személyes DIMPRO tárhely</span><span className={styles.activeBadge}>Aktív</span><span>{items.length} fájl · {formatBytes(totalBytes)}</span></div></div>
        </div>
        {workspaceOptions.length > 0 && selectedWorkspaceId ? <div className={styles.workspaceSelectorWrap}><label className={styles.workspaceSelectorLabel} htmlFor="drive-personal-workspace-selector">Munkatér</label><select id="drive-personal-workspace-selector" className={styles.workspaceSelector} value={selectedWorkspaceId} onChange={(event) => onWorkspaceChange(event.target.value)}>{workspaceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.code ? " · " + option.code : ""}</option>)}</select></div> : null}
        <div className={styles.headerActions}><button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button><button type="button" className={styles.headerAction}><HelpCircle size={14} /> Súgó</button><div className={styles.userPill}><span className={styles.avatar}>{(userEmail || "D").trim().charAt(0).toUpperCase() || "D"}</span><div><strong>{userEmail || "DIMPRO felhasználó"}</strong><span>Saját Drive tulajdonos</span></div></div><HeaderLogoutIconButton className={styles.headerLogout} iconSize={16} /></div>
      </header>

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
        canUpload={false}
        boxEnabled={false}
        compareEnabled={false}
        onCreateFolder={() => { setNewFolderName(""); setNewFolderEditorOpen(true); }}
        onUpload={() => undefined}
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
        boxCount={0}
        boxShelfOpen={false}
        boxReady={false}
        onToggleBoxShelf={() => undefined}
        compareActive={false}
        onToggleCompare={() => undefined}
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
        <div className={styles.fullTableBody}>{grid()}</div>
        {fullTableInspectorOpen ? <aside className={`${styles.fullTableInspector} ${fullTableInspectorLayout === "bottom" ? styles.fullTableInspectorBottom : styles.fullTableInspectorSide}`}>{fullTableInspectorLayout === "bottom" ? <BottomInspectorResizeHandle /> : null}<button type="button" className={styles.fullTableInspectorClose} onClick={() => setFullTableInspectorOpen(false)} aria-label="Dokumentumadatok bezárása">×</button><PersonalDriveDetailsPanel item={selectedItem} folderName={folderNameForSelectedItem} onDownload={downloadItem} responsiveClassName={`${styles.fullTableInspectorPanel} ${fullTableInspectorLayout === "bottom" ? `${styles.detailsSplitCard} ${styles.fullTableInspectorPanelBottom}` : ""}`} /></aside> : null}
      </section> : null}

      <div ref={browserRef} className={browserClass} style={layoutMode === "split" ? { gridTemplateRows: `minmax(220px,1fr) 10px ${splitDetailsHeight}px` } : undefined}>
        {layoutMode === "commander" ? <CommanderPanel folders={commanderFolders} documents={documents} selectedDocumentId={selectedDocumentId} canWrite={folderCoreReady} moveReady={folderCoreReady} busy={busy} onSelectDocument={(document) => setSelectedDocumentId(document.id)} onOpenDocument={(document) => void openDocument(document)} onMoveDocument={moveDocument} tableZoom={tableZoom} selectedDocumentIds={selectedDocumentIds} onSelectionChange={setSelectedDocumentIds} canDelete={false} /> : <>
          <FolderTreePanel folders={driveFolders} selectedFolderId={selectedFolderId} documentCounts={folderDocumentCounts} totalDocumentCount={documents.length} onSelectFolder={(folderId) => { setSelectedFolderId(folderId); setAllFilesMode(false); }} responsiveClassName={`${styles.folderPanelResponsive} ${folderHidden ? styles.hiddenPanel : ""}`} />
          {grid()}
          {layoutMode === "split" ? <div className={styles.splitResizeHandle} role="separator" aria-orientation="horizontal" onDoubleClick={() => setSplitDetailsHeight(Math.max(250, Math.round((browserRef.current?.getBoundingClientRect().height || 660) / 2)))} onPointerDown={(event) => { event.preventDefault(); const startY = event.clientY; const startHeight = splitDetailsHeight; const onMove = (moveEvent: PointerEvent) => setSplitDetailsHeight(Math.max(250, Math.min(Math.max(300, window.innerHeight - 300), startHeight + startY - moveEvent.clientY))); const onUp = () => { document.body.style.cursor = ""; document.body.style.userSelect = ""; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); }; document.body.style.cursor = "row-resize"; document.body.style.userSelect = "none"; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true }); }}><span /></div> : null}
          <PersonalDriveDetailsPanel item={selectedItem} folderName={folderNameForSelectedItem} onDownload={downloadItem} responsiveClassName={`${styles.detailsResponsive} ${layoutMode === "split" ? styles.detailsSplitCard : ""} ${detailsHidden ? styles.hiddenPanel : ""}`} />
        </>}
      </div>
    </div>
  );
}
