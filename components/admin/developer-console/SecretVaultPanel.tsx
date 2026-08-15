"use client";
import { KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SecretVaultReadiness } from "@/app/lib/dev-center/terminal-hub/secret-vault";
import styles from "./DeveloperConsole.module.css";
function headers(){const key=localStorage.getItem("dimproLicenseAdminKey")?.trim()||"";return {"x-dimpro-license-admin-key":key};}
export default function SecretVaultPanel(){
  const [data,setData]=useState<SecretVaultReadiness|null>(null); const [error,setError]=useState("");
  const load=useCallback(async()=>{try{const r=await fetch("/api/dev/terminal-hub/secret-vault/readiness",{headers:headers(),cache:"no-store"});const p=await r.json().catch(()=>null) as {ok?:boolean;readiness?:SecretVaultReadiness;error?:string}|null;if(!r.ok||!p?.ok||!p.readiness)throw new Error(p?.error||"Secret Vault readiness hiba.");setData(p.readiness);setError("");}catch(e){setError(e instanceof Error?e.message:"Secret Vault readiness hiba.");}},[]);
  useEffect(()=>{void load();},[load]);
  return <section className={styles.secretVaultPanel} data-enabled={data?.enabled?"true":"false"}>
    <header><div><KeyRound size={18}/><span><small>P9 · SECRET VAULT</small><strong>Referencia-alapú titokkezelés · skeleton</strong></span></div><div><b>{data?.state||"LOADING"}</b><button type="button" onClick={()=>void load()} title="Secret Vault readiness frissítése"><RefreshCw size={14}/></button></div></header>
    {error?<p>{error}</p>:null}
    <div className={styles.secretVaultPolicy}><span><ShieldCheck size={14}/> AI csak referencianevet láthat</span><span><LockKeyhole size={14}/> Raw secret AI: SOHA</span><span>Browser secret storage: TILTVA</span><span>GET/PUT API: NINCS</span></div>
    <footer>{data?.blockers?.join(" · ")||"A storage adapter és secret műveletek szándékosan nincsenek aktiválva."}</footer>
  </section>;
}
