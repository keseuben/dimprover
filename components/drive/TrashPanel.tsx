"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Archive, FileText, Folder, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

type TrashItem={
  id:string;
  type:"FOLDER"|"DOCUMENT";
  name:string;
  path:string;
  deletedAt:string;
  folderCount:number;
  documentCount:number;
  totalSizeBytes:number;
};

type Props={projectId:string;canRestore:boolean;canPurge:boolean;onChanged?:()=>void};
const PURGE_CONFIRMATION="VÉGLEGES TÖRLÉS";
function formatBytes(value:number){if(!Number.isFinite(value)||value<=0)return "0 B";if(value>=1024**3)return `${(value/1024**3).toFixed(1)} GB`;if(value>=1024**2)return `${(value/1024**2).toFixed(1)} MB`;if(value>=1024)return `${(value/1024).toFixed(0)} KB`;return `${value} B`;}
function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("hu-HU",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);}

export default function TrashPanel({projectId,canRestore,canPurge,onChanged}:Props){
  const [items,setItems]=useState<TrashItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [purgeTarget,setPurgeTarget]=useState<TrashItem|null>(null);
  const [confirmation,setConfirmation]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/trash`,{credentials:"same-origin",cache:"no-store"});
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string;items?:TrashItem[]};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"A Lomtár nem tölthető be.");
      setItems(payload.items||[]);
    }catch(caught){setError(caught instanceof Error?caught.message:"A Lomtár nem tölthető be.");}
    finally{setLoading(false);}
  },[projectId]);
  useEffect(()=>{void load()},[load]);

  async function restore(item:TrashItem){
    if(!canRestore||busyId)return;setBusyId(item.id);setError("");setNotice("");
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/trash/restore`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({type:item.type,id:item.id})});
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"A visszaállítás sikertelen.");
      setNotice(`${item.type==="FOLDER"?"Mappa":"Dokumentum"} visszaállítva: ${item.name}`);await load();onChanged?.();
    }catch(caught){setError(caught instanceof Error?caught.message:"A visszaállítás sikertelen.");}
    finally{setBusyId("");}
  }

  async function purge(){
    const item=purgeTarget;if(!item||!canPurge||busyId||confirmation!==PURGE_CONFIRMATION)return;
    setBusyId(item.id);setError("");setNotice("");
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/trash/purge`,{method:"DELETE",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({type:item.type,id:item.id,confirmation})});
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string;cleanup?:{pending?:boolean;failed?:number}};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"A végleges törlés sikertelen.");
      const pending=payload.cleanup?.pending||Number(payload.cleanup?.failed||0)>0;
      setNotice(`Végleges törlés kezdeményezve: ${item.name}.${pending?" A fizikai objektumtakarítás egy része függőben maradt.":""}`);
      setPurgeTarget(null);setConfirmation("");await load();onChanged?.();
    }catch(caught){setError(caught instanceof Error?caught.message:"A végleges törlés sikertelen.");}
    finally{setBusyId("");}
  }

  return <section className={styles.trashWorkspace} aria-label="Lomtár">
    <header className={styles.trashHeader}>
      <div><span><Archive size={17}/></span><div><strong>Lomtár</strong><small>A projektből eltávolított mappák és dokumentumok</small></div></div>
      <button type="button" onClick={()=>void load()} disabled={loading||Boolean(busyId)} title="Lomtár frissítése"><RefreshCw size={14}/>{loading?"Betöltés…":"Frissítés"}</button>
    </header>
    <div className={styles.trashWarning}><AlertTriangle size={15}/><div><strong>A Lomtárból még visszaállítható az elem.</strong><span>A „Végleges törlés” nem vonható vissza; a fizikai tárhelyobjektumok takarítása is elindul.</span></div></div>
    {error&&<div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
    {!error&&notice&&<div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>}
    {loading?<div className={styles.trashEmpty}><Loader2 className={styles.spin} size={25}/><strong>Lomtár betöltése…</strong></div>:items.length===0?<div className={styles.trashEmpty}><Archive size={28}/><strong>A Lomtár üres</strong><span>Nincs visszaállítható vagy véglegesen törölhető elem.</span></div>:
      <div className={styles.trashList}>{items.map(item=><article key={`${item.type}:${item.id}`} className={styles.trashItem}>
        <span className={styles.trashItemIcon}>{item.type==="FOLDER"?<Folder size={18}/>:<FileText size={18}/>}</span>
        <div className={styles.trashItemMain}><strong>{item.name}</strong><span>{item.path}</span><small>Lomtárba helyezve: {formatDate(item.deletedAt)}</small></div>
        <div className={styles.trashItemMeta}>{item.type==="FOLDER"?<><span>{item.folderCount} mappa</span><span>{item.documentCount} dokumentum</span></>:<span>Dokumentum</span>}<span>{formatBytes(item.totalSizeBytes)}</span></div>
        <div className={styles.trashItemActions}>
          <button type="button" disabled={!canRestore||Boolean(busyId)} onClick={()=>void restore(item)} title={canRestore?"Visszaállítás az eredeti helyre":"Nincs visszaállítási jogosultság"}>{busyId===item.id?<Loader2 className={styles.spin} size={13}/>:<RotateCcw size={13}/>} Visszaállítás</button>
          <button type="button" className={styles.trashPurgeButton} disabled={!canPurge||Boolean(busyId)} onClick={()=>{setPurgeTarget(item);setConfirmation("")}} title={canPurge?"Végleges törlés kezdeményezése":"Nincs végleges törlési jogosultság"}><Trash2 size={13}/> Végleges törlés</button>
        </div>
      </article>)}</div>}
    {purgeTarget&&<div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Végleges törlés megerősítése">
      <div className={`${styles.projectCreatePanel} ${styles.trashPurgeDialog}`}>
        <header><div><small>DIMPRO Drive · Lomtár</small><strong>Végleges törlés</strong><span>{purgeTarget.name}</span></div><button type="button" disabled={Boolean(busyId)} onClick={()=>{setPurgeTarget(null);setConfirmation("")}} aria-label="Bezárás">×</button></header>
        <div className={styles.trashPurgeDanger}><AlertTriangle size={18}/><div><strong>Ez a művelet nem vonható vissza.</strong><span>A dokumentum-metaadatok törlődnek, a fizikai S3-fájlok biztonságos takarítása elindul. Aktív hibajegy-kapcsolat esetén a rendszer blokkolja a műveletet.</span></div></div>
        <label>Írd be pontosan: <strong>{PURGE_CONFIRMATION}</strong><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
        <footer><button type="button" disabled={Boolean(busyId)} onClick={()=>{setPurgeTarget(null);setConfirmation("")}}>Mégsem</button><button type="button" className={styles.dangerButton} disabled={Boolean(busyId)||confirmation!==PURGE_CONFIRMATION} onClick={()=>void purge()}>{busyId?<Loader2 className={styles.spin} size={15}/>:<Trash2 size={15}/>} Végleges törlés</button></footer>
      </div>
    </div>}
  </section>;
}
