"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  FolderUp,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { DriveDocument, DriveFolder } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  folders: DriveFolder[];
  documents: DriveDocument[];
  selectedDocumentId: string;
  canWrite: boolean;
  moveReady: boolean;
  busy: boolean;
  onSelectDocument: (document: DriveDocument) => void;
  onOpenDocument: (document: DriveDocument) => void;
  onMoveDocument: (document: DriveDocument, targetFolderId: string) => Promise<void>;
  tableZoom?: number;
  selectedDocumentIds?: string[];
  onSelectionChange?: (documentIds: string[]) => void;
  canDelete?: boolean;
  onDeleteSelected?: (documentIds: string[]) => Promise<void>;
};

type PaneProps = {
  side: "left" | "right";
  folders: DriveFolder[];
  documents: DriveDocument[];
  folderId: string;
  oppositeFolderId: string;
  selectedDocumentId: string;
  canWrite: boolean;
  moveReady: boolean;
  busy: boolean;
  onFolderChange: (folderId: string) => void;
  onSelectDocument: (document: DriveDocument) => void;
  onOpenDocument: (document: DriveDocument) => void;
  onMoveDocument: (document: DriveDocument, targetFolderId: string) => Promise<void>;
  tableZoom: number;
  selectedSet: Set<string>;
  onToggleSelection: (documentId: string) => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "–";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif", "tif", "tiff"]);

function fileIcon(extension: string) {
  const ext = extension.toLowerCase();
  if (imageExtensions.has(ext)) return <ImageIcon size={13} />;
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={13} />;
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return <FileText size={13} />;
  return <File size={13} />;
}

function commanderFileIconClass(extension: string) {
  return imageExtensions.has(extension.toLowerCase())
    ? `${styles.commanderFileIcon} ${styles.commanderFileIconImage}`
    : styles.commanderFileIcon;
}

function folderLabel(folder: DriveFolder) {
  const path = folder.path.split("/").filter(Boolean);
  return path.length > 1 ? path.join(" / ") : folder.name;
}

function CommanderPane({
  side,
  folders,
  documents,
  folderId,
  oppositeFolderId,
  selectedDocumentId,
  canWrite,
  moveReady,
  busy,
  onFolderChange,
  onSelectDocument,
  onOpenDocument,
  onMoveDocument,
  tableZoom,
  selectedSet,
  onToggleSelection,
}: PaneProps) {
  const folder = folders.find((entry) => entry.id === folderId) || null;
  const paneDocuments = useMemo(
    () => documents.filter((document) => document.folderId === folderId),
    [documents, folderId],
  );
  const childFolders = useMemo(
    () => folders.filter((entry) => entry.parentId === folderId),
    [folders, folderId],
  );
  const directDocumentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents) counts.set(document.folderId, (counts.get(document.folderId) || 0) + 1);
    return counts;
  }, [documents]);

  async function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!canWrite || !moveReady || busy || !folderId) return;
    const raw = event.dataTransfer.getData("application/x-dimpro-drive-document");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { documentId?: string; sourceFolderId?: string };
      const document = payload.documentId ? documents.find((entry) => entry.id === payload.documentId) : undefined;
      if (document && document.folderId !== folderId) await onMoveDocument(document, folderId);
    } catch {
      // Idegen drag payloadot figyelmen kívül hagyunk.
    }
  }

  return (
    <section
      className={styles.commanderPane}
      onDragOver={(event) => { if (canWrite && moveReady) event.preventDefault(); }}
      onDrop={(event) => void onDrop(event)}
      aria-label={`${side === "left" ? "Bal" : "Jobb"} Commander panel`}
    >
      <header className={styles.commanderPaneHeader}>
        <div className={styles.commanderPaneLabel}><Folder size={14} /><strong>{side === "left" ? "Bal panel" : "Jobb panel"}</strong></div>
        <select value={folderId} onChange={(event) => onFolderChange(event.target.value)} aria-label={`${side === "left" ? "Bal" : "Jobb"} panel mappája`}>
          {folders.map((entry) => <option key={entry.id} value={entry.id}>{folderLabel(entry)}</option>)}
        </select>
      </header>
      <div className={styles.commanderPath}>{folder?.path || "Dokumentumtár"}</div>
      <div className={styles.commanderList}>
        <div className={styles.commanderListInner} style={{ zoom: tableZoom / 100 }}>
        {folder?.parentId && (
          <button type="button" className={styles.commanderFolderRow} onClick={() => onFolderChange(folder.parentId || "")} title="Vissza a szülőmappába">
            <FolderUp size={13} /><strong>[..] Szülőmappa</strong><span>Vissza</span>
          </button>
        )}
        {childFolders.map((child) => (
          <button key={child.id} type="button" className={styles.commanderFolderRow} onDoubleClick={() => onFolderChange(child.id)} onClick={() => onFolderChange(child.id)}>
            <Folder size={13} /><strong>{child.name}</strong><span>Mappa · {directDocumentCounts.get(child.id) || 0} fájl</span>
          </button>
        ))}
        {paneDocuments.map((document) => {
          const selected = selectedDocumentId === document.id;
          const canMoveAcross = Boolean(oppositeFolderId && oppositeFolderId !== folderId && canWrite && moveReady && !busy);
          return (
            <div
              key={document.id}
              className={`${styles.commanderFileRow} ${selected ? styles.commanderFileSelected : ""} ${selectedSet.has(document.id) ? styles.commanderFileChecked : ""}`}
              draggable={canWrite && moveReady}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({ documentId: document.id, versionId: document.currentVersion?.id || null, sourceFolderId: document.folderId }));
              }}
              onClick={() => onSelectDocument(document)}
              onDoubleClick={() => onOpenDocument(document)}
              title="Kattintás: kijelölés · Dupla kattintás: megnyitás · Húzás: áthelyezés"
            >
              <input
                type="checkbox"
                className={styles.commanderSelect}
                checked={selectedSet.has(document.id)}
                draggable={false}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={() => onToggleSelection(document.id)}
                aria-label={document.name + " kijelölése"}
              />
              <GripVertical size={11} className={styles.commanderGrip} />
              <span className={commanderFileIconClass(document.extension)}>{fileIcon(document.extension)}</span>
              <div className={styles.commanderFileName}><strong>{document.name}</strong><span>{document.extension.toUpperCase() || "FILE"} · {formatBytes(document.currentVersion?.sizeBytes || 0)}</span></div>
              <span className={styles.commanderRevision}>{document.currentVersion?.revisionCode || `V${document.currentVersionNumber}`}</span>
              {canMoveAcross && (
                <button
                  type="button"
                  className={styles.commanderMoveButton}
                  onClick={(event) => { event.stopPropagation(); void onMoveDocument(document, oppositeFolderId); }}
                  title={side === "left" ? "Áthelyezés a jobb panel mappájába" : "Áthelyezés a bal panel mappájába"}
                >
                  {side === "left" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
                </button>
              )}
            </div>
          );
        })}
        {!childFolders.length && !paneDocuments.length && <div className={styles.commanderEmpty}>A mappa üres. Fájlt a másik panelből ide húzhatsz.</div>}
        </div>
      </div>
      <footer className={styles.commanderPaneFooter}>
        <span>{childFolders.length} mappa</span><span>{paneDocuments.length} fájl</span>
        {!moveReady && <strong>Áthelyezés a Workspace SQL után aktív</strong>}
      </footer>
    </section>
  );
}

export default function CommanderPanel({
  folders,
  documents,
  selectedDocumentId,
  canWrite,
  moveReady,
  busy,
  onSelectDocument,
  onOpenDocument,
  onMoveDocument,
  tableZoom = 100,
  selectedDocumentIds = [],
  onSelectionChange,
  canDelete = false,
  onDeleteSelected,
}: Props) {
  const initialLeft = folders[0]?.id || "";
  const initialRight = folders.find((folder) => folder.id !== initialLeft)?.id || initialLeft;
  const [leftFolderId, setLeftFolderId] = useState(initialLeft);
  const [rightFolderId, setRightFolderId] = useState(initialRight);
  const selectedSet = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds]);

  const toggleSelection = (documentId: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedSet.has(documentId)
      ? selectedDocumentIds.filter((id) => id !== documentId)
      : [...selectedDocumentIds, documentId]);
  };

  const visibleIds = useMemo(() => {
    const ids = documents
      .filter((document) => document.folderId === leftFolderId || document.folderId === rightFolderId)
      .map((document) => document.id);
    return [...new Set(ids)];
  }, [documents, leftFolderId, rightFolderId]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const toggleVisibleSelection = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedDocumentIds);
    const select = !allVisibleSelected;
    for (const id of visibleIds) select ? next.add(id) : next.delete(id);
    onSelectionChange([...next]);
  };

  useEffect(() => {
    if (!folders.some((folder) => folder.id === leftFolderId)) setLeftFolderId(folders[0]?.id || "");
    if (!folders.some((folder) => folder.id === rightFolderId)) setRightFolderId(folders.find((folder) => folder.id !== leftFolderId)?.id || folders[0]?.id || "");
  }, [folders, leftFolderId, rightFolderId]);

  if (!folders.length) return <div className={styles.commanderNoFolders}><Folder size={24} /><strong>A Commander nézethez előbb hozz létre legalább egy mappát.</strong></div>;

  return (
    <div className={styles.commanderWorkspace}>
      <div className={styles.commanderHeader}>
        <div><strong>Commander / kétpaneles fájlkezelő</strong><span>Válassz két projektmappát. A fájlok húzással vagy a nyílgombbal helyezhetők át a panelek között.</span></div>
        <div className={styles.commanderHeaderActions}>
          <label className={styles.commanderSelectAll}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} disabled={!visibleIds.length || !onSelectionChange} /> {selectedDocumentIds.length} kijelölt</label>
          <button type="button" disabled={!selectedDocumentIds.length || !onSelectionChange || busy} onClick={() => onSelectionChange?.([])}>Kijelölés törlése</button>
          {canDelete && onDeleteSelected && <button type="button" className={styles.commanderDeleteButton} disabled={!selectedDocumentIds.length || busy} onClick={() => void onDeleteSelected(selectedDocumentIds)}><Trash2 size={12} /> Törlés</button>}
          <span className={moveReady ? styles.commanderReady : styles.commanderWaiting}>{moveReady ? "Áthelyezés aktív" : "Olvasási mód"}</span>
        </div>
      </div>
      <div className={styles.commanderColumns}>
        <CommanderPane
          side="left"
          folders={folders}
          documents={documents}
          folderId={leftFolderId}
          oppositeFolderId={rightFolderId}
          selectedDocumentId={selectedDocumentId}
          canWrite={canWrite}
          moveReady={moveReady}
          busy={busy}
          onFolderChange={setLeftFolderId}
          onSelectDocument={onSelectDocument}
          onOpenDocument={onOpenDocument}
          onMoveDocument={onMoveDocument}
          tableZoom={tableZoom}
          selectedSet={selectedSet}
          onToggleSelection={toggleSelection}
        />
        <div className={styles.commanderDivider} aria-hidden="true" />
        <CommanderPane
          side="right"
          folders={folders}
          documents={documents}
          folderId={rightFolderId}
          oppositeFolderId={leftFolderId}
          selectedDocumentId={selectedDocumentId}
          canWrite={canWrite}
          moveReady={moveReady}
          busy={busy}
          onFolderChange={setRightFolderId}
          onSelectDocument={onSelectDocument}
          onOpenDocument={onOpenDocument}
          onMoveDocument={onMoveDocument}
          tableZoom={tableZoom}
          selectedSet={selectedSet}
          onToggleSelection={toggleSelection}
        />
      </div>
    </div>
  );
}
