"use client";

import { Clock3, FileClock, FolderOpen, ArrowRight } from "lucide-react";
import type { DriveDocument } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  name: string;
  documents: DriveDocument[];
  onSelect: (document: DriveDocument) => void;
  onShowAll: () => void;
  scopeLabel: string;
};

import {recentUploadTimestamp,sortedRecentUploads} from "@/app/lib/drive-core/recentUploadCore";

export default function DriveRecentHome({name,documents,onSelect,onShowAll,scopeLabel}:Props) {
  const recent=sortedRecentUploads(documents).slice(0,10);
  return <section className={styles.driveHome} aria-label="DIMPRO Drive kezdőlap">
    <header className={styles.driveHomeHeader}>
      <div><small>{scopeLabel}</small><h2>{name}</h2><p>Legutóbb feltöltött fájlok és új verziók a hozzáférhető dokumentumtárban.</p></div>
      <button type="button" onClick={onShowAll}><Clock3 size={15}/> Teljes Legutóbbiak lista <ArrowRight size={14}/></button>
    </header>
    <div className={styles.driveHomeSectionHead}><FileClock size={17}/><strong>Legutóbbi feltöltések</strong><span>{recent.length} legfrissebb fájl</span></div>
    {recent.length ? <div className={styles.driveHomeRows}>
      {recent.map((doc)=><button type="button" key={doc.id} onClick={()=>onSelect(doc)}
        title={`Megnyitás a dokumentumtárban: ${doc.name}`}>
        <FolderOpen size={16}/>
        <span className={styles.driveHomeFileName}>{doc.name}</span>
        <small>{doc.currentVersion?.versionKind==="REVISION" ? "Új revízió" : doc.currentVersion?.versionKind==="VERSION" ? "Új verzió" : "Új feltöltés"}</small>
        <time dateTime={doc.currentVersion?.createdAt || doc.updatedAt}>{recentUploadTimestamp(doc) ? new Date(recentUploadTimestamp(doc)).toLocaleString("hu-HU") : "Időpont ismeretlen"}</time>
        <ArrowRight size={14}/>
      </button>)}
    </div> : <p className={styles.driveHomeEmpty}>Még nincs feltöltött dokumentum ebben a munkatérben.</p>}
    <p className={styles.driveHomeHint}>A legutóbbi feltöltés időpontja különbözik a dokumentumadatok utolsó szerkesztésétől. A lista kizárólag a jogosultnak visszaadott fájlokat mutatja.</p>
  </section>;
}
