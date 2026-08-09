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
};

export default function DriveToolbar({
  query,
  onQueryChange,
  layoutMode,
  onLayoutModeChange,
  canWrite,
  onCreateFolder,
  onUpload,
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
      <button type="button" className={`${styles.toolButton} ${styles.toolDisabled}`} disabled title="A CsomagBOX motor a 3. napi fejlesztésben aktiválódik">
        <PackageCheck size={14} /> <span>CsomagBOX</span>
      </button>
      <DropActionButton />
      <button type="button" className={`${styles.toolButton} ${styles.toolDisabled}`} disabled title="Az összehasonlító motor a 4. napi fejlesztésben aktiválódik">
        <GitCompareArrows size={14} /> <span>Összehasonlítás</span>
      </button>
      <button type="button" className={`${styles.toolButton} ${styles.toolPurple} ${styles.toolDisabled}`} disabled title="Az AI Dokumentumvizsgáló az 5. napi fejlesztésben aktiválódik">
        <BrainCircuit size={14} /> <span>AI Dokumentumvizsgáló</span>
      </button>
      <button type="button" className={`${styles.toolButton} ${styles.toolDisabled}`} disabled title="Kiadási workflow előkészítve">
        <PackageCheck size={14} /> <span>Kiadás</span>
      </button>
      <button type="button" className={`${styles.toolButton} ${styles.toolDisabled}`} disabled title="Megosztási workflow előkészítve">
        <Share2 size={14} /> <span>Megosztás</span>
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
