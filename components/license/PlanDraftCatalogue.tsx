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
  const selected=groups.find(group=>group.id===groupId)||groups[0];
  const plans=useMemo(()=>INITIAL_LICENSE_PLAN_DRAFTS.filter(
    plan=>plan.productCode===selected.product&&plan.scope===selected.scope),
    [selected.product,selected.scope]);
  return <section className={styles.wrapper} aria-label="Előkészített DIMPRO csomagjavaslatok">
    <div className={styles.header}>
      <div>
        <h2><Database size={18}/> DIMPRO csomagkatalógus – tervezetek</h2>
        <p>A méretek és a szolgáltatások döntési javaslatok. A csomagok nem publikusak, nincs hozzájuk ár és nem módosítják a működő tárhelyeket.</p>
      </div>
      <span className={styles.draft}><LockKeyhole size={14}/> Nem aktivált</span>
    </div>
    <div className={styles.switch} role="group" aria-label="Csomagtípus választása">
      {groups.map(group=><button type="button" key={group.id}
        onClick={()=>setGroupId(group.id)}
        aria-pressed={group.id===groupId}
        className={group.id===groupId?styles.active:""}>{group.title}</button>)}
    </div>
    <div className={styles.plans}>
      {plans.map(plan=><article className={styles.plan} key={plan.planCode}>
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
          <span>Résztvevői keret</span><strong>{plan.proposedMemberLimit??"Egyedi"}</strong>
        </div>
        <div className={styles.detail}>
          <span>Havidíj / éves díj</span><strong>Még nincs meghatározva</strong>
        </div>
        <div className={styles.features}>
          {plan.proposedFeatureCodes.map(feature=><span key={feature}>{featureLabels[feature]||feature}</span>)}
        </div>
        <code>{plan.planCode}</code>
      </article>)}
    </div>
    <p className={styles.notice}><Info size={17}/>
      A működő Drive motor jelenleg Saját Drive esetében 50 GiB, projektmunkatér esetében 10 GiB alapértelmezést használ. A fenti tervezetek NEM állítják át ezeket. A csomagkatalógus és a tényleges licenc-/kvótaérvényesítés összekötése külön jóváhagyáshoz kötött.</p>
  </section>;
}
