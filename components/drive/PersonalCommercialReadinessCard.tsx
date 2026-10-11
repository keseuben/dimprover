"use client";

import {useEffect,useState} from "react";
import {BadgeCheck,Info,Loader2,RefreshCcw} from "lucide-react";
import type {UserCommercialReadiness,UserCommercialRecordStatus}
  from "@/app/lib/license/userCommercialReadinessCore";
import styles from "./DriveLicenseCenter.module.css";

type Response={
  ok?:boolean;error?:string;
  commercialRecordsOnly?:boolean;
  effectiveEntitlementReleased?:boolean;
  products?:UserCommercialReadiness[];
};
const stateText:Record<UserCommercialRecordStatus,string>={
  SOURCE_NOT_CONFIGURED:"Licencnyilvántartás még nincs aktiválva",
  NOT_ASSIGNED:"Nincs kereskedelmi előfizetés hozzárendelve",
  DRAFT:"Előkészítés alatt",
  PENDING_APPROVAL:"Jóváhagyásra vár",
  NOT_STARTED:"Jövőbeni kezdésre előkészítve",
  ACTIVE_RECORD_ONLY:"Aktív kereskedelmi rekord (nem hozzáférési engedély)",
  EXPIRED:"Lejárt kereskedelmi rekord",
  SUSPENDED:"Felfüggesztett kereskedelmi rekord",
  CANCELLED:"Megszüntetett kereskedelmi rekord",
  INCONSISTENT_RECORD:"Adatok ellenőrzése szükséges",
};
const products=[{code:"DRIVE",label:"Saját DIMPRO Drive"},{code:"DIMPRO_ONE",label:"DIMPROONE"}] as const;
function quota(bytes:number|null){
  if(bytes===null)return "Nincs jóváhagyott adat";
  if(bytes===0)return "Nincs külön Drive-tárhely";
  return String(Math.round(bytes/1024**3))+" GiB – kereskedelmi tervadat";
}
export default function PersonalCommercialReadinessCard(){
  const [result,setResult]=useState<Response|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [refreshId,setRefreshId]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/drive/license/self",{
      credentials:"same-origin",cache:"no-store",signal:controller.signal,
    }).then(async response=>{
      const payload=await response.json().catch(()=>({})) as Response;
      if(!response.ok||!payload.ok)throw Error(payload.error||"Az előfizetési állapot nem érhető el.");
      if(!controller.signal.aborted){setResult(payload);setError("");}
    }).catch(err=>{
      if(!controller.signal.aborted){
        setResult(null);
        setError(err instanceof Error?err.message:"A személyes licencállapot nem érhető el.");
      }
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[refreshId]);

  return <section className={styles.panel} aria-label="Személyes kereskedelmi licencállapot">
    <h2><BadgeCheck size={19}/> Személyes terméklicencek
      <button type="button" onClick={()=>{
        setLoading(true);setRefreshId(value=>value+1);
      }} disabled={loading} aria-label="Személyes licencek frissítése"
        title="Személyes licencek frissítése"
        style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #d6e5ea",borderRadius:5,padding:"5px 9px",background:"#fff",cursor:"pointer",fontSize:11}}>
        <RefreshCcw size={13}/> Frissítés
      </button>
    </h2>
    {loading&&<div className={styles.state}><Loader2 size={16} className={styles.spin}/> Hiteles kereskedelmi rekordok ellenőrzése…</div>}
    {error&&<p role="status" className={styles.muted}>{error}</p>}
    {!loading&&result?.ok&&<dl className={styles.dataRows}>
      {products.map(({code,label})=>{
        const item=result.products?.find(entry=>entry.productCode===code);
        return <div key={code}>
          <dt>{label}</dt>
          <dd>
            <strong>{item?stateText[item.status]:"Nincs hiteles rekord"}</strong>
            {item?.planCode&&<small style={{display:"block",fontWeight:400,marginTop:4}}>Tervezeti csomag: {item.planCode}</small>}
            {code==="DRIVE"&&<small style={{display:"block",fontWeight:400,marginTop:4}}>
              {quota(item?.proposedQuotaBytes??null)}
            </small>}
          </dd>
        </div>;
      })}
    </dl>}
    <p className={styles.helper}><Info size={14} style={{display:"inline-block",verticalAlign:"middle",marginRight:6}}/>
      A kereskedelmi nyilvántartás és a Drive-hozzáférési jogosultság külön rendszer.
      Itt nem történik fizetés, aktiválás vagy tárhelymódosítás; a jelenlegi tárhelykereted változatlan marad.
    </p>
  </section>;
}
