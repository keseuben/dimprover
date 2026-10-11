"use client";
import {useCallback,useEffect,useState} from "react";
import {BadgeCheck, Building2, HardDrive, LockKeyhole, RefreshCcw} from "lucide-react";
import styles from "./ProjectProductLicensesAdmin.module.css";

type ProductCode="DRIVE"|"PROJECT_GATE";
type Project={id:string;external_project_id:string;name:string;status:string};
type Payer={id:string;name:string};
type License={
 id:string;auth_project_id:string;product_code:ProductCode;license_code:string;
 plan_code:string;status:string;payer_type:string;storage_quota_bytes:string;
 max_project_members:number|null;starts_at:string|null;expires_at:string|null;
 revision:number;project_name:string;external_project_id:string|null;
};
type Overview={
 ok?:boolean;error?:string;projects?:Project[];organizations?:Payer[];
 users?:Payer[];licenses?:License[];issuanceEnabled?:boolean;note?:string;
};
type Props={adminKey:string};

export default function ProjectProductLicensesAdmin({adminKey}:Props){
 const [overview,setOverview]=useState<Overview|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [product,setProduct]=useState<ProductCode>("DRIVE");
 const [projectId,setProjectId]=useState("");
 const [payerType,setPayerType]=useState<"USER"|"ORGANIZATION">("ORGANIZATION");
 const [payerId,setPayerId]=useState("");
 const [plan,setPlan]=useState("PROJECT_STANDARD");
 const [quotaGiB,setQuotaGiB]=useState("10");
 const [members,setMembers]=useState("25");
 const [reason,setReason]=useState("");
 const [approvalReasons,setApprovalReasons]=useState<Record<string,string>>({});
 const [approvalExpires,setApprovalExpires]=useState<Record<string,string>>({});
 const [message,setMessage]=useState("");

 const load=useCallback(async()=>{
  if(!adminKey)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/dimpro-identity/admin/project-product-licenses",{
    headers:{"x-dimpro-license-admin-key":adminKey},cache:"no-store",credentials:"same-origin"});
   const data=await response.json() as Overview;
   if(!response.ok||!data.ok)throw Error(data.error||"A központi AUTH licencadatok nem elérhetők.");
   setOverview(data);
   setProjectId(previous=>previous||data.projects?.[0]?.external_project_id||"");
  }catch(err){setOverview(null);setError(err instanceof Error?err.message:"Licencadatok betöltése sikertelen.");}
  finally{setBusy(false);}
 },[adminKey]);
 useEffect(()=>{void load();},[load]);

 async function createPending(){
  if(!overview?.issuanceEnabled)return;
  if(!window.confirm("Létrehozod a kiválasztott termékhez a projektlicenc-kérelmet? A jogosultság még nem aktiválódik."))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/dimpro-identity/admin/project-product-licenses",{
    method:"POST",headers:{"content-type":"application/json","x-dimpro-license-admin-key":adminKey},
    credentials:"same-origin",
    body:JSON.stringify({projectId,productCode:product,planCode:plan.trim(),payerType,payerId,
      quotaGiB:Number(quotaGiB),maxMembers:members?Number(members):null,reason:reason.trim()})
   });
   const payload=await response.json() as {ok?:boolean;error?:string};
   if(!response.ok||!payload.ok)throw Error(payload.error||"A licenckérelem sikertelen.");
   setReason("");setMessage("Projektlicenc-kérelem mentve; jóváhagyásra vár.");
   await load();
  }catch(err){setMessage(err instanceof Error?err.message:"Hiba");}finally{setBusy(false);}
 }
 async function approve(license:License){
  if(!overview?.issuanceEnabled)return;
  const approvalReason=approvalReasons[license.id]||"";
  const expiresAt=approvalExpires[license.id];
  if(approvalReason.trim().length<12||!expiresAt){setMessage("Jóváhagyáshoz lejárati dátum és indoklás szükséges.");return;}
  if(!window.confirm("Jóváhagyod a "+license.license_code+" projektlicencet? Ez a kártya még NEM aktivál Drive- vagy Projektkapu-hozzáférést."))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/dimpro-identity/admin/project-product-licenses",{
    method:"PATCH",credentials:"same-origin",
    headers:{"content-type":"application/json","x-dimpro-license-admin-key":adminKey},
    body:JSON.stringify({licenseId:license.id,expiresAt:expiresAt+"T23:59:59Z",reason:approvalReason.trim()})
   });
   const payload=await response.json() as {ok?:boolean;error?:string};
   if(!response.ok||!payload.ok)throw Error(payload.error||"Jóváhagyás elutasítva.");
   setMessage("Projektlicenc-rekord jóváhagyva, runtime entitlement még nincs aktiválva.");
   await load();
  }catch(err){setMessage(err instanceof Error?err.message:"Hiba");}finally{setBusy(false);}
 }
 const payerOptions=payerType==="ORGANIZATION"?overview?.organizations||[]:overview?.users||[];
 const disabled=busy||!overview?.issuanceEnabled;
 return <section className={styles.panel} aria-label="Központi projekttermék-licencek">
  <header className={styles.heading}>
    <div><h2><BadgeCheck size={19}/> Projektlicencek · Drive és Projektkapu</h2>
      <p>Közös AUTH licencmotor, két külön termék, projektenként külön licenc. A meglévő Identity Core licencek változatlanul maradnak.</p>
    </div>
    <button type="button" onClick={()=>void load()} disabled={busy} className={styles.reload}><RefreshCcw size={15}/> Frissítés</button>
  </header>
  {error&&<p className={styles.note} role="status">A központi projektlicenc-adatbázis még nem elérhető: {error}. Az új AUTH migrációkat nem alkalmaztuk.</p>}
  {overview?.ok&&<>
   {!overview.issuanceEnabled&&<p className={styles.note}><LockKeyhole size={16}/>
     A licenckiadás és jóváhagyás jelenleg zárolt. Az előnézeti lista olvasható; nincs automatikus engedélyezés vagy számlázás.</p>}
   <div className={styles.stats}>
     <span><HardDrive size={15}/> Drive: <strong>{overview.licenses?.filter(row=>row.product_code==="DRIVE").length||0}</strong></span>
     <span><Building2 size={15}/> Projektkapu: <strong>{overview.licenses?.filter(row=>row.product_code==="PROJECT_GATE").length||0}</strong></span>
     <span>Jóváhagyásra vár: <strong>{overview.licenses?.filter(row=>row.status==="PENDING_APPROVAL").length||0}</strong></span>
   </div>
   <div className={styles.form}>
    <h3>Új projektlicenc előkészítése</h3>
    <label>Projekt<select value={projectId} onChange={event=>setProjectId(event.target.value)}>
      {(overview.projects||[]).map(row=><option key={row.id} value={row.external_project_id}>{row.name}</option>)}
    </select></label>
    <label>Termék<select value={product} onChange={event=>setProduct(event.target.value as ProductCode)}>
      <option value="DRIVE">DIMPRO Drive</option><option value="PROJECT_GATE">DIMPRO Projektkapu</option>
    </select></label>
    <label>Csomagkód<input value={plan} maxLength={64} onChange={event=>setPlan(event.target.value.toUpperCase())}/></label>
    <label>Fizető típusa<select value={payerType} onChange={event=>{setPayerType(event.target.value as "USER"|"ORGANIZATION");setPayerId("");}}>
      <option value="ORGANIZATION">Vállalkozás</option><option value="USER">Magánszemély</option>
    </select></label>
    <label>Fizető<select value={payerId} onChange={event=>setPayerId(event.target.value)}>
      <option value="">Válassz a központi AUTH nyilvántartásból</option>
      {payerOptions.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    {product==="DRIVE"&&<label>Projekt-tárhely (GiB)<input type="number" min="1" step="1" value={quotaGiB} onChange={event=>setQuotaGiB(event.target.value)}/></label>}
    <label>Résztvevői keret<input type="number" min="1" max="100000" value={members} onChange={event=>setMembers(event.target.value)}/></label>
    <label className={styles.wide}>Indoklás<textarea rows={2} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Mi alapján adjuk ki ezt a projektlicencet?"/></label>
    <div className={styles.wide}><button type="button" disabled={disabled||!projectId||!payerId||reason.trim().length<12}
      onClick={()=>void createPending()}>Jóváhagyásra váró licenc létrehozása</button></div>
   </div>
   <div className={styles.list}>
    {(overview.licenses||[]).length===0?<p>Nincs még létrehozott Drive- vagy Projektkapu-projektlicenc.</p>:
    (overview.licenses||[]).map(row=><article key={row.id}>
      <div><strong>{row.project_name} · {row.product_code==="DRIVE"?"Drive":"Projektkapu"}</strong>
        <small>{row.license_code} · {row.plan_code} · {row.status} · V{row.revision}</small></div>
      {row.status==="PENDING_APPROVAL"&&<div className={styles.approval}>
        <label>Lejárat (nap vége, UTC)<input type="date" value={approvalExpires[row.id]||""} onChange={event=>setApprovalExpires(prev=>({...prev,[row.id]:event.target.value}))}/></label>
        <label>Jóváhagyás indoka<input value={approvalReasons[row.id]||""} maxLength={500} onChange={event=>setApprovalReasons(prev=>({...prev,[row.id]:event.target.value}))}/></label>
        <button type="button" disabled={disabled||!approvalExpires[row.id]||(approvalReasons[row.id]||"").trim().length<12}
          onClick={()=>void approve(row)}>Licenc jóváhagyása</button>
      </div>}
    </article>)}
   </div>
  </>}
  {message&&<p role="status" className={styles.note}>{message}</p>}
 </section>;
}
