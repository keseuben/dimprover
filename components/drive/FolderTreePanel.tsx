"use client";

import { Folder, HardDrive, Pin } from "lucide-react";
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

export default function FolderTreePanel({
  folders,
  selectedFolderId,
  documentCounts,
  totalDocumentCount,
  onSelectFolder,
  responsiveClassName = "",
}: Props) {
  return (
    <aside className={`${styles.panel} ${responsiveClassName}`}>
      <header className={styles.panelHeader}>
        <strong>Mappák</strong>
        <button type="button" className={styles.panelHeaderButton} title="Mappapanel rögzítése">
          <Pin size={13} />
        </button>
      </header>
      <div className={styles.folderTree}>
        <button
          type="button"
          className={`${styles.folderRow} ${selectedFolderId === "all" ? styles.folderActive : ""}`}
          onClick={() => onSelectFolder("all")}
        >
          <HardDrive size={14} />
          <span>Dokumentumtár</span>
          <span className={styles.folderCount}>{totalDocumentCount}</span>
        </button>
        {folders.map((folder) => {
          const depth = Math.max(0, folder.path.split("/").filter(Boolean).length - 1);
          return (
            <button
              key={folder.id}
              type="button"
              className={`${styles.folderRow} ${selectedFolderId === folder.id ? styles.folderActive : ""}`}
              style={{ paddingLeft: 10 + depth * 15 }}
              onClick={() => onSelectFolder(folder.id)}
              title={folder.path}
            >
              <Folder size={13} />
              <span>{folder.name}</span>
              <span className={styles.folderCount}>{documentCounts.get(folder.id) || 0}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
