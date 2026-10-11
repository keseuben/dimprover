"use client";

import {useState} from "react";
import {ArrowLeftRight,AlertTriangle,LockKeyhole,ShieldCheck} from "lucide-react";
import {
  evaluateSubscriptionPreview,PREVIEW_GIB_BYTES,type PreviewServiceStatus,
} from "@/app/lib/license/subscriptionPreviewPolicy";
import styles from "./SubscriptionImpactPreview.module.css";

type Context="PERSONAL"|"PROJECT"|"GATE";
const SIZE_CHOICES=[5,10,25,50,100,250,500] as const;
const GATE_CHOICES=[{name:"Alap",editors:10},{name:"Pro",editors:25},{name:"Enterprise",editors:100}] as const;
const integer=(v:string,max=100000)=>Math.min(max,Math.max(0,Math.floor(Number(v)||0)));
const format=(n:number)=>n.toLocaleString("hu-HU",{maximumFractionDigits:2});

export default function SubscriptionImpactPreview(){
  const [context,setContext]=useState<Context>("PROJECT");
  const [size,setSize]=useState(25);
  const [gateEditors,setGateEditors]=useState(10);
  const [status,setStatus]=useState<PreviewServiceStatus>("ACTIVE");
  const [nowDate,setNowDate]=useState("2026-10-11");
  const [expiryDate,setExpiryDate]=useState("2026-10-25");
  const [used,setUsed]=useState(30);
  const [reserved,setReserved]=useState(5);
  const [editors,setEditors]=useState(7);
  const [readers,setReaders]=useState(20);
  const target={
    product:context==="GATE"?"PROJECT_GATE" as const:"DRIVE" as const,
    scope:context==="PERSONAL"?"PERSONAL" as const:"PROJECT" as const,
    quotaGiB:context==="GATE"?null:size,
    maxEditors:context==="GATE"?gateEditors:context==="PERSONAL"?1:10,
    maxReadOnly:context==="GATE"||context==="PERSONAL"?null:50,
  };
  const result=evaluateSubscriptionPreview({
    currentStatus:status,
    now:nowDate+"T12:00:00Z",
    expiresAt:expiryDate?expiryDate+"T12:00:00Z":null,
    target,
    usedBytes:Math.round(used*PREVIEW_GIB_BYTES),
    reservedBytes:Math.round(reserved*PREVIEW_GIB_BYTES),
    activeEditors:editors,readOnlyMembers:readers,
  });
  return <section className={styles.panel} aria-label="Csomagváltás és licenclejárat hatásvizsgálata">
    <header className={styles.header}>
      <div>
        <h2><ArrowLeftRight size={18}/> Csomagváltás és lejárat – hatásvizsgálat</h2>
        <p>Demóadatokkal működő, kizárólag előnézeti döntéstámogatás. Nincs adatbázis-lekérdezés, mentés, fájltörlés, hozzáférésmódosítás vagy fizetési művelet.</p>
      </div>
      <span className={styles.locked}><LockKeyhole size={14}/> Csak szimuláció</span>
    </header>
    <div className={styles.tabs} role="group" aria-label="Szimulált licenc">
      {([{id:"PERSONAL",label:"Saját Drive"},{id:"PROJECT",label:"Projekt Drive"},{id:"GATE",label:"Projektkapu"}] as const).map(t=><button
        key={t.id} type="button" onClick={()=>{setContext(t.id);setEditors(t.id==="PERSONAL"?1:7);setReaders(t.id==="PERSONAL"?0:20);}} aria-pressed={context===t.id}
        className={context===t.id?styles.active:""}>{t.label}</button>)}
    </div>
    <div className={styles.grid}>
      <label>Jelenlegi licencállapot
        <select value={status} onChange={e=>setStatus(e.target.value as PreviewServiceStatus)}>
          <option value="ACTIVE">Aktív</option><option value="PENDING">Jóváhagyásra vár</option>
          <option value="EXPIRED">Lejárt</option><option value="SUSPENDED">Felfüggesztett</option>
          <option value="NONE">Nem rendelt licenc</option>
        </select>
      </label>
      <label>Vizsgálat napja (szimulált, UTC)
        <input type="date" value={nowDate} onChange={e=>setNowDate(e.target.value||"2026-10-11")}/>
      </label>
      <label>Lejárati dátum (szimulált, UTC)
        <input type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/>
      </label>
      {context==="GATE"?<label>Cél Projektkapu-csomag
        <select value={gateEditors} onChange={e=>setGateEditors(Number(e.target.value))}>
          {GATE_CHOICES.map(g=><option key={g.name} value={g.editors}>{g.name} · {g.editors} aktív résztvevő</option>)}
        </select>
      </label>:<label>Cél tárhelykeret
        <select value={size} onChange={e=>setSize(Number(e.target.value))}>
          {SIZE_CHOICES.map(t=><option value={t} key={t}>{t} GiB</option>)}
        </select>
      </label>}
      {context!=="GATE"&&<>
        <label>Foglalt tárhely (GiB)
          <input type="number" min="0" max="100000" step="1" value={used}
            onChange={e=>setUsed(integer(e.target.value))}/>
        </label>
        <label>Folyamatban lévő feltöltési foglalás (GiB)
          <input type="number" min="0" max="100000" step="1" value={reserved}
            onChange={e=>setReserved(integer(e.target.value))}/>
        </label>
      </>}
      <label>Aktív szerkesztők / résztvevők
        <input type="number" min="0" max="100000" value={editors}
          onChange={e=>setEditors(integer(e.target.value))}/>
      </label>
      {context==="PROJECT"&&<label>Csak olvasó projekttagok
        <input type="number" min="0" max="100000" value={readers}
          onChange={e=>setReaders(integer(e.target.value))}/>
      </label>}
    </div>
    <div className={styles.output}>
      <div className={styles.outcome}>
        {result.switchDecision==="BLOCKED_UNTIL_RECONCILED"
          ?<AlertTriangle size={20}/>:<ShieldCheck size={20}/>}
        <div><strong>{result.switchDecision==="BLOCKED_UNTIL_RECONCILED"
          ?"Csomagváltás előtt rendezés szükséges":"Üzemeltetői jóváhagyásra előkészíthető"}</strong>
        <small>Javasolt lejárati működés: {result.mode==="GRACE_RECOMMENDED"?"Türelmi idő"
          :result.mode==="READ_ONLY_RECOMMENDED"?"Adatmegőrző, csak olvasási állapot"
          :result.mode==="ACTIVE"?"Aktív":result.mode==="PENDING"?"Jóváhagyásra vár":"Külön üzemeltetői vizsgálat"}</small></div>
      </div>
      <div className={styles.metrics}>
        <div><small>Tárhely-túllépés</small><strong>{format(result.capacityShortfallGiB)} GiB</strong></div>
        <div><small>Többlet szerkesztő / aktív tag</small><strong>{result.editorShortfall} fő</strong></div>
        <div><small>Többlet olvasó</small><strong>{result.readerShortfall} fő</strong></div>
      </div>
      {result.reasons.map((reason,i)=><p key={i} className={styles.reason}>{reason}</p>)}
      <p className={styles.guarantee}><ShieldCheck size={15}/> Fájlok és verziók automatikus törlése: TILOS. Jogosultság, kvóta és számlázás módosítása: NEM TÖRTÉNIK.</p>
    </div>
    <p className={styles.disclaimer}>A 14 napos türelmi idő, a lejárat utáni read-only modell és az egyes tagszámok egyelőre jóváhagyandó javaslatok. A valódi állapothoz a központi AUTH licencet, a projekt-ACL-t és a fizikai storage engine-t kell később hitelesen összekötni. Az itt begépelt értékek nem valós felhasználói adatok.</p>
  </section>;
}
