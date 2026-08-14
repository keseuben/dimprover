"use client";

import { Ban, Check, KeyRound, Laptop, LockKeyhole, RefreshCw, ShieldCheck, Timer, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WindowsBridgeReadiness } from "@/app/lib/dev-center/terminal-hub/windows-bridge";
import type { WindowsBridgeDeviceSummary } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import type { WindowsBridgeMigrationReadiness } from "@/app/lib/dev-center/terminal-hub/windows-bridge-migration-readiness";
import styles from "./DeveloperConsole.module.css";

function adminHeaders(json=false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json?{"content-type":"application/json"}:{}), "x-dimpro-license-admin-key": key };
}

type PairingView={pairingId:string;code:string;expiresAt:string;maxAttempts:number};

export default function WindowsBridgePanel() {
  const [readiness, setReadiness] = useState<WindowsBridgeReadiness | null>(null);
  const [devices,setDevices]=useState<WindowsBridgeDeviceSummary[]>([]);
  const [migration,setMigration]=useState<WindowsBridgeMigrationReadiness|null>(null);
  const [pairing,setPairing]=useState<PairingView|null>(null);
  const [error, setError] = useState("");
  const [notice,setNotice]=useState("");
  const [busy, setBusy] = useState(false);
  const [now,setNow]=useState(()=>Date.now());

  const loadDevices=useCallback(async()=>{
    const response=await fetch("/api/dev/terminal-hub/windows-bridge/devices",{headers:adminHeaders(),cache:"no-store"});
    const payload=await response.json().catch(()=>null) as {ok?:boolean;devices?:WindowsBridgeDeviceSummary[];error?:string}|null;
    if(!response.ok||!payload?.ok) throw new Error(payload?.error||"A Windows Bridge device lista nem tölthető be.");
    setDevices(payload.devices||[]);
  },[]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [response,migrationResponse] = await Promise.all([
        fetch("/api/dev/terminal-hub/windows-bridge/readiness", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/dev/terminal-hub/windows-bridge/migration-readiness", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const payload = await response.json().catch(() => null) as { ok?: boolean; readiness?: WindowsBridgeReadiness; error?: string } | null;
      const migrationPayload = await migrationResponse.json().catch(() => null) as { ok?: boolean; migration?: WindowsBridgeMigrationReadiness; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.readiness) throw new Error(payload?.error || "A Windows Bridge readiness nem tölthető be.");
      if (!migrationResponse.ok || !migrationPayload?.ok || !migrationPayload.migration) throw new Error(migrationPayload?.error || "A Windows Bridge migration readiness nem tölthető be.");
      setReadiness(payload.readiness);
      setMigration(migrationPayload.migration);
      if(payload.readiness.bridgeEnabled) await loadDevices(); else setDevices([]);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A Windows Bridge readiness nem tölthető be."); }
    finally { setBusy(false); }
  }, [loadDevices]);

  useEffect(() => { void load(); }, [load]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[]);
  const pairingSeconds=useMemo(()=>pairing?Math.max(0,Math.ceil((new Date(pairing.expiresAt).getTime()-now)/1000)):0,[now,pairing]);
  useEffect(()=>{if(pairing&&pairingSeconds===0)setPairing(null)},[pairing,pairingSeconds]);

  async function createPairing(){
    setBusy(true);setError("");setNotice("");
    try{const response=await fetch("/api/dev/terminal-hub/windows-bridge/pairings",{method:"POST",headers:adminHeaders(true)});const payload=await response.json().catch(()=>null) as {ok?:boolean;pairing?:PairingView;error?:string}|null;if(!response.ok||!payload?.ok||!payload.pairing)throw new Error(payload?.error||"Pairing nem hozható létre.");setPairing(payload.pairing);setNotice("Egyszer használatos pairing elkészült. A kód csak ebben a memóriabeli nézetben látható.");}catch(caught){setError(caught instanceof Error?caught.message:"Pairing nem hozható létre.")}finally{setBusy(false)}
  }
  async function approve(deviceId:string){
    setBusy(true);setError("");try{const response=await fetch(`/api/dev/terminal-hub/windows-bridge/devices/${deviceId}/approve`,{method:"POST",headers:adminHeaders()});const payload=await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;if(!response.ok||!payload?.ok)throw new Error(payload?.error||"A device nem hagyható jóvá.");setNotice("Device jóváhagyva. Az agent a következő pollnál egyszer kap device tokent.");await loadDevices()}catch(caught){setError(caught instanceof Error?caught.message:"A device nem hagyható jóvá.")}finally{setBusy(false)}
  }
  async function revoke(deviceId:string){
    setBusy(true);setError("");try{const response=await fetch(`/api/dev/terminal-hub/windows-bridge/devices/${deviceId}/revoke`,{method:"POST",headers:adminHeaders(true),body:JSON.stringify({reason:"admin_revoked_from_console"})});const payload=await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;if(!response.ok||!payload?.ok)throw new Error(payload?.error||"A device nem vonható vissza.");setNotice("Device token visszavonva; aktív session lezárva.");await loadDevices()}catch(caught){setError(caught instanceof Error?caught.message:"A device nem vonható vissza.")}finally{setBusy(false)}
  }

  const canPair=Boolean(readiness?.bridgeEnabled&&readiness?.pairingEnabled&&readiness?.security.pairingSecretConfigured);
  const migrationSafetyOk=Boolean(migration&&Object.values(migration.safety).every(Boolean));
  return (
    <section className={styles.windowsBridgePanel} data-enabled={readiness?.bridgeEnabled ? "true" : "false"}>
      <header>
        <div><Laptop size={18} /><div><span>WINDOWS DESKTOP BRIDGE · P8.1</span><strong>Agent identity · one-time pairing · approval · revoke · heartbeat</strong></div></div>
        <div><b>{readiness?.state || "LOADING"}</b><button type="button" onClick={() => void load()} disabled={busy} title="Windows Bridge readiness frissítése"><RefreshCw size={14} /></button></div>
      </header>
      {error ? <div className={styles.windowsBridgeError}>{error}</div> : null}
      {notice?<div className={styles.windowsBridgeNotice}>{notice}</div>:null}
      <div className={styles.windowsBridgeGrid}>
        <article><ShieldCheck size={16} /><span>Transport</span><strong>{readiness?.security.transport || "OUTBOUND_HTTPS_ONLY"}</strong><small>Nincs bejövő Windows port és nincs böngésző → localhost bridge.</small></article>
        <article><LockKeyhole size={16} /><span>Credential</span><strong>{readiness?.security.credentialStore || "WINDOWS_CREDENTIAL_MANAGER_OR_DPAPI"}</strong><small>Device token DB-ben csak hash; Windows oldalon DPAPI.</small></article>
        <article><WifiOff size={16} /><span>PowerShell execution</span><strong>{readiness?.executionEnabled ? "GATE ON" : "OFF"}</strong><small>P8.1 heartbeat parancslistája kötelezően üres.</small></article>
      </div>
      <div className={styles.windowsBridgeSecurityRow}><span>RAW: jogosult emberi UI</span><span>SANITIZED: AI szűrt</span><span>AUDIT: maszkolt meta</span><span>PROD: TILTVA</span></div>

      <section className={styles.windowsBridgeMigrationArea} data-ready={migration?.readyForApplyAttempt ? "true" : "false"}>
        <header><div><ShieldCheck size={15}/><strong>DB MIGRATION READINESS</strong></div><b>{migration?.readyForApplyAttempt?"APPLY GATE READY":"BLOKKOLT"}</b></header>
        <div className={styles.windowsBridgeMigrationGrid}>
          <span data-ok={migration?.configuration.expectedDevTargetConfigured?"true":"false"}><b>DEV target</b><small>{migration?.configuration.expectedDevTargetConfigured?"rendben":"hiányzik"}</small></span>
          <span data-ok={migration?.configuration.databaseUrlConfigured?"true":"false"}><b>DB URL</b><small>{migration?.configuration.databaseUrlConfigured?"secure env-ben":"hiányzik"}</small></span>
          <span data-ok={migration?.configuration.databasePasswordConfigured?"true":"false"}><b>DB jelszó</b><small>{migration?.configuration.databasePasswordConfigured?"secure env-ben":"hiányzik"}</small></span>
          <span data-ok={migration?.configuration.productionTargetConfigured?"true":"false"}><b>PROD target</b><small>{migration?.configuration.productionTargetConfigured?"elkülönítés ellenőrizhető":"hiányzik"}</small></span>
          <span data-ok={migration?.configuration.pairingSecretConfigured?"true":"false"}><b>Pairing secret</b><small>{migration?.configuration.pairingSecretConfigured?"provisionálva":"nincs provisionálva"}</small></span>
          <span data-ok={migration?.artifact.sha256Valid?"true":"false"}><b>Migration SHA</b><small>{migration?.artifact.sha256Valid?"érvényes":"hibás / hiányzik"}</small></span>
          <span data-ok={migration?.readyForPreflight?"true":"false"}><b>DB preflight</b><small>{migration?.readyForPreflight?"indítható":"nem indítható"}</small></span>
          <span data-ok={migrationSafetyOk?"true":"false"}><b>Apply safety</b><small>{migrationSafetyOk?"minden kapcsoló OFF":"kapcsoló nem biztonságos"}</small></span>
        </div>
        {migration?.blockers.length?<ul>{migration.blockers.map(item=><li key={item}>{item}</li>)}</ul>:<p>A readiness zöld; SQL apply továbbra is csak explicit DEV-only approval mellett engedélyezett.</p>}
      </section>

      <section className={styles.windowsBridgePairingArea}>
        <header><div><KeyRound size={15}/><strong>ONE-TIME PAIRING</strong></div><button type="button" onClick={()=>void createPairing()} disabled={!canPair||busy}><KeyRound size={14}/> Új pairing</button></header>
        {pairing?<div className={styles.windowsBridgePairingCode}><div><span>Pairing ID</span><code>{pairing.pairingId}</code></div><div><span>Egyszeri kód</span><strong>{pairing.code}</strong></div><div><Timer size={14}/><b>{pairingSeconds}s</b><small>max. {pairing.maxAttempts} hibás próbálkozás</small></div></div>:<p>{canPair?"Nincs aktív pairing. A létrehozott kód nem kerül localStorage-ba és nem kérhető le újra.":"Pairing jelenleg fail-closed: Bridge / Pairing / Secret gate nincs teljesen engedélyezve."}</p>}
      </section>

      <section className={styles.windowsBridgeDeviceArea}>
        <header><strong>DEVICE-EK</strong><span>{devices.length} db</span></header>
        {devices.length?devices.map(device=><article key={device.id} data-status={device.status}><div><strong>{device.deviceLabel}</strong><span>{device.agentId}</span><small>{device.osVersion} · PowerShell {device.powershellVersion||"—"}</small></div><div><b>{device.status.toUpperCase()}</b><small>{device.lastSeenAt?`Utolsó heartbeat: ${new Date(device.lastSeenAt).toLocaleString("hu-HU")}`:"Még nincs heartbeat"}</small></div><div>{device.status==="pending"?<button type="button" onClick={()=>void approve(device.id)} disabled={!canPair||busy}><Check size={14}/> Jóváhagyás</button>:null}{["approved","active"].includes(device.status)?<button type="button" onClick={()=>void revoke(device.id)} disabled={!readiness?.bridgeEnabled||busy}><Ban size={14}/> Visszavonás</button>:null}</div></article>):<p>Nincs regisztrált Windows Bridge device, vagy a Bridge főflag OFF.</p>}
      </section>

      <ul>{(readiness?.blockers || ["Windows Bridge feature flag OFF.", "Windows Bridge pairing kill switch OFF.", "Windows Bridge execution kill switch OFF."]).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      <footer>Protocol v{readiness?.protocolVersion || 1} · pairing max. {readiness?.security.oneTimePairingMaxAgeSeconds || 600}s · device token nyersen nem tárolható · PowerShell execution P8.1-ben NINCS</footer>
    </section>
  );
}
