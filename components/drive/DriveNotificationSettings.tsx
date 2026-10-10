"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import styles from "./DriveNotificationSettings.module.css";

type Category = "DOCUMENT_CHANGES" | "APPROVAL_DECISIONS";
type Frequency = "FOUR_HOURLY" | "EIGHT_HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "NONE";
type Preference = { category: Category; enabled: boolean; digestFrequency: Frequency; followedOnly: boolean };
type Props = { projectId: string; onClose: () => void; canAuditProject?: boolean };
type PreviewRow = { eventId: string; kind: string; occurredAt: string; documentName: string };
type PreviewResponse = { ok: boolean; entries: PreviewRow[]; count: number; truncated: boolean; examined: number };
type DeliveryRow = {
  id:string; category:Category; scheduled_slot:string;
  status:"PENDING"|"PROCESSING"|"SENT"|"FAILED"|"AMBIGUOUS"|"SUPPRESSED";
  cursor_from:number; cursor_to:number; attempt_count:number;
  created_at:string; sent_at:string|null; last_error_code:string|null;
};
const deliveryLabels: Record<DeliveryRow["status"],string> = {
  PENDING:"Várakozik",PROCESSING:"Feldolgozás alatt",SENT:"SMTP elfogadta",
  FAILED:"Előkészítési hiba",AMBIGUOUS:"Kézbesítés ellenőrzendő",SUPPRESSED:"Nem küldhető",
};
const previewKinds: Record<string,string> = {
  NEW_DOCUMENT:"Új dokumentum", NEW_VERSION:"Új verzió", NEW_REVISION:"Új revízió",
  REVIEW_DECISION:"Ellenőrzési döntés", FORMAL_ISSUE:"Hivatalos kiadás",
};

const fallback: Preference[] = [
  { category:"DOCUMENT_CHANGES",enabled:false,digestFrequency:"DAILY",followedOnly:false },
  { category:"APPROVAL_DECISIONS",enabled:false,digestFrequency:"DAILY",followedOnly:false },
];
const descriptions: Record<Category,{label:string;description:string}> = {
  DOCUMENT_CHANGES:{label:"Dokumentumváltozások",description:"Új feltöltések, dokumentumverziók és hivatalos revíziók"},
  APPROVAL_DECISIONS:{label:"Tervellenőrzési és jóváhagyási döntések",description:"Csak a szerepkörödnek és dokumentumjogaidnak megfelelő döntések"},
};
const frequencies: {value:Frequency;label:string}[] = [
  {value:"FOUR_HOURLY",label:"4 óránként"},
  {value:"EIGHT_HOURLY",label:"8 óránként"},
  {value:"DAILY",label:"Naponta, 07:00"},
  {value:"WEEKLY",label:"Hétfőnként, 07:00"},
  {value:"MONTHLY",label:"Havonta, az első magyar munkanapon 07:00"},
  {value:"NONE",label:"Nincs e-mail"},
];

type AdminAuditRow={
  id:string;category:Category;scheduledSlot:string;status:DeliveryRow["status"];
  attempts:number;createdAt:string;smtpAcceptedAt:string|null;
  recipient:{displayName:string;currentProjectRole:string|null;
    currentProjectEmail:string|null;membershipStatus:string|null};
};
export default function DriveNotificationSettings({projectId,onClose,canAuditProject=false}:Props) {
  const [preferences,setPreferences]=useState<Preference[]>(fallback);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState<Category|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [available,setAvailable]=useState(false);
  const [previewCategory,setPreviewCategory]=useState<Category>("DOCUMENT_CHANGES");
  const [preview,setPreview]=useState<PreviewResponse|null>(null);
  const [previewBusy,setPreviewBusy]=useState(false);
  const [deliveryRows,setDeliveryRows]=useState<DeliveryRow[]|null>(null);
  const [deliveryBusy,setDeliveryBusy]=useState(false);
  const [adminAuditRows,setAdminAuditRows]=useState<AdminAuditRow[]|null>(null);
  const [adminAuditBusy,setAdminAuditBusy]=useState(false);

  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      try {
        const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/notification-preferences`,{
          credentials:"same-origin",cache:"no-store",signal:controller.signal,
        });
        const payload=await response.json() as {ok?:boolean;error?:string;preferences?:Preference[]};
        if(!response.ok||!payload.ok)throw new Error(payload.error||"Az értesítési beállítások nem érhetők el.");
        if(!controller.signal.aborted){
          setPreferences(payload.preferences||fallback);
          setAvailable(true);
        }
      } catch(caught) {
        if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:"A beállítások nem tölthetők be.");
      } finally {
        if(!controller.signal.aborted)setLoading(false);
      }
    })();
    return ()=>controller.abort();
  },[projectId]);

  function change(category:Category,patch:Partial<Preference>){
    setPreferences((current)=>current.map((row)=>row.category===category?{...row,...patch}:row));
    setNotice("");
  }
  async function save(pref:Preference) {
    setSaving(pref.category);setError("");setNotice("");
    try {
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/notification-preferences`,{
        method:"PUT",credentials:"same-origin",
        headers:{"content-type":"application/json",accept:"application/json"},
        body:JSON.stringify(pref),
      });
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string;preferences?:Preference[]};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"A beállítás nem menthető.");
      setPreferences(payload.preferences||fallback);setNotice("Értesítési beállítás mentve.");
    }catch(caught){setError(caught instanceof Error?caught.message:"A mentés sikertelen.");}
    finally{setSaving(null);}
  }
  async function loadPreview(category:Category) {
    setPreviewBusy(true);setPreview(null);setError("");setPreviewCategory(category);
    try {
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/notification-preview?category=${encodeURIComponent(category)}&hours=168`,{
        credentials:"same-origin",cache:"no-store",
      });
      const payload=await response.json() as PreviewResponse & {error?:string};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"Az előnézet nem tölthető be.");
      setPreview(payload);
    }catch(caught){setError(caught instanceof Error?caught.message:"Az előnézet nem tölthető be.");}
    finally{setPreviewBusy(false);}
  }

  async function downloadPreview(category:Category) {
    setPreviewBusy(true);setError("");
    try {
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/notification-preview?category=${encodeURIComponent(category)}&hours=168&format=xlsx`,{
        credentials:"same-origin",cache:"no-store",
      });
      if(!response.ok){
        const payload=await response.json().catch(()=>({})) as {error?:string};
        throw new Error(payload.error||"A melléklet nem készíthető el.");
      }
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      try{
        const link=document.createElement("a");link.href=url;
        link.download="DIMPRO_Drive_ertesitesi_elonezet.xlsx";
        document.body.appendChild(link);link.click();link.remove();
      }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(caught){setError(caught instanceof Error?caught.message:"A melléklet nem tölthető le.");}
    finally{setPreviewBusy(false);}
  }

  async function loadDeliveryHistory() {
    setDeliveryBusy(true);setError("");
    try {
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/notification-deliveries`,{
        credentials:"same-origin",cache:"no-store",
      });
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string;deliveries?:DeliveryRow[]};
      if(!response.ok || !payload.ok)throw Error(payload.error||"A kézbesítési napló nem olvasható.");
      setDeliveryRows(payload.deliveries||[]);
    }catch(caught){setError(caught instanceof Error?caught.message:"A kézbesítési napló nem érhető el.");}
    finally{setDeliveryBusy(false);}
  }

  async function loadAdminAudit() {
    if(!canAuditProject)return;
    setAdminAuditBusy(true);setError("");
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/notification-admin-audit`,{
        credentials:"same-origin",cache:"no-store",
      });
      const payload=await response.json().catch(()=>({})) as {ok?:boolean;error?:string;rows?:AdminAuditRow[]};
      if(!response.ok||!payload.ok)throw Error(payload.error||"Az adminnapló nem érhető el.");
      setAdminAuditRows(payload.rows||[]);
    }catch(caught){setError(caught instanceof Error?caught.message:"Az adminnapló nem érhető el.");}
    finally{setAdminAuditBusy(false);}
  }

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="DIMPRO Drive értesítési beállítások">
    <section className={styles.panel}>
      <header><div><small>DIMPRO DRIVE</small><strong><Bell size={20}/> Értesítési beállítások</strong>
        <span>A dokumentumváltozások és a hivatalos jóváhagyások külön szabályozhatók.</span></div>
        <button type="button" onClick={onClose} title="Bezárás" aria-label="Bezárás"><X size={19}/></button>
      </header>
      <div className={styles.notice}>Az értesítések kiküldése még nincs aktiválva. Jelenleg a személyes beállítások előkészítése történik; e-mail nem indul el innen.</div>
      {loading && <p>Értesítési beállítások betöltése…</p>}
      {!loading && preferences.map((pref)=> <section key={pref.category} className={styles.category}>
        <strong>{descriptions[pref.category].label}</strong>
        <p>{descriptions[pref.category].description}</p>
        <label className={styles.checkbox}><input type="checkbox" checked={pref.enabled} disabled={!available||Boolean(saving)}
          onChange={(event)=>change(pref.category,{enabled:event.target.checked})}/> Kérek értesítéseket erről a kategóriáról</label>
        <label>Összesítő gyakorisága
          <select value={pref.digestFrequency} disabled={!available||Boolean(saving)}
            onChange={(event)=>change(pref.category,{digestFrequency:event.target.value as Frequency})}>
            {frequencies.map((f)=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label className={styles.checkbox}><input type="checkbox" checked={pref.followedOnly} disabled={!available||Boolean(saving)}
          onChange={(event)=>change(pref.category,{followedOnly:event.target.checked})}/> Csak az általam követett dokumentumokról</label>
        <button type="button" disabled={!available||Boolean(saving)} onClick={()=>void save(pref)}>
          {saving===pref.category?"Mentés…":"Beállítás mentése"}
        </button>
      </section>)}
      <section className={styles.previewSection}>
        <strong>Értesítési előnézet – az elmúlt 7 nap</strong>
        <p>Csak az Ön számára hozzáférhető dokumentumok. Az előnézet nem indít e-mailt, és a szűrés a dokumentumjogosultságait ellenőrzi.</p>
        <div className={styles.previewActions}>
          <button type="button" disabled={previewBusy} onClick={()=>void loadPreview("DOCUMENT_CHANGES")}>Dokumentumváltozások</button>
          <button type="button" disabled={previewBusy} onClick={()=>void loadPreview("APPROVAL_DECISIONS")}>Jóváhagyások</button>
          <button type="button" disabled={previewBusy||!preview?.entries.length} onClick={()=>void downloadPreview(previewCategory)}>Excel előnézet</button>
        </div>
        {previewBusy && <p>Előnézet betöltése…</p>}
        {preview && <div className={styles.previewResults}>
          <strong>{descriptions[previewCategory].label}: {preview.count} esemény</strong>
          {preview.truncated && <p>A napló az első 250 legutóbbi eseményre korlátozott; a lista nem teljes.</p>}
          {!preview.entries.length && <p>Nincs megjeleníthető változás ebben a kategóriában.</p>}
          {preview.entries.slice(0,15).map((row)=><div key={row.eventId} className={styles.previewEntry}>
            <span>{previewKinds[row.kind]||"Változás"}</span>
            <strong title={row.documentName}>{row.documentName}</strong>
            <time>{new Date(row.occurredAt).toLocaleDateString("hu-HU")}</time>
          </div>)}
          {preview.entries.length>15 && <p>+{preview.entries.length-15} további esemény (az Excel-előnézet tartalmazza őket).</p>}
        </div>}
      </section>
      <section className={styles.previewSection}>
        <strong>Saját értesítési kézbesítési napló</strong>
        <p>Az előzmények kizárólag az Ön fiókjához tartoznak. Az „SMTP elfogadta” állapot nem bizonyítja a címzett postafiókjába érkezést.</p>
        <div className={styles.previewActions}>
          <button type="button" disabled={deliveryBusy} onClick={()=>void loadDeliveryHistory()}>
            {deliveryBusy?"Lekérdezés…":"Saját kézbesítések lekérdezése"}
          </button>
        </div>
        {deliveryRows && <div className={styles.previewResults} role="region" aria-label="Saját kézbesítési napló">
          {!deliveryRows.length && <p>Jelenleg nincs rögzített kézbesítés.</p>}
          {deliveryRows.map((row)=><div key={row.id} className={styles.previewEntry}>
            <span>{deliveryLabels[row.status]||"Ismeretlen"}</span>
            <strong>{descriptions[row.category]?.label||"Értesítés"} · {row.scheduled_slot}</strong>
            <time title={row.last_error_code||undefined}>{row.sent_at?new Date(row.sent_at).toLocaleDateString("hu-HU"):"—"}</time>
          </div>)}
        </div>}
      </section>
      {canAuditProject && <section className={styles.previewSection}>
        <strong>Projekt értesítési audit – csak projektadminisztrátoroknak</strong>
        <p>A napló a kézbesítési állapotokat és a címzettek <em>jelenlegi</em> projekttagsági adatait mutatja; korábbi SMTP-címként ezeket nem tünteti fel.</p>
        <div className={styles.previewActions}>
          <button type="button" disabled={adminAuditBusy} onClick={()=>void loadAdminAudit()}>
            {adminAuditBusy?"Lekérdezés…":"Projekt kézbesítési naplója"}
          </button>
        </div>
        {adminAuditRows && <div className={styles.previewResults} role="region" aria-label="Projektadminisztrátori kézbesítési napló">
          {!adminAuditRows.length && <p>Még nincs naplózott kiküldés.</p>}
          {adminAuditRows.map((row)=><div className={styles.adminAuditRow} key={row.id}>
            <strong>{row.recipient.displayName}</strong>
            <span>{row.recipient.currentProjectRole || "Nincs aktuális projekt szerep"} · {row.recipient.currentProjectEmail || "Nincs aktuális e-mail"}</span>
            <small>{deliveryLabels[row.status]||row.status} · {row.scheduledSlot} · {descriptions[row.category]?.label||"Értesítés"}</small>
          </div>)}
        </div>}
      </section>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      <footer>Az értesítések címzettjeit és tartalmát a rendszer kiküldés előtt ismételten ellenőrzi a projekt- és mappajogosultságok alapján.</footer>
    </section>
  </div>;
}
