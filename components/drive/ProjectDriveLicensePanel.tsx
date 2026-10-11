"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, Building2, Clock3, Info, Loader2, Mail, ShieldCheck } from "lucide-react";
import type { ProjectLicenseSummary } from "@/app/lib/drive-core/projectLicense";
import styles from "./DriveLicenseCenter.module.css";

type Payload = {ok?:boolean;error?:string;projectName?:string;canManageBilling?:boolean;license?:ProjectLicenseSummary};
type Props = {projectId:string;projectName:string;productCode?:"DRIVE"|"PROJECT_GATE"};

const STATUS_LABELS:Record<ProjectLicenseSummary["status"],string>={
  NOT_CONFIGURED:"Licencmodul még nincs aktiválva",
  NOT_ASSIGNED:"Nincs hozzárendelt projektlicenc",
  DRAFT:"Előkészítés alatt",
  PENDING_APPROVAL:"Jóváhagyásra vár",
  ACTIVE:"Aktív projektlicenc",
  SUSPENDED:"Felfüggesztve",
  EXPIRED:"Lejárt",
  CANCELLED:"Megszüntetve",
};
const formatDate=(value:string|null)=>value?new Date(value).toLocaleDateString("hu-HU"):"Nincs rögzítve";
const formatCapacity=(bytes:number|null)=>bytes===null?"Nincs beállítva":(bytes/(1024**3)).toLocaleString("hu-HU",{maximumFractionDigits:1})+" GiB";

export default function ProjectDriveLicensePanel({projectId,projectName,productCode="DRIVE"}:Props){
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    // Clear all previous project's data before a new authorized fetch.
    setData(null);setError("");setLoading(true);
    void fetch("/api/projects/"+encodeURIComponent(projectId)+
      (productCode==="PROJECT_GATE"?"/project-gate/license":"/drive/license"),{
      cache:"no-store",credentials:"same-origin",signal:controller.signal,
    }).then(async response=>{
      const payload=await response.json().catch(()=>({})) as Payload;
      if(!response.ok||!payload.ok||!payload.license)
        throw new Error(payload.error||"A projektlicenc nem olvasható.");
      if(!controller.signal.aborted)setData(payload);
    }).catch(err=>{
      if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Ismeretlen hiba");
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[projectId,productCode]);
  const license=data?.license;
  return <section className={styles.panel} aria-label="Projekt Drive licenc">
    <h2><Building2 size={19}/> {productCode==="PROJECT_GATE"?"Projektkapu licence":"Projekt Drive licence"} · {data?.projectName||projectName}</h2>
    {loading?<p className={styles.muted}><Loader2 size={14} className={styles.spin}/> Projektlicenc betöltése…</p>:null}
    {error?<p className={styles.muted} role="alert">{error}</p>:null}
    {!loading&&license&&<>
      <div className={styles.neutralNotice} role="status">
        <BadgeCheck size={19}/>
        <span><strong>{STATUS_LABELS[license.status]}</strong><small>{license.note}</small></span>
      </div>
      <dl className={styles.dataRows}>
        <div><dt>Licencelt munkatér</dt><dd>{data?.projectName||projectName}</dd></div>
        <div><dt>Projektcsomag</dt><dd>{license.planCode||"Még nincs hozzárendelve"}</dd></div>
        {productCode==="DRIVE"&&<div><dt>Licencben nyilvántartott tárhelykeret</dt><dd>{formatCapacity(license.quotaBytes)}</dd></div>}
        <div><dt>Licencben nyilvántartott résztvevői keret</dt><dd>{license.maxProjectMembers??"Még nincs rögzítve"}</dd></div>
        <div><dt>Érvényesség kezdete</dt><dd>{formatDate(license.startsAt)}</dd></div>
        <div><dt>Érvényesség vége</dt><dd>{formatDate(license.expiresAt)}</dd></div>
        {data?.canManageBilling&&<>
          <div><dt>Projektlicenc azonosítója</dt><dd>{license.licenseCode||"Nincs még"}</dd></div>
          <div><dt>Fizető típusa</dt><dd>{license.payerType==="ORGANIZATION"?"Vállalkozás":license.payerType==="USER"?"Magánszemély":"Még nincs rögzítve"}</dd></div>
        </>}
      </dl>
      {data?.canManageBilling&&
        <a className={styles.secondaryLink}
          href={"mailto:admin@dimpro.hu?subject="+encodeURIComponent(
            productCode==="PROJECT_GATE"?"DIMPRO Projektkapu licenc igénylés / bővítés":"DIMPRO Drive projektlicenc igénylés / bővítés")
            +"&body="+encodeURIComponent("Projekt: "+(data?.projectName||projectName)+"\nProjektazonosító: "+projectId+"\nKért módosítás:\n")}>
          <Mail size={15}/> {productCode==="PROJECT_GATE"?"Projektkapu-licenc":"Drive-projektlicenc"} igénylése / bővítése
        </a>}
      <p className={styles.helper}><ShieldCheck size={14}/> A projekt terméklicence a projekthez tartozik. A meghívott résztvevők hozzáférése továbbra is saját projektszerepkörrel és mappa-/dokumentumjogosultsággal szabályozott.</p>
      <p className={styles.helper}><Clock3 size={14}/> A projektlicenc lejáratát külön kezeljük a műszaki dokumentumok megőrzésétől. A licencalapú korlátozás egyelőre nem aktív.</p>
      {productCode==="DRIVE"&&<p className={styles.helper}><Info size={14}/> A licencben rögzített tárhelykeret és a tényleges Drive-tárhelykeret külön adat; összekapcsolásuk csak jóváhagyott release után történhet.</p>}
      {productCode==="PROJECT_GATE"&&<p className={styles.helper}><Info size={14}/> A Projektkapu terméklicenc nem biztosít külön DIMPRO Drive tárhely-előfizetést vagy automatikus személyes fiókot.</p>}
      {productCode==="DRIVE"&&
        <a className={styles.secondaryLink}
          href={"/projektkapu/project/"+encodeURIComponent(projectId)+"/licenc"}>
          <Building2 size={15}/> Projektkapu külön licencének megtekintése
        </a>}
    </>}
  </section>;
}
