import {Building2, BriefcaseBusiness, FolderLock, HardDrive, Layers3, Send, ShieldCheck, UserRound} from "lucide-react";
import {DIMPRO_PRODUCTS,DIMPRO_PRODUCT_ARCHITECTURE_VERSION} from "@/app/lib/license/dimproProductArchitecture";
import {DIMPRO_DROP_SERVICE} from "@/app/lib/license/dimproDropServiceCatalog";
import styles from "./ProductArchitectureOverview.module.css";

const icons=[UserRound,BriefcaseBusiness,FolderLock,Building2,Layers3];
const scopeLabels:Record<string,string>={
  USER:"Személy / felhasználó",ORGANIZATION:"Szervezet / vállalkozás",PROJECT:"Projekt",
};

export default function ProductArchitectureOverview(){
  const levels=DIMPRO_PRODUCTS.filter(p=>p.role==="PRIMARY_PRODUCT");
  const drive=DIMPRO_PRODUCTS.find(p=>p.code==="DRIVE")!;
  return <section className={styles.panel} aria-label="DIMPRO termék- és licencarchitektúra">
    <div className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>DIMPRO TERMÉKARCHITEKTÚRA · V{DIMPRO_PRODUCT_ARCHITECTURE_VERSION}</span>
        <h2>Öt termékszint, egy közös rendszeralap</h2>
        <p>A terméklicencek és a tényleges felhasználói jogosultságok egymástól külön kezelendők. A termékkatalógus nem jogosultságkiosztás.</p>
      </div>
      <span className={styles.status}><ShieldCheck size={14}/> Fejlesztési terv</span>
    </div>
    <div className={styles.levels}>
      {levels.map((item,i)=>{
        const Icon=icons[i];
        return <article key={item.code} className={styles.level}>
          <div className={styles.step}><Icon size={16}/><span>0{i+1}</span></div>
          <strong>{item.name}</strong>
          <small>{item.licenseScopes.map(scope=>scopeLabels[scope]).join(" · ")}</small>
          <span className={styles.source}>{item.currentCommercialRecord==="PROJECT_LICENSE_SOURCE_ONLY"
            ?"Projektlicenc-forrás előkészítve":"Licencforrás későbbi fázis"}</span>
        </article>;
      })}
    </div>
    <div className={styles.services}>
      <div className={styles.drive}>
        <HardDrive size={21}/>
        <div><strong>{drive.name} · közös fájlkezelő szolgáltatás</strong>
          <p>Személyes és projektszintű tartós munkatér, dokumentumverziók és szinkron. Önálló Drive-előfizetés; más termékhez csak megfelelő ACL mellett kapcsolható.</p>
        </div>
        <span>USER + PROJECT</span>
      </div>
      <div className={styles.drive}>
        <Send size={21}/>
        <div><strong>{DIMPRO_DROP_SERVICE.name} · önálló fájlküldő szolgáltatás</strong>
          <p>E-mailes DIMPRO Send, Gyors KépSend és meghívásos Drop-munkafolyamatok. Drive-előfizetés nélkül is használható; projektbe/Drive-ba átadás csak külön jogosultsággal.</p>
        </div>
        <span>USER + ORGANIZATION</span>
      </div>
    </div>
    <p className={styles.note}>A Drive és a Drop külön licencelhető, de együttműködő szolgáltatások. A Drop jelenlegi Identity Core / Send entitlement licenceit az egységes központi AUTH-ba később, auditáltan vezetjük át. A régi licencek és Send-kódok addig érvényben maradnak; az új katalógus nem ad vagy von el hozzáférést. A többi termék licencforrása későbbi fejlesztés.</p>
  </section>;
}
