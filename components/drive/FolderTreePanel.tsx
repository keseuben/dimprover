"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { ChevronDown, ChevronRight, EllipsisVertical, Folder, HardDrive, Link2, Pin, Plus, Trash2 } from "lucide-react";
import type { DriveFolder } from "./driveTypes";
import OverflowTooltipText from "./OverflowTooltipText";
import styles from "./DriveWorkspace.module.css";

export type DriveLinkedProjectItem = {
  id: string;
  code: string;
  name: string;
  status?: string;
  access?: string;
};

type Props = {
  folders: DriveFolder[];
  selectedFolderId: string;
  documentCounts: Map<string, number>;
  totalDocumentCount: number;
  onSelectFolder: (folderId: string) => void;
  linkedProjects?: DriveLinkedProjectItem[];
  onOpenLinkedProject?: (project: DriveLinkedProjectItem) => void;
  onManageLinkedProjects?: () => void;
  canDeleteFolder?: boolean;
  busy?: boolean;
  onDeleteFolder?: (folder: DriveFolder) => void;
  onMoveDocumentsToFolder?: (documentIds: string[], targetFolderId: string) => Promise<void> | void;
  onMoveFolderToFolder?: (folderId: string, targetFolderId: string) => Promise<void> | void;
  responsiveClassName?: string;
};

type VisibleFolderRow = {
  folder: DriveFolder;
  depth: number;
  hasChildren: boolean;
};

function folderSecurityVisual(folder: DriveFolder) {
  switch (folder.securityState) {
    case "PASSWORD":
      return {
        className: styles.folderSecurityPassword,
        rowClassName: styles.folderSecurityRowPassword,
        title: folder.passwordUnlocked
          ? "Jelszóval védett mappa · feloldva ebben a munkamenetben"
          : "Jelszóval védett mappa · feloldás szükséges",
      };
    case "CUSTOM":
      return { className: styles.folderSecurityCustom, rowClassName: styles.folderSecurityRowCustom, title: "Egyedi felhasználói mappajogosultság" };
    case "RESTRICTED":
      return { className: styles.folderSecurityRestricted, rowClassName: styles.folderSecurityRowRestricted, title: "Korlátozott mappajogosultság" };
    default:
      return { className: styles.folderSecurityNormal, rowClassName: "", title: "Normál mappa – projektjogosultság öröklése" };
  }
}

export default function FolderTreePanel({
  folders,
  selectedFolderId,
  documentCounts,
  totalDocumentCount,
  onSelectFolder,
  linkedProjects = [],
  onOpenLinkedProject,
  onManageLinkedProjects,
  canDeleteFolder = false,
  busy = false,
  onDeleteFolder,
  onMoveDocumentsToFolder,
  onMoveFolderToFolder,
  responsiveClassName = "",
}: Props) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [actionMenuFolderId, setActionMenuFolderId] = useState("");
  const knownBranchIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const hierarchy = useMemo(() => {
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const childrenByParent = new Map<string | null, DriveFolder[]>();

    for (const folder of folders) {
      const parentKey = folder.parentId && folderById.has(folder.parentId) ? folder.parentId : null;
      const siblings = childrenByParent.get(parentKey) || [];
      siblings.push(folder);
      childrenByParent.set(parentKey, siblings);
    }

    const branchIds = new Set<string>();
    for (const [parentId, children] of childrenByParent) {
      if (parentId && children.length) branchIds.add(parentId);
    }

    const structurallyReachable = new Set<string>();
    const markReachable = (folder: DriveFolder, path: Set<string>) => {
      if (path.has(folder.id) || structurallyReachable.has(folder.id)) return;
      structurallyReachable.add(folder.id);
      const nextPath = new Set(path);
      nextPath.add(folder.id);
      for (const child of childrenByParent.get(folder.id) || []) markReachable(child, nextPath);
    };

    const rootFolders = childrenByParent.get(null) || [];
    for (const folder of rootFolders) markReachable(folder, new Set());

    const cycleFallbackRoots = folders.filter((folder) => !structurallyReachable.has(folder.id));

    return { folderById, childrenByParent, branchIds, rootFolders, cycleFallbackRoots };
  }, [folders]);

  useEffect(() => {
    setExpandedFolderIds((current) => {
      const next = new Set(Array.from(current).filter((id) => hierarchy.branchIds.has(id)));

      if (!initializedRef.current && folders.length) {
        for (const id of hierarchy.branchIds) next.add(id);
        initializedRef.current = true;
      } else {
        for (const id of hierarchy.branchIds) {
          if (!knownBranchIdsRef.current.has(id)) next.add(id);
        }
      }

      knownBranchIdsRef.current = new Set(hierarchy.branchIds);
      return next;
    });
  }, [folders.length, hierarchy.branchIds]);

  useEffect(() => {
    if (!actionMenuFolderId) return;
    const close = () => setActionMenuFolderId("");
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", onKeyDown); };
  }, [actionMenuFolderId]);

  useEffect(() => {
    if (selectedFolderId === "all") return;
    const ancestors: string[] = [];
    const visited = new Set<string>();
    let current = hierarchy.folderById.get(selectedFolderId);

    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = hierarchy.folderById.get(current.parentId);
      if (!parent) break;
      ancestors.push(parent.id);
      current = parent;
    }

    if (!ancestors.length) return;
    setExpandedFolderIds((currentExpanded) => {
      const next = new Set(currentExpanded);
      for (const id of ancestors) next.add(id);
      return next;
    });
  }, [hierarchy.folderById, selectedFolderId]);

  const visibleRows = useMemo(() => {
    const rows: VisibleFolderRow[] = [];
    const rendered = new Set<string>();

    const visit = (folder: DriveFolder, depth: number, path: Set<string>) => {
      if (path.has(folder.id) || rendered.has(folder.id)) return;
      rendered.add(folder.id);

      const children = hierarchy.childrenByParent.get(folder.id) || [];
      rows.push({ folder, depth, hasChildren: children.length > 0 });

      if (!children.length || !expandedFolderIds.has(folder.id)) return;
      const nextPath = new Set(path);
      nextPath.add(folder.id);
      for (const child of children) visit(child, depth + 1, nextPath);
    };

    for (const folder of hierarchy.rootFolders) visit(folder, 0, new Set());
    for (const folder of hierarchy.cycleFallbackRoots) {
      if (!rendered.has(folder.id)) visit(folder, 0, new Set());
    }

    return rows;
  }, [expandedFolderIds, hierarchy]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const acceptsDriveDrop = (event: ReactDragEvent<HTMLElement>) =>
    event.dataTransfer.types.includes("application/x-dimpro-drive-document")
    || event.dataTransfer.types.includes("application/x-dimpro-drive-folder");

  const handleFolderDrop = (event: ReactDragEvent<HTMLElement>, targetFolderId: string) => {
    if (!acceptsDriveDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const folderRaw = event.dataTransfer.getData("application/x-dimpro-drive-folder");
    if (folderRaw && onMoveFolderToFolder) {
      try {
        const payload = JSON.parse(folderRaw) as { folderId?: string };
        if (payload.folderId && payload.folderId !== targetFolderId) void onMoveFolderToFolder(payload.folderId, targetFolderId);
      } catch { /* foreign payload */ }
      return;
    }
    const documentRaw = event.dataTransfer.getData("application/x-dimpro-drive-document");
    if (documentRaw && onMoveDocumentsToFolder) {
      try {
        const payload = JSON.parse(documentRaw) as { documentId?: string; documentIds?: string[] };
        const ids = Array.isArray(payload.documentIds) && payload.documentIds.length ? payload.documentIds : payload.documentId ? [payload.documentId] : [];
        if (ids.length) void onMoveDocumentsToFolder([...new Set(ids)], targetFolderId);
      } catch { /* foreign payload */ }
    }
  };

  return (
    <aside className={styles.panel + " " + responsiveClassName}>
      <header className={styles.panelHeader}>
        <strong>Mappák</strong>
        <button type="button" className={styles.panelHeaderButton} title="Mappapanel rögzítése">
          <Pin size={13} />
        </button>
      </header>

      <div className={styles.folderTree}>
        <div className={styles.folderTreeItem}>
          <span className={styles.folderTreeTogglePlaceholder} aria-hidden="true" />
          <button
            type="button"
            className={styles.folderTreeSelect + (selectedFolderId === "all" ? " " + styles.folderActive : "")}
            onClick={() => onSelectFolder("all")}
            onDragOver={(event) => { if (acceptsDriveDrop(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
            onDrop={(event) => handleFolderDrop(event, "all")}
          >
            <HardDrive size={14} />
            <OverflowTooltipText text="Dokumentumtár" className={styles.folderTreeLabel} />
            <span className={styles.folderCount}>{totalDocumentCount}</span>
          </button>
        </div>

        {visibleRows.map(({ folder, depth, hasChildren }) => {
          const expanded = expandedFolderIds.has(folder.id);
          const security = folderSecurityVisual(folder);
          return (
            <div
              key={folder.id}
              className={`${styles.folderTreeItem} ${security.rowClassName}`}
              style={{ paddingLeft: depth * 15 }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectFolder(folder.id);
                setActionMenuFolderId(folder.id);
              }}
            >
              {hasChildren ? (
                <button type="button" className={styles.folderTreeToggle} aria-label={(expanded ? "Mappa összecsukása: " : "Mappa kibontása: ") + (folder.displayName || folder.name)} aria-expanded={expanded} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleFolder(folder.id); }}>
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : <span className={styles.folderTreeTogglePlaceholder} aria-hidden="true" />}
              <button
                type="button"
                className={styles.folderTreeSelect + (selectedFolderId === folder.id ? " " + styles.folderActive : "")}
                onClick={() => onSelectFolder(folder.id)}
                onDragOver={(event) => { if (acceptsDriveDrop(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
                onDrop={(event) => handleFolderDrop(event, folder.id)}
                aria-label={(folder.displayPath || folder.path) + ". " + security.title}
              >
                <span
                  className={`${styles.folderTreeSecurityIcon} ${security.className} ${onMoveFolderToFolder ? styles.folderDragHandle : ""}`}
                  draggable={Boolean(onMoveFolderToFolder)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    if (!onMoveFolderToFolder) return;
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-dimpro-drive-folder", JSON.stringify({ folderId: folder.id }));
                    event.dataTransfer.setData("text/plain", folder.displayName || folder.name);
                  }}
                  title={`${security.title}${onMoveFolderToFolder ? " · Húzd másik mappába" : ""}`}
                ><Folder size={13} /></span>
                <OverflowTooltipText text={folder.displayName || folder.name} className={styles.folderTreeLabel} />
                <span className={styles.folderCount}>{documentCounts.get(folder.id) || 0}</span>
              </button>
              {selectedFolderId === folder.id ? (
                <button
                  type="button"
                  className={styles.folderTreeActionButton}
                  title="Mappaműveletek"
                  aria-label={`${folder.displayName || folder.name} mappaműveletek`}
                  aria-expanded={actionMenuFolderId === folder.id}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); setActionMenuFolderId((current) => current === folder.id ? "" : folder.id); }}
                >
                  <EllipsisVertical size={13} />
                </button>
              ) : null}
              {actionMenuFolderId === folder.id ? (
                <div className={styles.folderTreeActionMenu} onPointerDown={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.folderTreeActionDanger}
                    disabled={!canDeleteFolder || busy || !onDeleteFolder}
                    title={canDeleteFolder ? "Mappa Lomtárba helyezése" : "Nincs jogosultságod a mappa törléséhez"}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); setActionMenuFolderId(""); onDeleteFolder?.(folder); }}
                  >
                    <Trash2 size={13} />
                    Lomtárba helyezés
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {(onManageLinkedProjects || linkedProjects.length > 0) ? (
          <div className={styles.linkedProjectsSection}>
            <div className={styles.linkedProjectsHeader}>
              <span><Link2 size={12} /> Kapcsolt projektek</span>
              {onManageLinkedProjects ? <button type="button" onClick={onManageLinkedProjects} title="Kapcsolt projektek kezelése"><Plus size={12} /> Kezelés</button> : null}
            </div>
            {linkedProjects.length ? linkedProjects.map((project) => (
              <button key={project.id} type="button" className={styles.linkedProjectRow} onClick={() => onOpenLinkedProject?.(project)} title={`${project.name}${project.code ? ` · ${project.code}` : ""}`}>
                <Link2 size={13} />
                <span className={styles.linkedProjectText}><strong>{project.name}</strong>{project.code ? <small>{project.code}</small> : null}</span>
                <ChevronRight size={12} />
              </button>
            )) : <div className={styles.linkedProjectsEmpty}>Nincs csatolt projekt.</div>}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
