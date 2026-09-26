"use client";

import {
  BrainCircuit,
  FolderPlus,
  GitCompareArrows,
  PackageCheck,
  Search,
  Share2,
  UploadCloud,
} from "lucide-react";
import DropActionButton from "./DropActionButton";
import ViewLayoutSwitcher from "./ViewLayoutSwitcher";
import type { DriveLayoutMode } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  layoutMode: DriveLayoutMode;
  onLayoutModeChange: (value: DriveLayoutMode) => void;
  canWrite: boolean;
  onCreateFolder: () => void;
  onUpload: () => void;
  boxCount: number;
  boxShelfOpen: boolean;
  boxReady: boolean;
  onToggleBoxShelf: () => void;
  compareActive: boolean;
  onToggleCompare: () => void;
};

export default function DriveToolbar({
  query,
  onQueryChange,
  layoutMode,
  onLayoutModeChange,
  canWrite,
  onCreateFolder,
  onUpload,
  boxCount,
  boxShelfOpen,
  boxReady,
  onToggleBoxShelf,
  compareActive,
  onToggleCompare,
}: Props) {
  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        className={`${styles.toolButton} ${styles.toolPrimary}`}
        onClick={onCreateFolder}
        disabled={!canWrite}
        title={canWrite ? "Új mappa létrehozása" : "Nincs írási jogosultságod"}
      >
        <FolderPlus size={14} /> <span>Új mappa</span>
      </button>
      <button
        type="button"
        className={styles.toolButton}
        onClick={onUpload}
        disabled={!canWrite}
        title={canWrite ? "Fájl feltöltése" : "Nincs írási jogosultságod"}
      >
        <UploadCloud size={14} /> <span>Feltöltés</span>
      </button>
      <button
        type="button"
        className={`${styles.toolButton} ${boxShelfOpen ? styles.toolActive : ""}`}
        onClick={onToggleBoxShelf}
        title={boxReady ? "CsomagBOX polc megnyitása / elrejtése" : "A CsomagBOX felület megnyitható; az adatmotor a Workspace SQL után aktiválódik"}
      >
        <PackageCheck size={14} /> <span>CsomagBOX</span>{boxCount > 0 && <small className={styles.toolCountBadge}>{boxCount}</small>}
      </button>
      <DropActionButton />
      <button
        type="button"
        className={`${styles.toolButton} ${styles.toolIconOnly} ${compareActive ? styles.toolActive : ""}`}
        onClick={onToggleCompare}
        title={compareActive ? "Összehasonlítás bezárása" : "Összehasonlítás"}
        aria-label={compareActive ? "Összehasonlítás bezárása" : "Összehasonlítás"}
      >
        <GitCompareArrows size={16} />
      </button>
      <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${styles.toolPurple} ${styles.toolDisabled}`} disabled title="AI Dokumentumvizsgáló – az 5. napi fejlesztésben aktiválódik" aria-label="AI Dokumentumvizsgáló">
        <BrainCircuit size={16} />
      </button>
      <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${styles.toolDisabled}`} disabled title="Kiadás – workflow előkészítve" aria-label="Kiadás">
        <PackageCheck size={16} />
      </button>
      <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${styles.toolDisabled}`} disabled title="Megosztás – workflow előkészítve" aria-label="Megosztás">
        <Share2 size={16} />
      </button>

      <div className={styles.toolbarSpacer} />
      <label className={styles.searchBox}>
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Keresés a mappában és fájlokban…"
          aria-label="Drive keresés"
        />
      </label>
      <ViewLayoutSwitcher value={layoutMode} onChange={onLayoutModeChange} />
    </div>
  );
}
