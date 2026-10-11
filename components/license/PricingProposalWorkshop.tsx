"use client";
import {useMemo,useState} from "react";
import {Calculator,Database,Info,LockKeyhole,RefreshCcw,Users} from "lucide-react";
import {
  DEFAULT_PRICING_ASSUMPTIONS,estimateDriveStorageCost,
  projectProposalMargin,PROPOSED_COMMERCIAL_TIERS,
  type PricingAssumptions,type PricingProduct,
} from "@/app/lib/license/pricingProposalV1";
import styles from "./PricingProposalWorkshop.module.css";

const hu=(n:number)=>Math.round(n).toLocaleString("hu-HU");
const groups:readonly {product:PricingProduct;label:string}[]=[
  {product:"PERSONAL_DRIVE",label:"Saját Drive"},
  {product:"PROJECT_DRIVE",label:"Projekt Drive"},
  {product:"PROJECT_GATE",label:"Projektkapu"},
];
const fields:readonly {key:keyof PricingAssumptions;label:string;step:number;unit:string;min:number;max:number}[]=[
  {key:"eurHuf",label:"Tervezési EUR/Ft",step:5,unit:"Ft",min:100,max:1000},
  {key:"usdHuf",label:"Tervezési USD/Ft",step:5,unit:"Ft",min:100,max:1000},
  {key:"primaryEurPerTerabyte",label:"Elsődleges tárolás",step:0.5,unit:"EUR/TB/hó",min:0.1,max:200},
  {key:"independentBackupUsdPerTerabyte",label:"Külön mentési tár",step:0.5,unit:"USD/TB/hó",min:0.1,max:200},
  {key:"oldVersionFactor",label:"Verziószorzó",step:0.1,unit:"×",min:1,max:5},
  {key:"backupRetentionFactor",label:"Mentési szorzó",step:0.1,unit:"×",min:1,max:5},
  {key:"personalPlatformOverheadHuf",label:"Saját Drive havi közös költségkeret",step:100,unit:"Ft",min:0,max:200000},
  {key:"projectPlatformOverheadHuf",label:"Projekt Drive havi közös költségkeret",step:100,unit:"Ft",min:0,max:200000},
  {key:"riskReserveFraction",label:"Tartalék (0,25 = 25%)",step:0.05,unit:"arány",min:0,max:2},
];

export default function PricingProposalWorkshop(){
  const [product,setProduct]=useState<PricingProduct>("PROJECT_DRIVE");
  const [input,setInput]=useState<PricingAssumptions>({...DEFAULT_PRICING_ASSUMPTIONS});
  const [exampleGiB,setExampleGiB]=useState(500);
  const draftRows=PROPOSED_COMMERCIAL_TIERS.filter(x=>x.product===product);
  const preview=useMemo(()=>estimateDriveStorageCost(exampleGiB,"PROJECT_DRIVE",input),[exampleGiB,input]);
  const productName=groups.find(x=>x.product===product)?.label||product;
  return <section className={styles.wrapper} aria-label="Belső licencár-javaslat és tárhelyköltség modellezés">
    <header className={styles.header}>
      <div>
        <h2><Calculator size={18}/> Licencár és résztvevői keret – üzleti munkalap</h2>
        <p>Tájékoztató nettó Ft-árjavaslatok. Nem jóváhagyott tarifák, nem kerülnek bele az ügyféllicencekbe vagy a számlázásba. Az alábbi módosítások csak ezen a képernyőn láthatók.</p>
      </div>
      <span className={styles.locked}><LockKeyhole size={15}/> Nincs áraktiválás</span>
    </header>
    <div className={styles.tabs} role="group" aria-label="Termékárak">
      {groups.map(group=><button type="button" aria-pressed={product===group.product}
        className={product===group.product?styles.active:""} key={group.product}
        onClick={()=>setProduct(group.product)}>{group.label}</button>)}
    </div>
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Csomag / méret</th><th scope="col">Nettó havidíj – javaslat</th><th scope="col">Nettó éves díj – javaslat</th><th scope="col">Résztvevői keret – javaslat</th><th scope="col">Becsült költségfedezet*</th></tr></thead>
        <tbody>{draftRows.map(tier=>{
          const cost=projectProposalMargin(tier,input);
          return <tr key={tier.id}>
            <th scope="row">{tier.storageGiB===null?tier.name:tier.storageGiB+" GiB"}</th>
            <td><strong>{hu(tier.netMonthlyPriceHuf)} Ft</strong></td>
            <td>{hu(tier.netAnnualPriceHuf)} Ft</td>
            <td>{tier.product==="PERSONAL_DRIVE"?"1 személy":tier.product==="PROJECT_DRIVE"
                ?"10 szerkesztő + 50 olvasó":hu(tier.proposedActiveMembers||0)+" aktív résztvevő"}</td>
            <td>{cost?<span className={cost.estimatedContributionHuf<0?styles.negative:""}>
                {hu(cost.totalEstimatedCostHuf)} Ft becsült ráfordítás / {Math.round(cost.estimatedContributionPct)}% becsült fedezet
              </span>:"A modulműködés költségét külön kell mérni"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className={styles.footnote}>* A fedezet durva döntés-előkészítő becslés: a megadott tárolási díjak, verzió- és mentési szorzók, valamint feltételezett közös költségkeret alapján. Nem számviteli eredmény és nem igazolt önköltség. Az éves díj javasolt szabálya 10 havidíj / év (2 havi kedvezmény).</p>

    <div className={styles.costHeading}>
      <h3><Database size={17}/> Nagy tárhely – kapacitás és mentési kalkuláció</h3>
      <button className={styles.reset} type="button" onClick={()=>{
        setInput({...DEFAULT_PRICING_ASSUMPTIONS});setExampleGiB(500);
      }}><RefreshCcw size={14}/> Alaphelyzet</button>
    </div>
    <div className={styles.scenario}>
      <label className={styles.sizeLabel}>Tervezett csomagméret
        <select value={exampleGiB} onChange={event=>setExampleGiB(Number(event.target.value))}>
          {[5,10,25,50,100,250,500].map(size=><option key={size} value={size}>{size} GiB</option>)}
        </select>
      </label>
      <div className={styles.metrics}>
        <div><small>Fizetős logikai keret</small><strong>{hu(preview.quotaGiB)} GiB</strong></div>
        <div><small>Elsődleges tárhely verziókkal</small><strong>{hu(preview.primaryGiB)} GiB</strong></div>
        <div><small>Külön mentési tár</small><strong>{hu(preview.backupGiB)} GiB</strong></div>
        <div><small>Összes fizikai kapacitás</small><strong>{hu(preview.combinedPhysicalGiB)} GiB</strong></div>
      </div>
    </div>
    <div className={styles.inputs}>
      {fields.map(field=><label key={field.key}>{field.label}
        <span><input inputMode="decimal" type="number" min={field.min} max={field.max} step={field.step}
          value={input[field.key]} onChange={event=>{
            const next=Number(event.target.value);
            if(Number.isFinite(next)&&next>=field.min&&next<=field.max)
              setInput(current=>({...current,[field.key]:next}));
          }}/><small>{field.unit}</small></span>
      </label>)}
    </div>
    <div className={styles.costFooter}>
      <div><small>Modellezett fizikai tárolási költség</small><strong>{hu(preview.storageCostHuf)} Ft/hó</strong></div>
      <div><small>Projekt alapú közös költség és tartalék együtt</small>
        <strong>{hu(preview.totalEstimatedCostHuf)} Ft/hó</strong></div>
    </div>
    <p className={styles.notice}><Info size={16}/> Ez a számítás nem tartalmaz garantált ügyfélkapacitást, egyedi egress-túllépést, rendkívüli restore-t, új beruházást, adókat vagy a tényleges szerződéses kedvezményeket. A Hetzner alapdíja és a beszállítói minimumszámlázás több ügyfél között oszlik el; egyetlen ügyfélre vetítve az eredmény eltérhet. A termékek valós költségét a számlák és üzemeltetési adatok alapján még jóvá kell hagyni.</p>
    <p className={styles.policy}><Users size={16}/> Résztvevői javaslat: Projekt Drive – minden tárhelyméretnél 10 szerkesztő és 50 csak olvasó projekttag; Projektkapu – Alap 10, Pro 25, Enterprise 100 aktív résztvevő. A meghívott fél nem vásárol külön projektlicencet, de a hozzáféréshez mindig Project Core/ACL-engedély szükséges. Ez nem aktív kvóta.</p>
    <p className={styles.sources}>Támpontok (nem DIMPRO-számlaadatok): <a href="https://www.hetzner.com/storage/object-storage/" target="_blank" rel="noreferrer">Hetzner objektumtárhely</a> · <a href="https://www.backblaze.com/cloud-storage/pricing" target="_blank" rel="noreferrer">Backblaze B2</a> · <a href="https://dotroll.com/hu/szolgaltatasok/premium-vps/" target="_blank" rel="noreferrer">DotRoll VPS</a>. A vállalati szerződéses és aktuális díjakat külön ellenőrizni kell.</p>
    <span className={styles.visuallyHidden}>Aktuális termék: {productName}</span>
  </section>;
}
