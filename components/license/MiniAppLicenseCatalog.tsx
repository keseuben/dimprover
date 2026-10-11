import {Calculator,ClipboardList,HeartPulse,Info,Leaf,Store} from "lucide-react";
import {DIMPRO_MINI_APPS} from "@/app/lib/license/dimproMiniAppCatalog";
import styles from "./MiniAppLicenseCatalog.module.css";

const icons=[Store,Calculator,ClipboardList,Leaf,HeartPulse] as const;
const scopeLabels:Record<string,string>={USER:"Személyes",ORGANIZATION:"Céges"};

export default function MiniAppLicenseCatalog(){
  return <section className={styles.panel} aria-label="DIMPRO kisebb digitális alkalmazások licenckatalógusa">
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>KÜLÖNÁLLÓ DIMPRO SEGÉDAPP-CSOPORT</span>
        <h2>Digitális segédappok · termék- és licenckatalógus</h2>
        <p>Önálló, kisebb alkalmazások a közös DIMPRO-fiókrendszerhez előkészítve.
          Nem képezik az ötszintű fő termékarchitektúra újabb szintjét.</p>
      </div>
      <span className={styles.planned}>5 tervezett termék</span>
    </header>
    <div className={styles.grid}>
      {DIMPRO_MINI_APPS.map((app,index)=>{
        const Icon=icons[index];
        return <article className={styles.item} key={app.code}>
          <div className={styles.itemHeader}>
            <span className={styles.icon}><Icon size={20}/></span>
            <span className={styles.state}>Licenc előkészítés alatt</span>
          </div>
          <strong className={styles.name}>{app.name}</strong>
          <p>{app.description}</p>
          <div className={styles.details}>
            <span>Javasolt licenctípus</span>
            <strong>{app.licenseScopes.map(scope=>scopeLabels[scope]).join(" / ")}</strong>
          </div>
          <div className={styles.details}>
            <span>Termékkód</span>
            <code>{app.code}</code>
          </div>
          {app.code==="DIMPRO_ONE_EGESZSEG"&&<p className={styles.healthNote}>
            Az egészségügyi adatok nem részei a Licencközpont terméknyilvántartásának.
            Külön adatvédelmi és hozzáférési szabályok szükségesek.
          </p>}
        </article>;
      })}
    </div>
    <footer className={styles.footer}>
      <Info size={16}/>
      <span>Az alkalmazásokat a központi terméktörzsben előkészítettük. Egyelőre nincs aktivált kereskedelmi licenc,
        jóváhagyott ár, kiadott csomag, automatikus fiókhozzáférés vagy új tárhely.
        A funkciók termékenként, külön ellenőrzés és jóváhagyás után kapcsolhatók be.</span>
    </footer>
  </section>;
}
