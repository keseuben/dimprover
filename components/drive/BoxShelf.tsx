"use client";

import { useMemo, useState, type DragEvent } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Folder,
  FolderPlus,
  GitCompareArrows,
  History,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { DriveBox, DriveBoxFolder, DriveBoxLifecycleStatus, DriveBoxPurpose, DriveDocument, DriveEngineeringMetadata } from "./driveTypes";
import BoxHistoryPanel from "./BoxHistoryPanel";
import styles from "./DriveWorkspace.module.css";

type NewBoxInput = {
  name: string;
  purpose: DriveBoxPurpose;
  colorToken: string;
  iconKey: string;
  note: string;
};

type Props = {
  projectId: string;
  variant?: "shelf" | "panel";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxes: DriveBox[];
  documents: DriveDocument[];
  metadataByDocument: Record<string, DriveEngineeringMetadata>;
  selectedDocument: DriveDocument | null;
  canWrite: boolean;
  databaseReady: boolean;
  busy: boolean;
  onCreateBox: (input: NewBoxInput) => Promise<void>;
  onAddDocument: (boxId: string, document: DriveDocument) => Promise<void>;
  onRemoveItem: (boxId: string, itemId: string) => Promise<void>;
  onCreateFolder?: (boxId: string, parentId: string | null, name: string) => Promise<void>;
  onMoveItem?: (boxId: string, itemId: string, folderId: string | null) => Promise<void>;
  onDownloadBox?: (box: DriveBox, archiveName: string) => void;
  onSetLifecycle?: (boxId: string, nextStatus: DriveBoxLifecycleStatus) => Promise<void>;
  onOpenCompareBox: (box: DriveBox) => void;
};

const lifecycleConfig: Record<DriveBoxLifecycleStatus, { label: string; shortLabel: string }> = {
  DRAFT: { label: "Piszkozat", shortLabel: "Piszkozat" },
  READY: { label: "Elkészített", shortLabel: "Kész" },
  SENT: { label: "Kiküldött", shortLabel: "Kiküldött" },
  ARCHIVED: { label: "Archivált", shortLabel: "Archív" },
};

const lifecycleOrder: DriveBoxLifecycleStatus[] = ["DRAFT", "READY", "SENT", "ARCHIVED"];

function lifecycleTargets(current: DriveBoxLifecycleStatus) {
  const transitions: Record<DriveBoxLifecycleStatus, DriveBoxLifecycleStatus[]> = {
    DRAFT: ["DRAFT", "READY", "ARCHIVED"],
    READY: ["READY", "DRAFT", "SENT", "ARCHIVED"],
    SENT: ["SENT", "READY", "ARCHIVED"],
    ARCHIVED: ["ARCHIVED", "DRAFT"],
  };
  return transitions[current];
}

const purposeConfig: Record<DriveBoxPurpose, {
  label: string;
  description: string;
  colorToken: string;
  iconKey: string;
  icon: typeof PackageCheck;
}> = {
  GENERAL: { label: "Általános", description: "Saját dokumentumgyűjtés", colorToken: "slate", iconKey: "box", icon: PackageCheck },
  DROP: { label: "DROP küldés", description: "Külső címzettnek előkészített csomag", colorToken: "orange", iconKey: "send", icon: Send },
  COMPARE: { label: "Összehasonlítás", description: "Két vagy több revízió összevetéséhez", colorToken: "blue", iconKey: "compare", icon: GitCompareArrows },
  AI_ANALYSIS: { label: "AI vizsgálat", description: "Dokumentumvizsgálati forráscsomag", colorToken: "purple", iconKey: "brain", icon: BrainCircuit },
  ISSUE: { label: "Kiadási csomag", description: "Kiadásra összeállított dokumentumok", colorToken: "green", iconKey: "issue", icon: PackageCheck },
  MEETING: { label: "Értekezleti csomag", description: "Kooperációhoz kapcsolt dokumentumok", colorToken: "cyan", iconKey: "meeting", icon: Users },
};

function fileNameWithoutExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

function boxDisplayName(document: DriveDocument, metadata?: DriveEngineeringMetadata) {
  const extra = metadata?.extra || {};
  const explicit = typeof extra.planTitle === "string" && extra.planTitle.trim()
    ? extra.planTitle.trim()
    : typeof extra.drawingTitle === "string" && extra.drawingTitle.trim()
      ? extra.drawingTitle.trim()
      : "";
  return explicit || fileNameWithoutExtension(document.name);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function orderedBoxFolders(folders: DriveBoxFolder[]) {
  const children = new Map<string, DriveBoxFolder[]>();
  for (const folder of folders) {
    const key = folder.parentId || "";
    const bucket = children.get(key) || [];
    bucket.push(folder);
    children.set(key, bucket);
  }
  for (const bucket of children.values()) bucket.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "hu-HU"));

  const result: Array<{ folder: DriveBoxFolder; depth: number }> = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId || "") || []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      result.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const folder of folders) {
    if (!visited.has(folder.id)) result.push({ folder, depth: 0 });
  }
  return result;
}

function colorClass(token: string) {
  switch (token) {
    case "orange": return styles.boxCardOrange;
    case "purple": return styles.boxCardPurple;
    case "green": return styles.boxCardGreen;
    case "cyan": return styles.boxCardCyan;
    case "slate": return styles.boxCardSlate;
    default: return styles.boxCardBlue;
  }
}

export default function BoxShelf({
  projectId,
  variant = "shelf",
  open,
  onOpenChange,
  boxes,
  documents,
  metadataByDocument,
  selectedDocument,
  canWrite,
  databaseReady,
  busy,
  onCreateBox,
  onAddDocument,
  onRemoveItem,
  onCreateFolder,
  onMoveItem,
  onDownloadBox,
  onSetLifecycle,
  onOpenCompareBox,
}: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedBoxId, setExpandedBoxId] = useState("");
  const [historyBoxId, setHistoryBoxId] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<DriveBoxPurpose>("GENERAL");
  const [lifecycleFilter, setLifecycleFilter] = useState<"ALL" | DriveBoxLifecycleStatus>("ALL");
  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents]);
  const lifecycleFeatureReady = boxes.some((box) => box.lifecycleFeatureReady);
  const lifecycleCounts = useMemo(() => Object.fromEntries(
    lifecycleOrder.map((status) => [status, boxes.filter((box) => box.lifecycleStatus === status).length]),
  ) as Record<DriveBoxLifecycleStatus, number>, [boxes]);
  const visibleBoxes = useMemo(
    () => lifecycleFilter === "ALL" ? boxes : boxes.filter((box) => box.lifecycleStatus === lifecycleFilter),
    [boxes, lifecycleFilter],
  );

  async function submitNewBox() {
    const normalized = name.trim();
    if (!normalized || busy) return;
    const config = purposeConfig[purpose];
    await onCreateBox({
      name: normalized,
      purpose,
      colorToken: config.colorToken,
      iconKey: config.iconKey,
      note: config.description,
    });
    setName("");
    setPurpose("GENERAL");
    setComposerOpen(false);
  }

  function promptDownloadBox(box: DriveBox) {
    if (!onDownloadBox || !box.items.length) return;
    const raw = window.prompt("ZIP fájl neve:", box.name);
    const archiveName = raw?.trim() || "";
    if (!archiveName) return;
    onDownloadBox(box, archiveName);
  }

  async function promptNewFolder(boxId: string, parentId: string | null = null) {
    if (!onCreateFolder || busy) return;
    const raw = window.prompt(parentId ? "Új almappa neve:" : "Új CsomagBOX mappa neve:");
    const folderName = raw?.trim() || "";
    if (!folderName) return;
    await onCreateFolder(boxId, parentId, folderName);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, boxId: string) {
    event.preventDefault();
    if (!canWrite || !databaseReady || busy) return;
    const raw = event.dataTransfer.getData("application/x-dimpro-drive-document");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { documentId?: string; documentIds?: string[] };
      const sourceIds = Array.isArray(payload.documentIds) && payload.documentIds.length
        ? payload.documentIds
        : payload.documentId
          ? [payload.documentId]
          : [];
      const targetBox = boxes.find((box) => box.id === boxId);
      const existingIds = new Set((targetBox?.items || []).map((item) => item.documentId));
      const uniqueIds = [...new Set(sourceIds)].filter((documentId) => !existingIds.has(documentId));
      for (const documentId of uniqueIds) {
        const document = documentMap.get(documentId);
        if (document) await onAddDocument(boxId, document);
      }
    } catch {
      // Idegen drag payloadot figyelmen kívül hagyunk.
    }
  }

  return (
    <section className={`${styles.boxShelf} ${variant === "panel" ? styles.boxShelfPanel : ""} ${open ? "" : styles.boxShelfCollapsed}`} aria-label={variant === "panel" ? "CsomagBOX panel" : "CsomagBOX polc"}>
      <header
        className={styles.boxShelfHeader}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={open ? "Kattints ide a CsomagBOX polc összecsukásához" : "Kattints ide a CsomagBOX polc megnyitásához"}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpenChange(!open);
        }}
      >
        <div className={styles.boxShelfTitle}>
          <strong>CsomagBOX polc</strong>
          <span>{databaseReady
            ? lifecycleFeatureReady
              ? `${boxes.length} BOX · ${lifecycleCounts.SENT} kiküldött · virtuális file/version hivatkozások`
              : `${boxes.length} aktív BOX · virtuális file/version hivatkozások`
            : "A Workspace SQL aktiválása után használható"}</span>
        </div>
        <div className={styles.boxShelfHeaderActions} onClick={(event) => event.stopPropagation()}>
          {open && canWrite && databaseReady && (
            <button type="button" className={styles.boxShelfNewButton} onClick={() => setComposerOpen((current) => !current)}>
              <Plus size={13} /> Új BOX
            </button>
          )}
          <button
            type="button"
            className={styles.boxShelfToggle}
            onClick={() => onOpenChange(!open)}
            title={open ? "Polc elrejtése" : "Polc megnyitása"}
            aria-label={open ? "CsomagBOX polc összecsukása" : "CsomagBOX polc megnyitása"}
          >
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </header>

      {open && composerOpen && (
        <div className={styles.boxComposer}>
          <div className={styles.boxComposerHeading}>
            <div><strong>Új CsomagBOX</strong><span>A BOX nem másolja a fájlt, csak a dokumentum/verzió hivatkozását tárolja.</span></div>
            <button type="button" onClick={() => setComposerOpen(false)} aria-label="Bezárás"><X size={14} /></button>
          </div>
          <div className={styles.boxComposerBody}>
            <label>
              <span>Név</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Pl. Kivitelezőnek – 08.14." autoFocus />
            </label>
            <label>
              <span>Cél</span>
              <select value={purpose} onChange={(event) => setPurpose(event.target.value as DriveBoxPurpose)}>
                {(Object.keys(purposeConfig) as DriveBoxPurpose[]).map((key) => <option key={key} value={key}>{purposeConfig[key].label}</option>)}
              </select>
            </label>
            <button type="button" className={styles.boxComposerCreate} onClick={() => void submitNewBox()} disabled={!name.trim() || busy}>Létrehozás</button>
          </div>
        </div>
      )}

      {open && (
        <div className={styles.boxShelfContent}>
          {lifecycleFeatureReady && (
            <nav className={styles.boxLifecycleFilters} aria-label="CsomagBOX állapotszűrő">
              <button type="button" className={lifecycleFilter === "ALL" ? styles.boxLifecycleFilterActive : ""} onClick={() => setLifecycleFilter("ALL")}>
                <span>Mind</span><b>{boxes.length}</b>
              </button>
              {lifecycleOrder.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={lifecycleFilter === status ? styles.boxLifecycleFilterActive : ""}
                  onClick={() => setLifecycleFilter(status)}
                >
                  <span>{lifecycleConfig[status].shortLabel}</span><b>{lifecycleCounts[status]}</b>
                </button>
              ))}
            </nav>
          )}

          <div className={styles.boxCards}>
          {visibleBoxes.map((box) => {
            const config = purposeConfig[box.purpose] || purposeConfig.GENERAL;
            const Icon = config.icon;
            const itemDocuments = box.items.map((item) => ({ item, document: documentMap.get(item.documentId) })).filter((entry) => entry.document);
            const totalBytes = itemDocuments.reduce((sum, entry) => sum + (entry.item.version?.sizeBytes || entry.document?.currentVersion?.sizeBytes || 0), 0);
            const selectedIncluded = Boolean(selectedDocument && box.items.some((item) => item.documentId === selectedDocument.id));
            const expanded = expandedBoxId === box.id;
            return (
              <article
                key={box.id}
                className={`${styles.boxCard} ${colorClass(box.colorToken)} ${selectedIncluded ? styles.boxCardContainsSelected : ""}`}
                onDragOver={(event) => { if (canWrite && databaseReady) event.preventDefault(); }}
                onDrop={(event) => void handleDrop(event, box.id)}
              >
                <div className={styles.boxCardTop}>
                  <span className={styles.boxCardIcon}><Icon size={15} /></span>
                  <div><strong>{box.name}</strong><span>{config.label}</span></div>
                  <span className={styles.boxCardCount}>{box.items.length}</span>
                  {box.lifecycleFeatureReady && (
                    <span className={`${styles.boxLifecycleBadge} ${styles[`boxLifecycle${box.lifecycleStatus}`] || ""}`}>
                      {lifecycleConfig[box.lifecycleStatus].label}
                    </span>
                  )}
                </div>
                <div className={styles.boxCardStats}>
                  <span>{box.items.length} fájl · {formatBytes(totalBytes)}</span>
                  <span className={styles.boxCardStatsActions}>
                    {selectedDocument && canWrite && databaseReady && !selectedIncluded && (
                      <button
                        type="button"
                        className={styles.boxCardMiniAction}
                        onClick={() => void onAddDocument(box.id, selectedDocument)}
                        disabled={busy}
                        title="Kijelölt fájl hozzáadása"
                        aria-label="Kijelölt fájl hozzáadása"
                      >
                        <Plus size={10} />
                      </button>
                    )}
                    {selectedIncluded && <span className={styles.boxIncludedBadge} title="A kijelölt fájl már benne van a CsomagBOX-ban">✓</span>}
                  </span>
                </div>
                <div className={styles.boxCardActions} aria-label={box.name + " műveletei"}>
                  <button
                    type="button"
                    className={styles.boxCardActionIcon}
                    onClick={() => setExpandedBoxId(expanded ? "" : box.id)}
                    title={expanded ? "CsomagBOX bezárása" : "CsomagBOX megnyitása"}
                    aria-label={expanded ? "CsomagBOX bezárása" : "CsomagBOX megnyitása"}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button
                    type="button"
                    className={styles.boxCardActionIcon}
                    onClick={() => setHistoryBoxId(historyBoxId === box.id ? "" : box.id)}
                    title="Előzmények"
                    aria-label="Előzmények"
                  >
                    <History size={13} />
                  </button>
                  <span
                    className={styles.boxLifecycleActionWrap}
                    title={"Állapot: " + lifecycleConfig[box.lifecycleStatus].label}
                    data-disabled={!box.lifecycleFeatureReady || !canWrite || !onSetLifecycle || busy ? "true" : "false"}
                  >
                    <PackageCheck size={13} className={styles.boxLifecycleActionIconGlyph} />
                    <select
                      className={styles.boxLifecycleCompactSelect}
                      value={box.lifecycleStatus}
                      onChange={(event) => void onSetLifecycle?.(box.id, event.target.value as DriveBoxLifecycleStatus)}
                      disabled={!box.lifecycleFeatureReady || !canWrite || !onSetLifecycle || busy}
                      aria-label={"Állapot: " + lifecycleConfig[box.lifecycleStatus].label}
                    >
                      {lifecycleTargets(box.lifecycleStatus).map((status) => (
                        <option key={status} value={status}>{lifecycleConfig[status].label}</option>
                      ))}
                    </select>
                  </span>
                  <button
                    type="button"
                    className={styles.boxCardActionIcon}
                    disabled={!box.folderFeatureReady || !canWrite || !onCreateFolder || busy}
                    onClick={() => void promptNewFolder(box.id)}
                    title="Új mappa a CsomagBOX-ban"
                    aria-label="Új mappa a CsomagBOX-ban"
                  >
                    <FolderPlus size={13} />
                  </button>
                  <button
                    type="button"
                    className={styles.boxCardActionIcon}
                    disabled={!box.items.length || !canWrite || !onDownloadBox}
                    onClick={() => promptDownloadBox(box)}
                    title="CsomagBOX letöltése ZIP fájlként"
                    aria-label="CsomagBOX letöltése ZIP fájlként"
                  >
                    <Download size={13} />
                  </button>
                  <button
                    type="button"
                    className={styles.boxCardActionIcon}
                    disabled={box.purpose !== "COMPARE" || box.items.length < 2}
                    onClick={() => onOpenCompareBox(box)}
                    title="Összevetés"
                    aria-label="Összevetés"
                  >
                    <GitCompareArrows size={13} />
                  </button>
                </div>
                {historyBoxId === box.id && (
                  <BoxHistoryPanel projectId={projectId} boxId={box.id} onClose={() => setHistoryBoxId("")} />
                )}
                {expanded && (
                  <div className={styles.boxItemList}>
                    {!itemDocuments.length && <span className={styles.boxItemEmpty}>Húzz ide fájlt, vagy jelölj ki egyet a listában.</span>}
                    {box.folderFeatureReady && box.folders.length > 0 && (
                      <div className={styles.boxFolderTree} aria-label="CsomagBOX mappák">
                        {orderedBoxFolders(box.folders).map(({ folder, depth }) => (
                          <div key={folder.id} className={styles.boxFolderRow} style={{ paddingLeft: `${6 + depth * 14}px` }}>
                            <Folder size={12} />
                            <strong title={folder.name}>{folder.name}</strong>
                            {canWrite && onCreateFolder && (
                              <button type="button" onClick={() => void promptNewFolder(box.id, folder.id)} disabled={busy} title="Almappa létrehozása">
                                <FolderPlus size={10} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {itemDocuments.map(({ item, document }) => {
                      const versionLabel = item.version?.revisionCode || (item.version ? `V${item.version.versionNumber}` : document?.currentVersion?.revisionCode || "Aktuális");
                      return (
                        <div key={item.id} className={styles.boxItemRow} title={[boxDisplayName(document!, metadataByDocument[document!.id]), document?.name || "", versionLabel].join(" · ")}>
                          <FileText size={11} />
                          <span className={styles.boxItemNames}>
                            <strong title={boxDisplayName(document!, metadataByDocument[document!.id])}>{boxDisplayName(document!, metadataByDocument[document!.id])}</strong>
                            <small title={document?.name}>{document?.name}</small>
                          </span>
                          <small className={styles.boxItemRevision}>{versionLabel}</small>
                          {canWrite && <button type="button" onClick={() => void onRemoveItem(box.id, item.id)} disabled={busy} title="Eltávolítás a BOX-ból"><Trash2 size={10} /></button>}
                          {box.folderFeatureReady && onMoveItem && (
                            <select
                              className={styles.boxItemFolderSelect}
                              value={item.folderId || ""}
                              onChange={(event) => void onMoveItem(box.id, item.id, event.target.value || null)}
                              disabled={!canWrite || busy}
                              title="Célmappa a CsomagBOX-on belül"
                              aria-label={`${document?.name || "Fájl"} célmappája`}
                            >
                              <option value="">BOX gyökér</option>
                              {orderedBoxFolders(box.folders).map(({ folder, depth }) => (
                                <option key={folder.id} value={folder.id}>{`${"— ".repeat(depth)}${folder.name}`}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}

          {boxes.length > 0 && !visibleBoxes.length && lifecycleFeatureReady && (
            <div className={styles.boxDisabledInfo}>
              <PackageCheck size={20} /><strong>Nincs csomag ebben az állapotban</strong><span>Válassz másik CsomagBOX állapotszűrőt.</span>
            </div>
          )}

          {!boxes.length && databaseReady && (
            <button type="button" className={styles.boxEmptyCreate} onClick={() => setComposerOpen(true)}>
              <Plus size={22} /><strong>Első CsomagBOX létrehozása</strong><span>DROP, összehasonlítás, AI vizsgálat vagy kiadás előkészítéséhez.</span>
            </button>
          )}

          {!databaseReady && (
            <div className={styles.boxDisabledInfo}>
              <PackageCheck size={20} /><strong>CsomagBOX motor előkészítve</strong><span>A DRIVE Workspace bootstrap SQL alkalmazása után a létrehozás és a drag & drop automatikusan aktiválódik.</span>
            </div>
          )}

          {boxes.length > 0 && canWrite && databaseReady && (
            <button type="button" className={styles.boxAdd} onClick={() => setComposerOpen(true)}>
              <Plus size={22} /><span>Új CsomagBOX</span>
            </button>
          )}
          </div>
        </div>
      )}
    </section>
  );
}
