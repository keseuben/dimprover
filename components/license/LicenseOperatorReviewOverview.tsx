"use client";

import {useMemo,useState} from "react";
import {Check,LockKeyhole,ShieldCheck,X} from "lucide-react";
import {
  evaluateLicenseApproval,LICENSE_ACTIVATION_RELEASED,LICENSE_OPERATOR_ROLES,
  LICENSE_OPERATOR_PERMISSIONS,licenseRoleHasPermission,
  type LicenseOperatorRoleCode,
} from "@/app/lib/license/licenseOperatorPolicy";
import styles from "./LicenseOperatorReviewOverview.module.css";

const scenario={
  requestId:"14544d2c-4fe1-4c09-82f3-935d5a8b4b45",
  requesterUserId:"24544d2c-4fe1-4c09-82f3-935d5a8b4b45",
  ownerId:"34544d2c-4fe1-4c09-82f3-935d5a8b4b45",
  payerId:"34544d2c-4fe1-4c09-82f3-935d5a8b4b45",
  financeId:"44544d2c-4fe1-4c09-82f3-935d5a8b4b45",
  securityId:"54544d2c-4fe1-4c09-82f3-935d5a8b4b45",
} as const;

const steps=[
  {title:"Kérelem előkészítése",role:"Licencügyintéző",description:"Ügyfél, termék, csomag, fizető, indoklás és lejárat ellenőrzése"},
  {title:"Pénzügyi felülvizsgálat",role:"Pénzügyi ellenőr",description:"Számla vagy díjfizetés megfelelő, ellenőrzött hivatkozásának rögzítése"},
  {title:"Biztonsági jóváhagyás",role:"Biztonsági jóváhagyó",description:"Eltérő személy, projekt- és termékjogosultságok, tulajdonos és scope ellenőrzése"},
  {title:"Kiadási kapu",role:"Külön éles release",description:"A jóváhagyott kérelem önmagában nem ad hozzáférést vagy fizetett licencet"},
] as const;

export default function LicenseOperatorReviewOverview(){
  const [selectedRole,setSelectedRole]=useState<LicenseOperatorRoleCode>("LICENSE_OPERATOR");
  const [billingEvidence,setBillingEvidence]=useState(false);
  const [financeApproved,setFinanceApproved]=useState(false);
  const [securityApproved,setSecurityApproved]=useState(false);
  const [sameReviewer,setSameReviewer]=useState(false);
  const approval=useMemo(()=>evaluateLicenseApproval({
    requestId:scenario.requestId,
    requesterUserId:scenario.requesterUserId,
    ownerId:scenario.ownerId,productCode:"DRIVE",scope:"USER",planCode:"DRIVE_PERSONAL_PRO",
    payerType:"USER",payerId:scenario.payerId,
    reason:"Bemutató tesztlicenc-kérelem ellenőrzése",
    proposedExpiry:"2099-12-31T00:00:00Z",
    billingEvidenceRef:billingEvidence?"DEMO-INVOICE-0001":null,
    financeReviewerId:financeApproved?scenario.financeId:null,
    financeApprovedAt:financeApproved?"2026-10-11T12:00:00Z":null,
    securityReviewerId:securityApproved?(sameReviewer?scenario.financeId:scenario.securityId):null,
    securityApprovedAt:securityApproved?"2026-10-11T13:00:00Z":null,
    rejected:false,cancelled:false,
  }),[billingEvidence,financeApproved,securityApproved,sameReviewer]);

  return <div className={styles.shell} data-testid="license-operator-readonly">
    <header className={styles.heading}>
      <div>
        <h2><ShieldCheck size={19}/> Licencközpont – jogosultsági és jóváhagyási rend</h2>
        <p>Tervezeti szerepkör-mátrix és helyi ellenőrzési szimuláció. Nem azonosít valós operátort, nem olvas ügyfélkérelmeket és nem módosít központi AUTH-adatot.</p>
      </div>
      <span className={styles.lock}><LockKeyhole size={14}/> Kiadás zárolva</span>
    </header>

    <section className={styles.panel} aria-label="Licencadmin szerepkörök">
      <div className={styles.panelHeading}><strong>Operátori szerepkörök és jogosultságok</strong><span>6 szerepkör · 8 jogosultság</span></div>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th>Szerepkör</th>{LICENSE_OPERATOR_PERMISSIONS.map(permission=>
          <th key={permission} title={permission}>{permission.split(".").slice(1).join(".")}</th>)}</tr></thead>
        <tbody>{LICENSE_OPERATOR_ROLES.map(role=><tr key={role.code}>
          <td><strong>{role.label}</strong><small>{role.description}</small></td>
          {LICENSE_OPERATOR_PERMISSIONS.map(permission=><td key={permission} className={styles.center}>
            {licenseRoleHasPermission(role.code,permission)?
              <Check size={15} className={styles.yes} aria-label="Joga van"/>:
              <X size={14} className={styles.no} aria-label="Nincs joga"/>}
          </td>)}
        </tr>)}</tbody></table></div>
      <div className={styles.explainer}>
        <label>Jogosultságok ellenőrzése szerepkör szerint
          <select value={selectedRole} onChange={event=>
            setSelectedRole(event.target.value as LicenseOperatorRoleCode)}>
            {LICENSE_OPERATOR_ROLES.map(role=><option key={role.code} value={role.code}>{role.label}</option>)}
          </select>
        </label>
        <span>Az adott szerepkör {LICENSE_OPERATOR_PERMISSIONS.filter(permission=>
          licenseRoleHasPermission(selectedRole,permission)).length} jogosultsággal rendelkezhet, ha az operátor később érvényes központi AUTH-hozzárendelést kap.</span>
      </div>
    </section>

    <section className={styles.panel} aria-label="Licenckiadás szakaszai">
      <div className={styles.panelHeading}><strong>Kiadási folyamat</strong><span>Előkészítés → két ellenőrzés → külön release</span></div>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th>Szakasz</th><th>Felelős</th><th>Kötelező ellenőrzés</th><th>Éles hozzáférést ad?</th></tr></thead>
        <tbody>{steps.map((step,index)=><tr key={step.title}>
          <td><strong>{index+1}. {step.title}</strong></td><td>{step.role}</td>
          <td>{step.description}</td><td><span className={styles.noAccess}>Nem</span></td>
        </tr>)}</tbody></table></div>
    </section>

    <section className={styles.panel} aria-label="Jóváhagyási logika ellenőrzése">
      <div className={styles.panelHeading}><strong>Jóváhagyási szabályok szimulációja</strong><span>Csak helyi demonstráció</span></div>
      <p className={styles.detail}>Az alábbi kapcsolók kizárólag mintapéldányon mutatják a szabályok eredményét. Nem jelentenek megtörtént pénzügyi vagy biztonsági jóváhagyást.</p>
      <div className={styles.controls}>
        <label><input type="checkbox" checked={billingEvidence} onChange={e=>setBillingEvidence(e.target.checked)}/> Ellenőrzött pénzügyi bizonylathivatkozás</label>
        <label><input type="checkbox" checked={financeApproved} onChange={e=>setFinanceApproved(e.target.checked)}/> Pénzügyi ellenőr jóváhagyta</label>
        <label><input type="checkbox" checked={securityApproved} onChange={e=>setSecurityApproved(e.target.checked)}/> Biztonsági ellenőr jóváhagyta</label>
        <label><input type="checkbox" checked={sameReviewer} onChange={e=>setSameReviewer(e.target.checked)}/> Ugyanaz a két jóváhagyó (tiltandó eset)</label>
      </div>
      <div className={styles.result} role="status">
        <div><strong>Előnézeti eredmény: {approval.stage}</strong>
          <span>{approval.readyForRelease?"Az előkészítési feltételek a szimulációban teljesültek. Ez nem aktív licenc.":
            "A kérelem további ellenőrzést igényel; kiadás nem lehetséges."}</span></div>
        <span className={styles.lock}><LockKeyhole size={14}/> {LICENSE_ACTIVATION_RELEASED?"Kiadási kapu ellenőrzendő":"Éles aktiválás tiltva"}</span>
      </div>
      {approval.blockers.length>0&&<div className={styles.blockers}>
        <strong>Hátralévő ellenőrzések</strong>
        <div>{approval.blockers.map(code=><span key={code}>{code}</span>)}</div>
      </div>}
      <p className={styles.detail}>A szabályrendszer kizárja a saját kérelem jóváhagyását, valamint a pénzügyi és biztonsági jóváhagyó azonosságát. A tényleges operátori jogosultságot kizárólag későbbi szerveroldali AUTH-vizsgálat igazolhatja.</p>
    </section>
  </div>;
}
