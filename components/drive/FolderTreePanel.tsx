"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, HardDrive, Pin } from "lucide-react";
import type { DriveFolder } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  folders: DriveFolder[];
  selectedFolderId: string;
  documentCounts: Map<string, number>;
  totalDocumentCount: number;
  onSelectFolder: (folderId: string) => void;
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
      return { className: styles.folderSecurityPassword, title: "Jelszóval védett mappa" };
    case "CUSTOM":
      return { className: styles.folderSecurityCustom, title: "Egyedi felhasználói mappajogosultság" };
    case "RESTRICTED":
      return { className: styles.folderSecurityRestricted, title: "Korlátozott mappajogosultság" };
    default:
      return { className: styles.folderSecurityNormal, title: "Normál mappa – projektjogosultság öröklése" };
  }
}

export default function FolderTreePanel({
  folders,
  selectedFolderId,
  documentCounts,
  totalDocumentCount,
  onSelectFolder,
  responsiveClassName = "",
}: Props) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
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
          >
            <HardDrive size={14} />
            <span className={styles.folderTreeLabel}>Dokumentumtár</span>
            <span className={styles.folderCount}>{totalDocumentCount}</span>
          </button>
        </div>

        {visibleRows.map(({ folder, depth, hasChildren }) => {
          const expanded = expandedFolderIds.has(folder.id);
          const security = folderSecurityVisual(folder);
          return (
            <div
              key={folder.id}
              className={styles.folderTreeItem}
              style={{ paddingLeft: depth * 15 }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className={styles.folderTreeToggle}
                  aria-label={(expanded ? "Mappa összecsukása: " : "Mappa kibontása: ") + (folder.displayName || folder.name)}
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFolder(folder.id);
                  }}
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className={styles.folderTreeTogglePlaceholder} aria-hidden="true" />
              )}

              <button
                type="button"
                className={styles.folderTreeSelect + (selectedFolderId === folder.id ? " " + styles.folderActive : "")}
                onClick={() => onSelectFolder(folder.id)}
                title={(folder.displayPath || folder.path) + " · " + security.title}
              >
                <span className={styles.folderTreeSecurityIcon + " " + security.className}><Folder size={13} /></span>
                <span className={styles.folderTreeLabel}>{folder.displayName || folder.name}</span>
                <span className={styles.folderCount}>{documentCounts.get(folder.id) || 0}</span>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
