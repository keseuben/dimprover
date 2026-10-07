"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  Download,
  ExternalLink,
  FolderDown,
  FolderPlus,
  GitCompareArrows,
  List,
  MonitorUp,
  PackageCheck,
  Search,
  Send,
  Share2,
  UploadCloud,
} from "lucide-react";
import DropActionButton from "./DropActionButton";
import TableZoomControls from "./TableZoomControls";
import ViewLayoutSwitcher from "./ViewLayoutSwitcher";
import type { DriveLayoutMode } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  layoutMode: DriveLayoutMode;
  onLayoutModeChange: (value: DriveLayoutMode) => void;
  tableFullscreen?: boolean;
  onToggleTableFullscreen?: () => void;
  tableZoom?: number;
  onTableZoomChange?: (value: number) => void;
  canWrite: boolean;
  canUpload?: boolean;
  boxEnabled?: boolean;
  compareEnabled?: boolean;
  onCreateFolder: () => void;
  onUpload: () => void;
  canUploadSelectedVersion: boolean;
  onUploadSelectedVersion: () => void;
  canUploadSelectedRevision: boolean;
  onUploadSelectedRevision: () => void;
  canOpenSelected: boolean;
  canOpenWindowsSelected?: boolean;
  canDownloadSelected: boolean;
  canDownloadFolder: boolean;
  onOpenSelected: () => void;
  onOpenWindowsSelected?: () => void;
  onDownloadSelected: () => void;
  onDownloadFolder: () => void;
  boxCount: number;
  boxShelfOpen: boolean;
  boxReady: boolean;
  onToggleBoxShelf: () => void;
  compareActive: boolean;
  onToggleCompare: () => void;
  canIssueSelected: boolean;
  onIssueSelected: () => void;
};

export default function DriveToolbar({
  query,
  onQueryChange,
  layoutMode,
  onLayoutModeChange,
  tableFullscreen = false,
  onToggleTableFullscreen,
  tableZoom = 90,
  onTableZoomChange,
  canWrite,
  canUpload = canWrite,
  boxEnabled = true,
  compareEnabled = true,
  onCreateFolder,
  onUpload,
  canUploadSelectedVersion,
  onUploadSelectedVersion,
  canUploadSelectedRevision,
  onUploadSelectedRevision,
  canOpenSelected,
  canOpenWindowsSelected = false,
  canDownloadSelected,
  canDownloadFolder,
  onOpenSelected,
  onOpenWindowsSelected,
  onDownloadSelected,
  onDownloadFolder,
  boxCount,
  boxShelfOpen,
  boxReady,
  onToggleBoxShelf,
  compareActive,
  onToggleCompare,
  canIssueSelected,
  onIssueSelected,
}: Props) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionMenuOpen) return;
    const closeOnPointer = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionMenuOpen]);

  const runMenuAction = (action: () => void) => {
    setActionMenuOpen(false);
    action();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarActionMenuWrap} ref={actionMenuRef}>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.toolIconOnly} ${styles.toolbarMenuButton}`}
          onClick={() => setActionMenuOpen((current) => !current)}
          title="Műveletek"
          aria-label="Műveletek"
          aria-haspopup="menu"
          aria-expanded={actionMenuOpen}
        >
          <List size={16} />
          <ChevronDown size={10} className={styles.toolbarMenuChevron} />
        </button>

        {actionMenuOpen && (
          <div className={styles.toolbarActionMenu} role="menu" aria-label="Drive műveletek">
            <button type="button" role="menuitem" disabled={!canWrite} onClick={() => runMenuAction(onCreateFolder)}>
              <FolderPlus size={15} /><span>Új mappa</span>
            </button>
            <button type="button" role="menuitem" disabled={!canUpload} onClick={() => runMenuAction(onUpload)}>
              <UploadCloud size={15} /><span>Feltöltés</span>
            </button>
            <button type="button" role="menuitem" disabled={!canUploadSelectedVersion} onClick={() => runMenuAction(onUploadSelectedVersion)}>
              <UploadCloud size={15} /><span>Új verzió</span>
            </button>
            <button type="button" role="menuitem" disabled={!canUploadSelectedRevision} onClick={() => runMenuAction(onUploadSelectedRevision)}>
              <PackageCheck size={15} /><span>Új revízió</span>
            </button>
            <div className={styles.toolbarMenuSeparator} />
            <button type="button" role="menuitem" disabled={!canOpenSelected} onClick={() => runMenuAction(onOpenSelected)}>
              <ExternalLink size={15} /><span>Megnyitás</span>
            </button>
            {onOpenWindowsSelected && (
              <button type="button" role="menuitem" disabled={!canOpenWindowsSelected} onClick={() => runMenuAction(onOpenWindowsSelected)}>
                <MonitorUp size={15} /><span>Megnyitás Windowsban</span>
              </button>
            )}
            <button type="button" role="menuitem" disabled={!canDownloadSelected} onClick={() => runMenuAction(onDownloadSelected)}>
              <Download size={15} /><span>Letöltés</span>
            </button>
            <button type="button" role="menuitem" disabled={!canDownloadFolder} onClick={() => runMenuAction(onDownloadFolder)}>
              <FolderDown size={15} /><span>Mappa ZIP</span>
            </button>
            <div className={styles.toolbarMenuSeparator} />
            <button type="button" role="menuitem" disabled={!boxEnabled} onClick={() => runMenuAction(onToggleBoxShelf)}>
              <PackageCheck size={15} /><span>CsomagBOX{boxCount > 0 ? ` (${boxCount})` : ""}</span>
            </button>
            <button type="button" role="menuitem" onClick={() => runMenuAction(() => window.open("https://drop.dimpro.hu", "_blank", "noopener,noreferrer"))}>
              <Send size={15} /><span>DROP küldés</span>
            </button>
            <button type="button" role="menuitem" disabled={!compareEnabled} onClick={() => runMenuAction(onToggleCompare)}>
              <GitCompareArrows size={15} /><span>{compareActive ? "Összehasonlítás bezárása" : "Összehasonlítás"}</span>
            </button>
            <button type="button" role="menuitem" disabled>
              <BrainCircuit size={15} /><span>AI Dokumentumvizsgáló</span>
            </button>
            <button type="button" role="menuitem" disabled={!canIssueSelected} onClick={() => runMenuAction(onIssueSelected)}>
              <PackageCheck size={15} /><span>Formális dokumentumkiadás</span>
            </button>
            <button type="button" role="menuitem" disabled>
              <Share2 size={15} /><span>Megosztás</span>
            </button>
          </div>
        )}
      </div>

      <div className={`${styles.toolbarActionCluster} ${styles.toolbarActionClusterMisc}`} data-toolbar-group="misc" title="Mappa és egyéb műveletek">
        <button type="button" className={`${styles.toolButton} ${styles.toolPrimary} ${styles.toolIconOnly}`} onClick={onCreateFolder} disabled={!canWrite} title={canWrite ? "Új mappa" : "Új mappa – nincs írási jogosultságod"} aria-label="Új mappa"><FolderPlus size={16} /></button>
      </div>

      <div className={`${styles.toolbarActionCluster} ${styles.toolbarActionClusterUpload}`} data-toolbar-group="upload" title="Feltöltés · Új verzió · Új revízió">
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onUpload} disabled={!canUpload} title={canUpload ? "Feltöltés" : "Feltöltés – ebben a munkatérben még nem aktív"} aria-label="Feltöltés"><UploadCloud size={16} /></button>
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onUploadSelectedVersion} disabled={!canUploadSelectedVersion} title={canUploadSelectedVersion ? "Új verzió" : "Új verzió – jelölj ki egy írható dokumentumot"} aria-label="Új verzió"><UploadCloud size={16} /></button>
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onUploadSelectedRevision} disabled={!canUploadSelectedRevision} title={canUploadSelectedRevision ? "Új revízió" : "Új revízió – jelölj ki egy írható dokumentumot"} aria-label="Új revízió"><PackageCheck size={16} /></button>
      </div>

      <div className={`${styles.toolbarActionCluster} ${styles.toolbarActionClusterOpen}`} data-toolbar-group="open" title="Megnyitás · Windows · Letöltés">
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onOpenSelected} disabled={!canOpenSelected} title={canOpenSelected ? "Megnyitás" : "Megnyitás – jelölj ki egy megnyitható fájlt"} aria-label="Megnyitás"><ExternalLink size={16} /></button>
        {onOpenWindowsSelected && <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onOpenWindowsSelected} disabled={!canOpenWindowsSelected} title={canOpenWindowsSelected ? "Megnyitás Windowsban" : "Megnyitás Windowsban – jelölj ki egy megnyitható fájlt"} aria-label="Megnyitás Windowsban"><MonitorUp size={16} /></button>}
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onDownloadSelected} disabled={!canDownloadSelected} title={canDownloadSelected ? "Letöltés" : "Letöltés – jelölj ki egy letölthető fájlt"} aria-label="Letöltés"><Download size={16} /></button>
      </div>

      <div className={`${styles.toolbarActionCluster} ${styles.toolbarActionClusterPackage}`} data-toolbar-group="package" title="Mappa ZIP · CsomagBOX · Drop">
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly}`} onClick={onDownloadFolder} disabled={!canDownloadFolder} title={canDownloadFolder ? "Mappa ZIP" : "Mappa ZIP – válassz ki egy mappát"} aria-label="Mappa ZIP"><FolderDown size={16} /></button>
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${boxShelfOpen ? styles.toolActive : ""}`} onClick={onToggleBoxShelf} disabled={!boxEnabled} title={!boxEnabled ? "CsomagBOX – a személyes backend bekötése folyamatban" : boxReady ? "CsomagBOX" : "CsomagBOX – az adatmotor még nem aktív"} aria-label="CsomagBOX"><PackageCheck size={16} />{boxCount > 0 && <small className={styles.toolCountBadge}>{boxCount}</small>}</button>
        <DropActionButton iconOnly />
      </div>

      <div className={`${styles.toolbarActionCluster} ${styles.toolbarActionClusterOther}`} data-toolbar-group="other" title="További dokumentumműveletek">
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${compareActive ? styles.toolActive : ""}`} onClick={onToggleCompare} disabled={!compareEnabled} title={!compareEnabled ? "Összehasonlítás – a személyes backend bekötése folyamatban" : compareActive ? "Összehasonlítás bezárása" : "Összehasonlítás"} aria-label={compareActive ? "Összehasonlítás bezárása" : "Összehasonlítás"}><GitCompareArrows size={16} /></button>
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${styles.toolPurple} ${styles.toolDisabled}`} disabled title="AI Dokumentumvizsgáló" aria-label="AI Dokumentumvizsgáló"><BrainCircuit size={16} /></button>
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${canIssueSelected ? "" : styles.toolDisabled}`} disabled={!canIssueSelected} onClick={onIssueSelected} title={canIssueSelected ? "Formális dokumentumkiadás" : "Formális dokumentumkiadás – jelölj ki egy kiadható dokumentumverziót"} aria-label="Formális dokumentumkiadás"><PackageCheck size={16} /></button>
        <button type="button" className={`${styles.toolButton} ${styles.toolIconOnly} ${styles.toolDisabled}`} disabled title="Megosztás" aria-label="Megosztás"><Share2 size={16} /></button>
      </div>
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
      {onTableZoomChange && <TableZoomControls zoom={tableZoom} onZoomChange={onTableZoomChange} compact />}
      <ViewLayoutSwitcher value={layoutMode} onChange={onLayoutModeChange} tableFullscreen={tableFullscreen} onToggleTableFullscreen={onToggleTableFullscreen} />
    </div>
  );
}
