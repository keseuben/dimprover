import {Building2, BriefcaseBusiness, FolderLock, HardDrive, Layers3, ShieldCheck, UserRound} from "lucide-react";
import {DIMPRO_PRODUCTS,DIMPRO_PRODUCT_ARCHITECTURE_VERSION} from "@/app/lib/license/dimproProductArchitecture";
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
    <div className={styles.drive}>
      <HardDrive size={21}/>
      <div><strong>{drive.name} · közös fájlkezelő szolgáltatás</strong>
        <p>Személyes és projektszintű munkatér. A Projektkapu, BUILD és DIMPROVER az engedélyezett közös dokumentumokat használhatja; nem jöhet létre automatikus duplázott fizikai fájltár.</p>
      </div>
      <span>USER + PROJECT</span>
    </div>
    <p className={styles.note}>Jelenlegi forrás: Drive és Projektkapu kereskedelmi rekordok előkészítve, de nem aktivált licencérvényesítéssel. A többi termék külön licencadatforrása későbbi fejlesztés. AUTH / Project Core / ACL / fizetős licenc egymástól elkülönítve marad.</p>
  </section>;
}
