"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import styles from "./DriveNotificationSettings.module.css";

type Category = "DOCUMENT_CHANGES" | "APPROVAL_DECISIONS";
type Frequency = "FOUR_HOURLY" | "EIGHT_HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "NONE";
type Preference = { category: Category; enabled: boolean; digestFrequency: Frequency; followedOnly: boolean };
type Props = { projectId: string; onClose: () => void };

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

export default function DriveNotificationSettings({projectId,onClose}:Props) {
  const [preferences,setPreferences]=useState<Preference[]>(fallback);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState<Category|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [available,setAvailable]=useState(false);

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
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      <footer>Az értesítések címzettjeit és tartalmát a rendszer kiküldés előtt ismételten ellenőrzi a projekt- és mappajogosultságok alapján.</footer>
    </section>
  </div>;
}
