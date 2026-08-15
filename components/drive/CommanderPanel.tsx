"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  GripVertical,
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
  onMoveDocument: (document: DriveDocument, targetFolderId: string) => Promise<void>;
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
  onMoveDocument: (document: DriveDocument, targetFolderId: string) => Promise<void>;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "–";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function fileIcon(extension: string) {
  const ext = extension.toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={13} />;
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return <FileText size={13} />;
  return <File size={13} />;
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
  onMoveDocument,
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
        {childFolders.map((child) => (
          <button key={child.id} type="button" className={styles.commanderFolderRow} onDoubleClick={() => onFolderChange(child.id)} onClick={() => onFolderChange(child.id)}>
            <Folder size={13} /><strong>{child.name}</strong><span>Mappa</span>
          </button>
        ))}
        {paneDocuments.map((document) => {
          const selected = selectedDocumentId === document.id;
          const canMoveAcross = Boolean(oppositeFolderId && oppositeFolderId !== folderId && canWrite && moveReady && !busy);
          return (
            <div
              key={document.id}
              className={`${styles.commanderFileRow} ${selected ? styles.commanderFileSelected : ""}`}
              draggable={canWrite && moveReady}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({ documentId: document.id, versionId: document.currentVersion?.id || null, sourceFolderId: document.folderId }));
              }}
              onClick={() => onSelectDocument(document)}
            >
              <GripVertical size={11} className={styles.commanderGrip} />
              <span className={styles.commanderFileIcon}>{fileIcon(document.extension)}</span>
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
  onMoveDocument,
}: Props) {
  const initialLeft = folders[0]?.id || "";
  const initialRight = folders.find((folder) => folder.id !== initialLeft)?.id || initialLeft;
  const [leftFolderId, setLeftFolderId] = useState(initialLeft);
  const [rightFolderId, setRightFolderId] = useState(initialRight);

  useEffect(() => {
    if (!folders.some((folder) => folder.id === leftFolderId)) setLeftFolderId(folders[0]?.id || "");
    if (!folders.some((folder) => folder.id === rightFolderId)) setRightFolderId(folders.find((folder) => folder.id !== leftFolderId)?.id || folders[0]?.id || "");
  }, [folders, leftFolderId, rightFolderId]);

  if (!folders.length) return <div className={styles.commanderNoFolders}><Folder size={24} /><strong>A Commander nézethez előbb hozz létre legalább egy mappát.</strong></div>;

  return (
    <div className={styles.commanderWorkspace}>
      <div className={styles.commanderHeader}>
        <div><strong>Commander / kétpaneles fájlkezelő</strong><span>Válassz két projektmappát. A fájlok húzással vagy a nyílgombbal helyezhetők át a panelek között.</span></div>
        <span className={moveReady ? styles.commanderReady : styles.commanderWaiting}>{moveReady ? "Áthelyezés aktív" : "Olvasási mód"}</span>
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
          onMoveDocument={onMoveDocument}
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
          onMoveDocument={onMoveDocument}
        />
      </div>
    </div>
  );
}
