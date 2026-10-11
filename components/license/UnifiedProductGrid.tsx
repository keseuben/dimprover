"use client";
import {useMemo,useState} from "react";
import {ArrowDownAZ,Search} from "lucide-react";
import {DIMPRO_PRODUCTS} from "@/app/lib/license/dimproProductArchitecture";
import {DIMPRO_DROP_SERVICE} from "@/app/lib/license/dimproDropServiceCatalog";
import {DIMPRO_MINI_APPS} from "@/app/lib/license/dimproMiniAppCatalog";
import styles from "./UnifiedProductGrid.module.css";

type Row={code:string;name:string;group:string;scopes:string;status:string;relation:string};
const scopeNames:Record<string,string>={USER:"Személyes",ORGANIZATION:"Szervezeti",PROJECT:"Projekt"};
const catalog:Row[]=[
  ...DIMPRO_PRODUCTS.map(item=>({
    code:item.code,name:item.name,
    group:item.role==="SHARED_SERVICE"?"Közös szolgáltatás":"Fő termék",
    scopes:item.licenseScopes.map(s=>scopeNames[s]).join(" / "),
    status:item.currentCommercialRecord==="PROJECT_LICENSE_SOURCE_ONLY"?"Licencforrás előkészítve":"Tervezett",
    relation:item.architecturalLevel===null?"Önálló, közös fájltár":String(item.architecturalLevel)+". termékszint",
  })),
  {code:DIMPRO_DROP_SERVICE.code,name:DIMPRO_DROP_SERVICE.name,group:"Közös szolgáltatás",
    scopes:DIMPRO_DROP_SERVICE.licenseScopes.map(s=>scopeNames[s]).join(" / "),
    status:"Régi licenc működik / központi átállás tervezett",
    relation:"Önálló fájlküldő, opcionális Drive-kapcsolat"},
  ...DIMPRO_MINI_APPS.map(item=>({
    code:item.code,name:item.name,group:"Digitális segédapp",
    scopes:item.licenseScopes.map(s=>scopeNames[s]).join(" / "),
    status:"Licenc előkészítés alatt",
    relation:item.relatedPrimaryProduct??"Önálló segédapp",
  })),
];
export default function UnifiedProductGrid(){
  const [query,setQuery]=useState("");
  const [group,setGroup]=useState("all");
  const [ascending,setAscending]=useState(true);
  const matches=useMemo(()=>catalog.filter(item=>
    (group==="all"||item.group===group)&&
    [item.code,item.name,item.status,item.scopes,item.group].some(value=>
      value.toLocaleLowerCase("hu-HU").includes(query.trim().toLocaleLowerCase("hu-HU")))
  ).sort((a,b)=>ascending?a.name.localeCompare(b.name,"hu-HU"):b.name.localeCompare(a.name,"hu-HU")),[query,group,ascending]);
  return <section className={styles.shell} data-testid="unified-product-grid">
    <header className={styles.heading}><div><h2>DIMPRO termékjegyzék</h2>
      <p>Öt fő termékszint, két külön fájlszolgáltatás és öt digitális segédapp, egy központi nyilvántartásban.</p>
    </div><strong>{matches.length} / {catalog.length} termék</strong></header>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)}
        aria-label="Termékek keresése" placeholder="Keresés termék, kód, licenctípus szerint"/></label>
      <select aria-label="Termékcsoport" value={group} onChange={event=>setGroup(event.target.value)}>
        <option value="all">Minden termékcsoport</option><option value="Fő termék">Fő termékek</option>
        <option value="Közös szolgáltatás">Drive / Drop</option>
        <option value="Digitális segédapp">Digitális segédappok</option>
      </select>
      <button type="button" onClick={()=>setAscending(!ascending)}><ArrowDownAZ size={15}/> Név {ascending?"A–Z":"Z–A"}</button>
    </div>
    <div className={styles.scroll}><table className={styles.table}><thead><tr>
      <th>Termék / azonosító</th><th>Terméktípus</th><th>Tervezett licencscope</th><th>Licencállapot</th><th>Kapcsolat</th>
    </tr></thead><tbody>
      {matches.map(item=><tr key={item.code}>
        <td><strong>{item.name}</strong><small>{item.code}</small></td>
        <td>{item.group}</td><td>{item.scopes}</td>
        <td><span className={styles.status}>{item.status}</span></td><td>{item.relation}</td>
      </tr>)}
      {matches.length===0&&<tr><td colSpan={5} className={styles.empty}>Nincs a szűrésnek megfelelő termék.</td></tr>}
    </tbody></table></div>
    <p className={styles.notice}>A katalógus nem számlázási adatforrás, és önmagában nem ad termékjogosultságot. A Drop meglévő licencei változatlanul működnek az egységesítésig.</p>
  </section>;
}
