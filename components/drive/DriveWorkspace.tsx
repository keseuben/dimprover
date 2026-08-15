"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  HelpCircle,
  Loader2,
} from "lucide-react";
import BoxShelf from "./BoxShelf";
import CommanderPanel from "./CommanderPanel";
import CompareWorkspace from "./CompareWorkspace";
import DetailsPanel from "./DetailsPanel";
import DriveToolbar from "./DriveToolbar";
import FileGridPanel from "./FileGridPanel";
import FolderTreePanel from "./FolderTreePanel";
import type {
  DriveBox,
  DriveBoxPurpose,
  DriveCompareSeed,
  DriveDocument,
  DriveDocumentDetails,
  DriveHealth,
  DriveLayoutMode,
  DrivePermission,
  DriveTree,
  DriveViewMode,
} from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  projectStatus?: string;
  permissions?: DrivePermission[];
};

type TreePayload = {
  ok?: boolean;
  error?: string;
  tree?: DriveTree;
  permissions?: DrivePermission[];
};

type UploadInitPayload = {
  ok?: boolean;
  error?: string;
  signedUpload?: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
  completeUrl?: string;
  abortUrl?: string;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

export default function DriveWorkspace({ projectId, projectName, projectCode, projectStatus = "ACTIVE", permissions = [] }: Props) {
  const [tree, setTree] = useState<DriveTree | null>(null);
  const [health, setHealth] = useState<DriveHealth | null>(null);
  const [boxes, setBoxes] = useState<DriveBox[]>([]);
  const [apiPermissions, setApiPermissions] = useState<DrivePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [details, setDetails] = useState<DriveDocumentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [layoutMode, setLayoutMode] = useState<DriveLayoutMode>("three");
  const [viewMode, setViewMode] = useState<DriveViewMode>("engineering");
  const [boxShelfOpen, setBoxShelfOpen] = useState(true);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSeedItems, setCompareSeedItems] = useState<DriveCompareSeed[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectivePermissions = useMemo(() => [...new Set([...permissions, ...apiPermissions])], [permissions, apiPermissions]);
  const canWrite = effectivePermissions.includes("document.write");

  const loadBoxes = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; boxes?: DriveBox[] };
      if (!response.ok || !payload.ok) {
        if (response.status === 503) { setBoxes([]); return; }
        throw new Error(payload.error || "A CsomagBOX lista nem tölthető be.");
      }
      setBoxes(payload.boxes || []);
    } catch (caught) {
      setBoxes([]);
      setError(caught instanceof Error ? caught.message : "A CsomagBOX lista nem tölthető be.");
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [healthResponse, treeResponse] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/health`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/tree`, { credentials: "same-origin", cache: "no-store" }),
      ]);
      const healthPayload = await healthResponse.json() as DriveHealth;
      const treePayload = await treeResponse.json() as TreePayload;
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A Drive rendszerállapot nem tölthető be.");
      if (!treeResponse.ok || !treePayload.ok || !treePayload.tree) throw new Error(treePayload.error || "A projekt dokumentumtára nem tölthető be.");
      setHealth(healthPayload);
      setTree(treePayload.tree);
      setApiPermissions(treePayload.permissions || []);
      if (healthPayload.workspace?.databaseReady) await loadBoxes(); else setBoxes([]);
      setSelectedFolderId((current) => current === "all" || treePayload.tree?.folders.some((folder) => folder.id === current) ? current : "all");
      setSelectedDocumentId((current) => {
        if (current && treePayload.tree?.documents.some((document) => document.id === current)) return current;
        return treePayload.tree?.documents[0]?.id || "";
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Drive betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [loadBoxes, projectId]);

  useEffect(() => {
    setTree(null);
    setHealth(null);
    setBoxes([]);
    setDetails(null);
    setSelectedFolderId("all");
    setSelectedDocumentId("");
    void load();
  }, [load, projectId]);

  const loadDetails = useCallback(async (documentId: string) => {
    if (!documentId) {
      setDetails(null);
      return;
    }
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(documentId)}/details`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string; details?: DriveDocumentDetails };
      if (!response.ok || !payload.ok || !payload.details) throw new Error(payload.error || "A dokumentum részletei nem tölthetők be.");
      setDetails(payload.details);
    } catch (caught) {
      setDetails(null);
      setError(caught instanceof Error ? caught.message : "A dokumentum részletei nem tölthetők be.");
    } finally {
      setDetailsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadDetails(selectedDocumentId); }, [loadDetails, selectedDocumentId]);

  const selectedFolder = tree?.folders.find((folder) => folder.id === selectedFolderId) || null;
  const selectedDocument = tree?.documents.find((document) => document.id === selectedDocumentId) || null;

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
          if (child.parentId && ids.has(child.parentId) && !ids.has(child.id)) {
            ids.add(child.id);
            changed = true;
          }
        }
      }
      counts.set(folder.id, tree.documents.filter((document) => ids.has(document.folderId)).length);
    }
    return counts;
  }, [tree]);

  const visibleDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return (tree?.documents || []).filter((document) => {
      const folderMatch = folderScope === null || folderScope.has(document.folderId);
      const queryMatch = !normalized || [document.name, document.description, document.extension, document.source, document.currentVersion?.revisionCode || ""]
        .join(" ")
        .toLocaleLowerCase("hu-HU")
        .includes(normalized);
      return folderMatch && queryMatch;
    });
  }, [folderScope, query, tree]);

  async function createFolder() {
    if (!canWrite) return;
    const name = window.prompt("Új mappa neve:", "Új mappa")?.trim();
    if (!name) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/folders`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: selectedFolderId === "all" ? null : selectedFolderId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A mappa létrehozása sikertelen.");
      setNotice(`Mappa létrehozva: ${name}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A mappa létrehozása sikertelen.");
    } finally { setBusy(false); }
  }

  function requestUpload() {
    if (!canWrite) return;
    if (selectedFolderId === "all") {
      setError("Feltöltés előtt válassz ki egy célmappát a bal oldali mappafában.");
      return;
    }
    if (!health?.storage?.realObjectWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }
    fileInputRef.current?.click();
  }

  async function uploadFile(file: File) {
    if (!file || !selectedFolder || !canWrite) return;
    setBusy(true); setError(""); setNotice(`Feltöltés előkészítése: ${file.name}`);
    let abortUrl = "";
    try {
      const initResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/uploads/init`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folderId: selectedFolder.id,
          documentName: file.name,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          revisionCode: "V1",
          description: "Webes feltöltés a DIMPRO Drive Workspace felületéről.",
          changeNote: "Web Drive feltöltés.",
          source: "WEB",
        }),
      });
      const initPayload = await initResponse.json() as UploadInitPayload;
      if (!initResponse.ok || !initPayload.ok || !initPayload.signedUpload || !initPayload.completeUrl) {
        throw new Error(initPayload.error || "A feltöltési munkamenet nem hozható létre.");
      }
      abortUrl = initPayload.abortUrl || "";
      setNotice(`Feltöltés a privát tárhelyre: ${file.name}`);
      const objectResponse = await fetch(initPayload.signedUpload.url, {
        method: initPayload.signedUpload.method,
        headers: initPayload.signedUpload.headers,
        body: file,
      });
      if (!objectResponse.ok) throw new Error(`A privát tárhely feltöltése sikertelen (${objectResponse.status}).`);

      setNotice("Szerveroldali méret- és SHA-256 ellenőrzés…");
      const completeResponse = await fetch(initPayload.completeUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const completePayload = await completeResponse.json() as { ok?: boolean; error?: string; session?: { finalVersionStatus?: string }; document?: { id?: string } };
      if (!completeResponse.ok || !completePayload.ok) throw new Error(completePayload.error || "A feltöltés véglegesítése sikertelen.");
      setNotice(completePayload.session?.finalVersionStatus === "QUARANTINED"
        ? "A fájl feltöltődött és karanténellenőrzésre vár."
        : "A fájl feltöltődött, a SHA-256 ellenőrzés sikeres és a verzió aktiválva lett.");
      await load();
      if (completePayload.document?.id) setSelectedDocumentId(completePayload.document.id);
    } catch (caught) {
      if (abortUrl) {
        await fetch(abortUrl, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Web Drive kliensoldali feltöltés megszakadt." }) }).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "A fájlfeltöltés sikertelen.");
      setNotice("");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveMetadata(input: Record<string, string>) {
    if (!selectedDocument || !canWrite) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/metadata`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A metaadat mentése sikertelen.");
      setNotice("Mérnöki metaadatok mentve és auditálva.");
      await loadDetails(selectedDocument.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A metaadat mentése sikertelen."); }
    finally { setBusy(false); }
  }

  async function saveNote(note: string) {
    if (!selectedDocument || !canWrite) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/note`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, versionId: selectedDocument.currentVersion?.id || "" }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A megjegyzés mentése sikertelen.");
      setNotice("Fájlmegjegyzés mentve és auditálva.");
      await loadDetails(selectedDocument.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A megjegyzés mentése sikertelen."); }
    finally { setBusy(false); }
  }

  async function ensureQr() {
    if (!selectedDocument || !canWrite) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/qr`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: selectedDocument.currentVersion?.id || "" }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotent?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A QR azonosító létrehozása sikertelen.");
      setNotice(payload.idempotent ? "Ehhez a fájlverzióhoz már tartozik aktív QR azonosító." : "QR azonosító létrehozva és auditálva.");
      await loadDetails(selectedDocument.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A QR azonosító létrehozása sikertelen."); }
    finally { setBusy(false); }
  }

  async function downloadSelected() {
    if (!selectedDocument) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/download`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: selectedDocument.currentVersion?.id || null }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string; fileName?: string } };
      if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A letöltési link nem hozható létre.");
      window.location.assign(payload.download.url);
      setNotice(`Letöltés előkészítve: ${payload.download.fileName || selectedDocument.name}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A letöltés sikertelen."); }
    finally { setBusy(false); }
  }

  const boxColorsByDocument = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const box of boxes) {
      for (const item of box.items) {
        const colors = result[item.documentId] || [];
        if (!colors.includes(box.colorToken)) colors.push(box.colorToken);
        result[item.documentId] = colors;
      }
    }
    return result;
  }, [boxes]);

  async function createBox(input: { name: string; purpose: DriveBoxPurpose; colorToken: string; iconKey: string; note: string }) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; box?: DriveBox };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A CsomagBOX létrehozása sikertelen.");
      setNotice(`CsomagBOX létrehozva: ${input.name}`);
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A CsomagBOX létrehozása sikertelen."); }
    finally { setBusy(false); }
  }

  async function addDocumentToBox(boxId: string, document: DriveDocument) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/items`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: document.id, versionId: document.currentVersion?.id || null }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotent?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A fájl CsomagBOX-hoz adása sikertelen.");
      const boxName = boxes.find((box) => box.id === boxId)?.name || "CsomagBOX";
      setNotice(payload.idempotent ? `${document.name} már szerepel ebben a BOX-ban.` : `${document.name} hozzáadva: ${boxName}`);
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájl CsomagBOX-hoz adása sikertelen."); }
    finally { setBusy(false); }
  }

  async function removeBoxItem(boxId: string, itemId: string) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A fájl eltávolítása a BOX-ból sikertelen.");
      setNotice("Fájl eltávolítva a CsomagBOX-ból.");
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájl eltávolítása a BOX-ból sikertelen."); }
    finally { setBusy(false); }
  }

  async function moveDocument(document: DriveDocument, targetFolderId: string) {
    if (!canWrite || !health?.workspace?.databaseReady || !targetFolderId) return;
    if (document.folderId === targetFolderId) {
      setNotice(`${document.name} már ebben a mappában található.`);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/move`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetFolderId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotent?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A dokumentum áthelyezése sikertelen.");
      const targetName = tree?.folders.find((folder) => folder.id === targetFolderId)?.name || "célmappa";
      setNotice(payload.idempotent ? `${document.name} már a kiválasztott mappában volt.` : `${document.name} áthelyezve: ${targetName}`);
      await load();
      setSelectedDocumentId(document.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A dokumentum áthelyezése sikertelen."); }
    finally { setBusy(false); }
  }

  function openCompare(seedItems?: DriveCompareSeed[]) {
    const validSeeds: DriveCompareSeed[] = [];
    for (const seed of seedItems || []) {
      if (!seed.documentId || !(tree?.documents || []).some((document) => document.id === seed.documentId)) continue;
      const key = `${seed.documentId}::${seed.versionId || "current"}`;
      if (validSeeds.some((item) => `${item.documentId}::${item.versionId || "current"}` === key)) continue;
      validSeeds.push({ documentId: seed.documentId, versionId: seed.versionId || null });
      if (validSeeds.length >= 2) break;
    }
    if (validSeeds.length >= 2) {
      setCompareSeedItems(validSeeds);
    } else {
      const selected = (tree?.documents || []).find((document) => document.id === selectedDocumentId) || null;
      const fallback = (tree?.documents || []).find((document) => document.id !== selected?.id) || null;
      setCompareSeedItems([
        selected ? { documentId: selected.id, versionId: selected.currentVersion?.id || null } : null,
        fallback ? { documentId: fallback.id, versionId: fallback.currentVersion?.id || null } : null,
      ].filter((item): item is DriveCompareSeed => Boolean(item)));
    }
    setCompareActive(true);
  }

  function toggleCompare() {
    if (compareActive) {
      setCompareActive(false);
      return;
    }
    openCompare();
  }

  if (loading && !tree) {
    return <div className={styles.loadingState}><div><Loader2 className={styles.spin} size={28} /><strong>DIMPRO Drive betöltése</strong><span>Projektmappák, jogosultságok és Workspace 1.0 ellenőrzése…</span></div></div>;
  }

  const browserClass = [
    styles.browser,
    layoutMode === "two" ? styles.layoutTwo : "",
    layoutMode === "one" ? styles.layoutOne : "",
    layoutMode === "split" ? styles.layoutSplit : "",
    layoutMode === "commander" ? styles.layoutCommander : "",
  ].filter(Boolean).join(" ");

  const folderHidden = layoutMode !== "three";
  const detailsHidden = layoutMode === "one";
  const title = selectedFolder?.name || "Teljes dokumentumtár";
  const breadcrumbParts = selectedFolder?.path.split("/").filter(Boolean) || [];

  return (
    <div className={styles.workspaceWrap}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <div className={styles.projectIcon}><Building2 size={18} /></div>
          <div>
            <h1>{projectName}</h1>
            <div className={styles.projectMeta}>
              <span>Projekt azonosító: {projectCode || projectId}</span>
              <span className={styles.activeBadge}>{projectStatus === "ACTIVE" ? "Aktív projekt" : projectStatus}</span>
              <span>{tree?.summary.documentCount || 0} fájl · {formatBytes(tree?.summary.totalSizeBytes || 0)}</span>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button>
          <button type="button" className={styles.headerAction}><HelpCircle size={14} /> Súgó</button>
          <div className={styles.userPill}><span className={styles.avatar}>D</span><div><strong>DIMPRO felhasználó</strong><span>Projekt hozzáférés</span></div></div>
        </div>
      </header>

      <DriveToolbar
        query={query}
        onQueryChange={setQuery}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        canWrite={canWrite}
        onCreateFolder={() => void createFolder()}
        onUpload={requestUpload}
        boxCount={boxes.length}
        boxShelfOpen={boxShelfOpen}
        boxReady={Boolean(health?.workspace?.databaseReady)}
        onToggleBoxShelf={() => setBoxShelfOpen((current) => !current)}
        compareActive={compareActive}
        onToggleCompare={toggleCompare}
      />
      <input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />

      <div className={styles.breadcrumb}>
        <span>Dokumentumtár</span>
        {breadcrumbParts.map((part, index) => <span key={`${part}-${index}`}>› <strong>{part}</strong></span>)}
      </div>

      {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
      {!error && notice && <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>}
      {!error && !notice && health?.workspace && !health.workspace.databaseReady && <div className={`${styles.notice} ${styles.noticeInfo}`}>{health.workspace.nextStep}</div>}

      <div className={`${browserClass} ${compareActive ? styles.browserCompareActive : ""}`}>
        {compareActive ? (
          <CompareWorkspace
            projectId={projectId}
            documents={tree?.documents || []}
            boxes={boxes}
            seedItems={compareSeedItems}
            onClose={() => setCompareActive(false)}
          />
        ) : layoutMode === "commander" ? (
          <CommanderPanel
            folders={tree?.folders || []}
            documents={tree?.documents || []}
            selectedDocumentId={selectedDocumentId}
            canWrite={canWrite}
            moveReady={Boolean(health?.workspace?.databaseReady)}
            busy={busy}
            onSelectDocument={(document) => setSelectedDocumentId(document.id)}
            onMoveDocument={moveDocument}
          />
        ) : (
          <>
            <FolderTreePanel
              folders={tree?.folders || []}
              selectedFolderId={selectedFolderId}
              documentCounts={folderDocumentCounts}
              totalDocumentCount={tree?.summary.documentCount || 0}
              onSelectFolder={setSelectedFolderId}
              responsiveClassName={`${styles.folderPanelResponsive} ${folderHidden ? styles.hiddenPanel : ""}`}
            />
            <FileGridPanel
              title={title}
              subtitle={`${visibleDocuments.length} fájl · ${tree?.folders.length || 0} mappa`}
              documents={visibleDocuments}
              selectedDocumentId={selectedDocumentId}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSelectDocument={(document) => setSelectedDocumentId(document.id)}
              onRefresh={() => void load()}
              boxColorsByDocument={boxColorsByDocument}
            />
            <DetailsPanel
              projectId={projectId}
              document={selectedDocument}
              details={details}
              loading={detailsLoading}
              busy={busy}
              canWrite={canWrite}
              onSaveMetadata={saveMetadata}
              onSaveNote={saveNote}
              onEnsureQr={ensureQr}
              onDownload={downloadSelected}
              responsiveClassName={`${styles.detailsResponsive} ${detailsHidden ? styles.hiddenPanel : ""}`}
            />
          </>
        )}
      </div>

      <BoxShelf
        open={boxShelfOpen}
        onOpenChange={setBoxShelfOpen}
        boxes={boxes}
        documents={tree?.documents || []}
        selectedDocument={selectedDocument}
        canWrite={canWrite}
        databaseReady={Boolean(health?.workspace?.databaseReady)}
        busy={busy}
        onCreateBox={createBox}
        onAddDocument={addDocumentToBox}
        onRemoveItem={removeBoxItem}
        onOpenCompareBox={(box) => openCompare(box.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId })))}
      />
    </div>
  );
}
