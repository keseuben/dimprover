"use client";

import {useMemo,useState} from "react";
import {Database,Info,LockKeyhole} from "lucide-react";
import {INITIAL_LICENSE_PLAN_DRAFTS,type LicensePlanProduct,type LicensePlanScope} from "@/app/lib/license/planCatalogDrafts";
import styles from "./PlanDraftCatalogue.module.css";

const groups:[
  {id:string;title:string;product:LicensePlanProduct;scope:LicensePlanScope},
  ...Array<{id:string;title:string;product:LicensePlanProduct;scope:LicensePlanScope}>
]=[
  {id:"own",title:"Saját Drive",product:"DRIVE",scope:"PERSONAL"},
  {id:"drive",title:"Projekt Drive",product:"DRIVE",scope:"PROJECT"},
  {id:"gate",title:"Projektkapu",product:"PROJECT_GATE",scope:"PROJECT"},
];
const featureLabels:Record<string,string>={
  PERSONAL_FILES:"Saját fájltér",
  MANUAL_UPLOAD:"Kézi feltöltés",
  FILE_HISTORY:"Verzióelőzmények",
  DESKTOP_SYNC_CANDIDATE:"Asztali szinkron – javaslat",
  PROJECT_FILES:"Projektmunkatér",
  PROJECT_ACL:"Projekt ACL",
  EXTERNAL_PARTNERS_CANDIDATE:"Külsős partnerfunkciók – javaslat",
  AUDIT_CANDIDATE:"Bővített audit – javaslat",
  PROJECT_OVERVIEW:"Projektáttekintés",
  PROJECT_MEMBERS:"Projektrésztvevők",
  DIALOG_CANDIDATE:"Egyeztetések – javaslat",
  DECIDE_CANDIDATE:"Jóváhagyások – javaslat",
  REPORTS_CANDIDATE:"Riportok – javaslat",
};
export default function PlanDraftCatalogue(){
  const [groupId,setGroupId]=useState("own");
  const [selectedStorageGiB,setSelectedStorageGiB]=useState(5);
  const selected=groups.find(group=>group.id===groupId)||groups[0];
  const plans=useMemo(()=>INITIAL_LICENSE_PLAN_DRAFTS.filter(
    plan=>plan.productCode===selected.product&&plan.scope===selected.scope),
    [selected.product,selected.scope]);
  const visiblePlans=selected.product==="DRIVE"
    ? plans.filter(plan=>plan.proposedStorageGiB===selectedStorageGiB)
    : plans;
  return <section className={styles.wrapper} aria-label="Előkészített DIMPRO csomagjavaslatok">
    <div className={styles.header}>
      <div>
        <h2><Database size={18}/> DIMPRO csomagkatalógus – tervezetek</h2>
        <p>A Saját Drive és a Projekt Drive egyaránt hét választható tárhelyméretet kapott. A tárhelyválasztás nem határozza meg automatikusan a funkciókat vagy a résztvevők számát. Az árak még nincsenek meghatározva.</p>
      </div>
      <span className={styles.draft}><LockKeyhole size={14}/> Nem aktivált</span>
    </div>
    <div className={styles.switch} role="group" aria-label="Csomagtípus választása">
      {groups.map(group=><button type="button" key={group.id}
        onClick={()=>{setGroupId(group.id);setSelectedStorageGiB(5);}}
        aria-pressed={group.id===groupId}
        className={group.id===groupId?styles.active:""}>{group.title}</button>)}
    </div>
    {selected.product==="DRIVE"&&<div className={styles.capacityChooser}>
      <span>Tárhelyméret · GiB</span>
      <div className={styles.capacityOptions} role="group" aria-label="Javasolt tárhelyméret">
        {plans.map(plan=><button key={plan.planCode} type="button"
          aria-pressed={selectedStorageGiB===plan.proposedStorageGiB}
          className={selectedStorageGiB===plan.proposedStorageGiB?styles.capacityActive:""}
          onClick={()=>setSelectedStorageGiB(plan.proposedStorageGiB!)}>
          {plan.proposedStorageGiB} GiB
        </button>)}
      </div>
    </div>}
    <div className={styles.plans} data-single={selected.product==="DRIVE"?"true":"false"}>
      {visiblePlans.map(plan=><article className={styles.plan} key={plan.planCode}>
        <div className={styles.planTop}>
          <strong>{plan.label}</strong>
          <span>TERVEZET</span>
        </div>
        <p>{plan.description}</p>
        <div className={styles.capacity}>
          <strong>{plan.proposedStorageGiB===null?"Modulalapú":plan.proposedStorageGiB+" GiB"}</strong>
          <small>{plan.proposedStorageGiB===null?"Projektkapu funkciócsomag":"Tervezett tárhelyméret"}</small>
        </div>
        <div className={styles.detail}>
          <span>Résztvevői keret</span><strong>{plan.proposedMemberLimit??"Még nincs meghatározva"}</strong>
        </div>
        <div className={styles.detail}>
          <span>Havidíj / éves díj</span><strong>Még nincs meghatározva</strong>
        </div>
        <div className={styles.features}>
          {plan.proposedFeatureCodes.map(feature=><span key={feature}>{featureLabels[feature]||feature}</span>)}
        </div>
        <small className={styles.proposalDisclaimer}>A fenti funkciók és résztvevői keretek csak előzetes javaslatok; a tárhelyméret önmagában nem ad további moduljogosultságot.</small>
        <code>{plan.planCode}</code>
      </article>)}
    </div>
    <p className={styles.notice}><Info size={17}/>
      A működő Drive motor jelenleg Saját Drive esetében 50 GiB, projektmunkatér esetében 10 GiB alapértelmezést használ. A fenti tervezetek NEM állítják át ezeket. A csomagkatalógus és a tényleges licenc-/kvótaérvényesítés összekötése külön jóváhagyáshoz kötött.</p>
  </section>;
}
