"use client";

import { useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronUp, CloudUpload, X, XCircle } from "lucide-react";
import {
  summarizeTransfers, transferEtaSeconds, transferPercent,
  TRANSFER_LABELS, type TransferTask,
} from "@/app/lib/transfer-core/transferModel";
import styles from "./DriveTransferCenter.module.css";

function sizeLabel(bytes: number) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GiB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MiB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KiB";
  return bytes + " B";
}
function durationLabel(seconds: number | null) {
  if (seconds === null) return "Becslés folyamatban";
  if (seconds >= 3600) return "kb. " + Math.ceil(seconds / 3600) + " óra";
  if (seconds >= 60) return "kb. " + Math.ceil(seconds / 60) + " perc";
  return "kb. " + Math.max(1, seconds) + " mp";
}

export default function DriveTransferCenter({
  tasks, open, minimized, onOpen, onMinimize, onClose, onCancel, onRetry, retryDisabled, onClearFinished,
}: {
  tasks: readonly TransferTask[];
  open: boolean;
  minimized: boolean;
  onOpen: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  retryDisabled: boolean;
  onClearFinished: () => void;
}) {
  const summary = useMemo(() => summarizeTransfers(tasks), [tasks]);
  const [showAll, setShowAll] = useState(false);
  if (!tasks.length) return null;
  if (!open) return (
    <button type="button" className={styles.launcher} onClick={onOpen}
      aria-label={"Átvitelek megnyitása. " + summary.active + " folyamatban, " + summary.failed + " hiba."}
      title="DIMPRO Transfer Center – átvitelek">
      <CloudUpload size={18} /> <strong>Átvitelek</strong>
      <span>{summary.active + summary.queued ? summary.active + summary.queued + " folyamatban" : summary.count + " fájl"}</span>
    </button>
  );
  return (
    <section className={[styles.panel, minimized ? styles.minimized : ""].join(" ")}
      aria-label="DIMPRO Transfer Center – fájlfeltöltések">
      <header className={styles.header}>
        <div className={styles.headerBrand}><span className={styles.brandIcon}><CloudUpload size={19}/></span>
          <div><strong>DIMPRO Transfer Center</strong><small>{summary.count} fájl · Projekt Drive feltöltések</small></div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" aria-label={minimized ? "Átvitelek kibontása" : "Átvitelek összecsukása"}
            title={minimized ? "Kibontás" : "Összecsukás"} onClick={onMinimize}>
            {minimized ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}
          </button>
          <button type="button" title="Panel elrejtése – a feltöltés folytatódik"
            aria-label="Panel elrejtése, a feltöltés folytatódik" onClick={onClose}><X size={17}/></button>
        </div>
      </header>
      {!minimized && <div className={styles.contents}>
        <div className={styles.stats}>
          <span><strong>{summary.active}</strong> feldolgozás</span>
          <span><strong>{summary.queued}</strong> várakozik</span>
          <span><strong>{summary.awaitingReview}</strong> ellenőrzött, jóváhagyásra vár</span>
          {summary.failed>0 && <span className={styles.bad}><strong>{summary.failed}</strong> hiba</span>}
        </div>
        <div className={styles.progressLabel}>
          <strong>Hálózati adatátvitel</strong><strong>{summary.percent}%</strong>
        </div>
        <div className={styles.track} role="progressbar" aria-label="Teljes hálózati adatátvitel"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percent}>
          <div className={styles.fill} style={{width: summary.percent+"%"}}/>
        </div>
        <div className={styles.meta}>
          <span>{sizeLabel(summary.uploadedBytes)} / {sizeLabel(summary.totalBytes)}</span>
          <span>{summary.speedBps>0 ? sizeLabel(summary.speedBps)+"/s · " : ""}
            {durationLabel(transferEtaSeconds(summary.totalBytes-summary.uploadedBytes,
              summary.speedBps>0?summary.speedBps:null))}
          </span>
        </div>
        <div className={styles.security}><Activity size={15}/>
          <span>Biztonsági ellenőrzés: {summary.scanning} várakozik vagy folyamatban.
            A feltöltés 100%-a még nem jelenti a fájl jóváhagyását.</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}><thead><tr>
            <th>Fájl és célmappa</th><th>Méret</th><th>Átvitel</th><th>Fázis</th><th>Művelet</th>
          </tr></thead><tbody>
            {(showAll ? tasks : tasks.slice(-60)).map(task=><tr key={task.id} data-phase={task.phase}>
              <td><strong title={task.fileName}>{task.fileName}</strong><small title={task.folderName}>{task.folderName}</small></td>
              <td className={styles.number}>{sizeLabel(task.sizeBytes)}</td>
              <td className={styles.percentCell}>
                <strong>{transferPercent(task.uploadedBytes,task.sizeBytes)}%</strong>
                <div className={styles.miniTrack}><div style={{width:transferPercent(task.uploadedBytes,task.sizeBytes)+"%"}}/></div>
                {task.phase==="UPLOADING" && task.speedBps && task.speedBps>0 &&
                  <small>{sizeLabel(task.speedBps)}/s</small>}
              </td>
              <td className={styles.phase}><span>{TRANSFER_LABELS[task.phase]}</span>
                {task.retryCount ? <small>{"Újraküldés: "+task.retryCount+". alkalom"}</small> : null}
                {task.error&&<small title={task.error}>{task.error}</small>}
              </td>
              <td className={styles.action}>{task.phase==="ERROR" && task.retryable!==false &&
                <button type="button" onClick={()=>onRetry(task.id)} disabled={retryDisabled}
                  title="Új feltöltési munkamenettel a teljes fájl újraküldése"
                  aria-label={task.fileName+" teljes fájl újrapróbálása"}>Újra</button>}
                {(["QUEUED","INITIALIZING","UPLOADING"] as string[]).includes(task.phase)&&
                <button type="button" onClick={()=>onCancel(task.id)} title="Feltöltés megszakítása"
                  aria-label={task.fileName+" feltöltésének megszakítása"}><XCircle size={16}/></button>}
              </td>
            </tr>)}
          </tbody></table>
        </div>
        <footer className={styles.footer}>
          <span>{summary.terminal}/{summary.count} átviteli feladat lezárva</span>
          <div>
            {tasks.length>60&&<button type="button" onClick={()=>setShowAll(value=>!value)}>
              {showAll ? "Utolsó 60" : "Mind a "+tasks.length+" fájl"}
            </button>}
            <button type="button" onClick={onClearFinished} disabled={summary.terminal===0}
              title="Csak a lezárt sorok eltüntetése, szerveroldali fájlokat nem töröl">Lezárt sorok törlése</button>
          </div>
        </footer>
      </div>}
      {minimized&&<div className={styles.minimizedSummary} role="status">
        Átvitel {summary.percent}% · {summary.active+summary.queued} folyamatban · {summary.failed} hiba
      </div>}
    </section>
  );
}
