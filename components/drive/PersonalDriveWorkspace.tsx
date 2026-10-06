"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Download, FileText, HardDrive, HelpCircle, Loader2, ShieldCheck } from "lucide-react";
import HeaderLogoutIconButton from "@/components/auth/HeaderLogoutIconButton";
import DrivePremiumLoader from "./DrivePremiumLoader";
import PersonalDriveFolderTree, { type PersonalDriveFolder } from "./PersonalDriveFolderTree";
import DriveViewModeToggle from "./DriveViewModeToggle";
import type { DriveViewMode } from "./driveTypes";
import type { DriveWorkspaceOption } from "./driveWorkspaceTypes";
import styles from "./DriveWorkspace.module.css";

type PersonalDriveItem = {
  id: string;
  name: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sourceSystem: string;
  folderId: string | null;
  retainedIndependently: boolean;
  securityStatus: string;
  virusScanStatus: string;
  createdAt: string;
  updatedAt: string;
};

type ContentPayload = { ok?: boolean; error?: string; items?: PersonalDriveItem[] };
type FolderPayload = { ok?: boolean; ready?: boolean; error?: string; folders?: PersonalDriveFolder[] };

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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(value: string) {
  if (value === "FIELD_CAPTURE") return "Terepi rögzítés";
  if (value === "DROP") return "DIMPRO Drop";
  if (value === "IMPORT") return "Import";
  if (value === "DRIVE") return "Drive";
  return value || "DIMPRO";
}

function flattenFolderOptions(folders: PersonalDriveFolder[]) {
  const children = new Map<string, PersonalDriveFolder[]>();
  for (const folder of folders) {
    const key = folder.parentId || "__root__";
    const list = children.get(key) || [];
    list.push(folder);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "hu"));
  const result: Array<{ id: string; label: string }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId || "__root__") || []) {
      result.push({ id: folder.id, label: `${"— ".repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

export default function PersonalDriveWorkspace({ workspaceName, userEmail, workspaceOptions, selectedWorkspaceId, onWorkspaceChange }: Props) {
  const [items, setItems] = useState<PersonalDriveItem[]>([]);
  const [folders, setFolders] = useState<PersonalDriveFolder[]>([]);
  const [folderCoreReady, setFolderCoreReady] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadBusyId, setDownloadBusyId] = useState("");
  const [movingRefId, setMovingRefId] = useState("");
  const [viewMode, setViewMode] = useState<DriveViewMode>("simple");
  const [bootLoaderVisible, setBootLoaderVisible] = useState(true);
  const [bootLoaderComplete, setBootLoaderComplete] = useState(false);
  const bootLoaderVisibleRef = useRef(true);
  const bootLoaderHoldTimerRef = useRef<number | null>(null);

  const loadContent = useCallback(async () => {
    setLoading(true);
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
      const nextFolders = folderPayload.folders || [];
      setItems(contentPayload.items || []);
      setFolders(nextFolders);
      setFolderCoreReady(folderPayload.ready === true);
      setSelectedFolderId((current) => current && !nextFolders.some((folder) => folder.id === current) ? null : current);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dimpro-drive-personal-view");
      if (stored === "simple" || stored === "engineering") setViewMode(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("dimpro-drive-personal-view", viewMode); } catch {}
  }, [viewMode]);

  useEffect(() => {
    bootLoaderVisibleRef.current = true;
    setBootLoaderVisible(true);
    setBootLoaderComplete(false);
    void loadContent();
    return () => {
      if (bootLoaderHoldTimerRef.current !== null) {
        window.clearTimeout(bootLoaderHoldTimerRef.current);
        bootLoaderHoldTimerRef.current = null;
      }
    };
  }, [loadContent]);

  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0), [items]);
  const filteredItems = useMemo(() => folderCoreReady ? items.filter((item) => (item.folderId || null) === selectedFolderId) : items, [folderCoreReady, items, selectedFolderId]);
  const folderOptions = useMemo(() => flattenFolderOptions(folders), [folders]);
  const selectedFolderName = selectedFolderId ? folders.find((folder) => folder.id === selectedFolderId)?.name || "Mappa" : "Saját Drive";

  const download = useCallback(async (item: PersonalDriveItem) => {
    setDownloadBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(item.id)}/download`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } };
      if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A fájl nem tölthető le.");
      const link = document.createElement("a");
      link.href = payload.download.url;
      link.rel = "noopener";
      link.click();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A fájl nem tölthető le.");
    } finally {
      setDownloadBusyId("");
    }
  }, []);

  const createFolder = useCallback(async (parentId: string | null, name: string) => {
    setError("");
    try {
      const response = await fetch("/api/drive/personal/folders", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentId, name }) });
      const payload = await response.json() as { ok?: boolean; error?: string; folder?: PersonalDriveFolder };
      if (!response.ok || !payload.ok || !payload.folder) throw new Error(payload.error || "A mappa nem hozható létre.");
      setFolders((current) => [...current, payload.folder as PersonalDriveFolder]);
      setSelectedFolderId(payload.folder.id);
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A mappa nem hozható létre."); return false; }
  }, []);

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    setError("");
    try {
      const response = await fetch(`/api/drive/personal/folders/${encodeURIComponent(folderId)}`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json() as { ok?: boolean; error?: string; folder?: PersonalDriveFolder };
      if (!response.ok || !payload.ok || !payload.folder) throw new Error(payload.error || "A mappa nem nevezhető át.");
      setFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, ...payload.folder } : folder));
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A mappa nem nevezhető át."); return false; }
  }, []);

  const moveFile = useCallback(async (item: PersonalDriveItem, folderId: string | null) => {
    if (!folderCoreReady || (item.folderId || null) === folderId) return;
    setMovingRefId(item.id); setError("");
    try {
      const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(item.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ folderId }) });
      const payload = await response.json() as { ok?: boolean; error?: string; ref?: { folderId?: string | null; updatedAt?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A fájl nem helyezhető át.");
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, folderId: payload.ref?.folderId || null, updatedAt: payload.ref?.updatedAt || row.updatedAt } : row));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájl nem helyezhető át."); }
    finally { setMovingRefId(""); }
  }, [folderCoreReady]);

  const fileActions = (item: PersonalDriveItem, clean: boolean) => (
    <div className={styles.personalFileActions}>
      {folderCoreReady ? (
        <select value={item.folderId || ""} onChange={(event) => void moveFile(item, event.target.value || null)} disabled={movingRefId === item.id} aria-label={`${item.name} célmappája`} title="Fájl áthelyezése">
          <option value="">Saját Drive gyökér</option>
          {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
        </select>
      ) : null}
      <button type="button" className={styles.personalDriveDownload} disabled={!clean || downloadBusyId === item.id} onClick={() => void download(item)}>
        {downloadBusyId === item.id ? <Loader2 className={styles.spin} size={14} /> : <Download size={14} />} Letöltés
      </button>
    </div>
  );

  const contentPane = (
    <section className={styles.personalFilesPane}>
      {folderCoreReady ? <div className={styles.personalFolderBreadcrumb}><HardDrive size={13} /><span>Saját Drive</span><strong>/ {selectedFolderName}</strong><span>{filteredItems.length} fájl</span></div> : null}
      {viewMode === "engineering" ? (
        <div className={styles.personalEngineeringHint}>
          <strong>Mérnöki nézet</strong>
          <span>A saját tervfájlok műszaki metaadatai ugyanebben a nézetben jelennek meg. A még nem rögzített tervszám, revízió és lépték helyén „—” látható; a szerkeszthető személyes metaadatmotor a következő fejlesztési fázis.</span>
        </div>
      ) : null}
      {loading ? (
        <div className={styles.personalDriveEmpty}><Loader2 className={styles.spin} size={24} /><strong>Saját Drive betöltése…</strong></div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.personalDriveEmpty}>
          <HardDrive size={30} />
          <strong>{folderCoreReady && selectedFolderId ? "A mappa jelenleg üres" : "A Saját Drive jelenleg üres"}</strong>
          <span>{folderCoreReady ? "A fájlok ebben a mappában jelennek meg. A közvetlen személyes feltöltés a következő fejlesztési lépés." : "A Terepi Gyorsrögzítőből vagy későbbi személyes Drive feltöltésből ide mentett fájlok ebben a gyökérben jelennek meg."}</span>
        </div>
      ) : (
        <div className={styles.personalDriveTableWrap}>
          <table className={styles.personalDriveTable}>
            <thead>
              {viewMode === "engineering" ? (
                <tr><th>Tervszám</th><th>Megnevezés</th><th>Típus</th><th>Revízió</th><th>Lépték</th><th>Fájlnév</th><th>Forrás</th><th>Méret</th><th>Módosítva</th><th>Biztonság</th><th /></tr>
              ) : (
                <tr><th>Név</th><th>Típus</th><th>Forrás</th><th>Méret</th><th>Módosítva</th><th>Biztonság</th><th /></tr>
              )}
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const clean = item.securityStatus === "clean" && item.virusScanStatus === "clean";
                const fileType = item.mimeType || item.originalName?.split(".").pop()?.toUpperCase() || "fájl";
                const fileName = item.originalName || item.name;
                if (viewMode === "engineering") return (
                  <tr key={item.id}>
                    <td>—</td>
                    <td><div className={styles.personalDriveFileName}><FileText size={16} /><span><strong>{item.name}</strong><small>Saját Drive dokumentum</small></span></div></td>
                    <td>{fileType}</td><td>—</td><td>—</td><td>{fileName}</td><td>{sourceLabel(item.sourceSystem)}</td><td>{formatBytes(item.sizeBytes)}</td><td>{formatDate(item.updatedAt)}</td>
                    <td><span className={clean ? styles.personalDriveSecurityOk : styles.personalDriveSecurityWait}>{clean ? "Ellenőrzött" : "Ellenőrzés alatt"}</span></td>
                    <td>{fileActions(item, clean)}</td>
                  </tr>
                );
                return (
                  <tr key={item.id}>
                    <td><div className={styles.personalDriveFileName}><FileText size={16} /><span><strong>{item.name}</strong><small>{item.mimeType || item.originalName || "fájl"}</small></span></div></td>
                    <td>{fileType}</td><td>{sourceLabel(item.sourceSystem)}</td><td>{formatBytes(item.sizeBytes)}</td><td>{formatDate(item.updatedAt)}</td>
                    <td><span className={clean ? styles.personalDriveSecurityOk : styles.personalDriveSecurityWait}>{clean ? "Ellenőrzött" : "Ellenőrzés alatt"}</span></td>
                    <td>{fileActions(item, clean)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  if (bootLoaderVisible) return <DrivePremiumLoader complete={bootLoaderComplete} workspaceType="PERSONAL" />;

  return (
    <div className={styles.personalWorkspace}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <div className={styles.projectIcon}><HardDrive size={18} /></div>
          <div><h1>{workspaceName}</h1><div className={styles.projectMeta}><span>Személyes DIMPRO tárhely</span><span className={styles.activeBadge}>Aktív</span><span>{items.length} fájl · {formatBytes(totalBytes)}</span></div></div>
        </div>
        {workspaceOptions.length > 0 && selectedWorkspaceId ? (
          <div className={styles.workspaceSelectorWrap}>
            <label className={styles.workspaceSelectorLabel} htmlFor="drive-personal-workspace-selector">Munkatér</label>
            <select id="drive-personal-workspace-selector" className={styles.workspaceSelector} value={selectedWorkspaceId} onChange={(event) => onWorkspaceChange(event.target.value)} aria-label="Drive munkatér kiválasztása">
              {workspaceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.code ? " · " + option.code : ""}</option>)}
            </select>
          </div>
        ) : null}
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button>
          <button type="button" className={styles.headerAction}><HelpCircle size={14} /> Súgó</button>
          <div className={styles.userPill}><span className={styles.avatar}>{(userEmail || "D").trim().charAt(0).toUpperCase() || "D"}</span><div><strong>{userEmail || "DIMPRO felhasználó"}</strong><span>Saját Drive tulajdonos</span></div></div>
          <HeaderLogoutIconButton className={styles.headerLogout} iconSize={16} />
        </div>
      </header>

      <div className={styles.personalDriveBody}>
        <section className={styles.personalDriveIntro}>
          <div><HardDrive size={22} /><div><strong>Saját Drive{folderCoreReady ? "" : " · USER_ROOT"}</strong><span>A személyes és a projekt Drive külön tulajdonosi tartomány. A projekt-hozzáférés megszűnése nem törli a saját példányokat.</span></div></div>
          <DriveViewModeToggle value={viewMode} onChange={setViewMode} allowedModes={["simple", "engineering"]} onRefresh={() => void loadContent()} />
        </section>

        <div className={styles.personalDriveNotice}>
          <ShieldCheck size={16} />
          <span>{folderCoreReady ? "A személyes mappafa aktív. A mappák és fájlok kizárólag a saját felhasználói tulajdonosi tartományban kezelhetők; projekt ACL itt nem érvényesül." : "A személyes mappafa adatbázis-magja még nincs aktiválva. A Saját Drive biztonságosan USER_ROOT módban működik tovább; projekt ACL és projektfunkciók itt nem érvényesülnek."}</span>
        </div>

        {error ? <div className={styles.personalDriveError}>{error}</div> : null}
        {folderCoreReady ? (
          <div className={styles.personalDriveWorkspaceGrid}>
            <PersonalDriveFolderTree folders={folders} selectedFolderId={selectedFolderId} onSelect={setSelectedFolderId} onCreate={createFolder} onRename={renameFolder} />
            {contentPane}
          </div>
        ) : contentPane}
      </div>
    </div>
  );
}
