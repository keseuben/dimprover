"use client";

import { LockKeyhole, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ProdReadiness } from "@/app/lib/dev-center/terminal-hub/prod-readiness";
import type { ProdReadOnlyConnectorReadiness } from "@/app/lib/dev-center/terminal-hub/prod-readonly-connector";
import type { ProdReadOnlyProbePlan } from "@/app/lib/dev-center/terminal-hub/prod-probe-plan";
import styles from "./DeveloperConsole.module.css";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

export default function ProdReadinessPanel() {
  const [readiness, setReadiness] = useState<ProdReadiness | null>(null);
  const [connector, setConnector] = useState<ProdReadOnlyConnectorReadiness | null>(null);
  const [selectedProbe, setSelectedProbe] = useState("PUBLIC_HEALTH");
  const [probePlan, setProbePlan] = useState<ProdReadOnlyProbePlan | null>(null);
  const [planMessage, setPlanMessage] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [response, connectorResponse] = await Promise.all([
        fetch("/api/dev/terminal-hub/prod-readiness", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/dev/terminal-hub/prod-connector/readiness", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const payload = await response.json().catch(() => null) as { ok?: boolean; readiness?: ProdReadiness; error?: string } | null;
      const connectorPayload = await connectorResponse.json().catch(() => null) as { ok?: boolean; connector?: ProdReadOnlyConnectorReadiness; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.readiness) throw new Error(payload?.error || "A PROD readiness nem tölthető be.");
      if (!connectorResponse.ok || !connectorPayload?.ok || !connectorPayload.connector) throw new Error(connectorPayload?.error || "A PROD connector readiness nem tölthető be.");
      setReadiness(payload.readiness);
      setConnector(connectorPayload.connector);
      const firstProbe = connectorPayload.connector.probeCatalog[0]?.id;
      if (firstProbe && !connectorPayload.connector.probeCatalog.some((item) => item.id === selectedProbe)) setSelectedProbe(firstProbe);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A PROD readiness nem tölthető be.");
    } finally { setBusy(false); }
  }, [selectedProbe]);

  useEffect(() => { void load(); }, [load]);

  async function buildProbePlan() {
    if (connector?.state !== "FOUNDATION_READY") { setPlanMessage("A connector foundation még nem READY; terv nem készül."); return; }
    setPlanBusy(true); setPlanMessage(""); setProbePlan(null);
    try {
      const response = await fetch("/api/dev/terminal-hub/prod-connector/plan", {
        method: "POST",
        headers: { ...adminHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ probeId: selectedProbe }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; plan?: ProdReadOnlyProbePlan; error?: string; code?: string } | null;
      if (!response.ok || !payload?.ok || !payload.plan) throw new Error(`${payload?.error || "A probe terv nem készíthető el."}${payload?.code ? ` · ${payload.code}` : ""}`);
      setProbePlan(payload.plan);
      setPlanMessage("Terv elkészült. Ez nem hálózati végrehajtás.");
    } catch (caught) {
      setPlanMessage(caught instanceof Error ? caught.message : "A probe terv nem készíthető el.");
    } finally { setPlanBusy(false); }
  }

  const state = readiness?.state || "DISABLED";
  return (
    <section className={styles.prodReadinessPanel} data-state={state}>
      <header>
        <div><ServerCog size={18} /><div><span>PROD READINESS · P10</span><strong>READ ONLY connector · AI BLOCKED · default deny</strong></div></div>
        <div><b>{state}</b><button type="button" onClick={() => void load()} disabled={busy} title="PROD readiness frissítése"><RefreshCw size={14} /></button></div>
      </header>
      {error ? <div className={styles.prodReadinessError}>{error}</div> : null}
      <div className={styles.prodReadinessPolicyGrid}>
        <article><LockKeyhole size={16} /><span>PROD alapállapot</span><strong>{readiness?.policy.productionDefault || "READ_ONLY"}</strong><small>Írás, restart, deploy és migráció alapból tiltott.</small></article>
        <article><ShieldCheck size={16} /><span>AI visibility</span><strong>{readiness?.policy.aiVisibility || "BLOCKED"}</strong><small>RAW PROD adat nem kerülhet AI kontextusba.</small></article>
        <article><ServerCog size={16} /><span>Külön connector</span><strong>{readiness?.connectorEnabled ? "READY FLAG" : "OFF"}</strong><small>Read-only smoke külön connectoron; terminal execution nem szükséges.</small></article>
      </div>
      <div className={styles.prodReadinessSafetyRow}>
        <span data-ok={!readiness?.safety.prodTerminalExecutionFlag}>PROD terminal: {readiness?.safety.prodTerminalExecutionFlag ? "ON · TILTOTT" : "OFF"}</span>
        <span data-ok={!readiness?.safety.terminalExecutionFlag}>Terminal execution: {readiness?.safety.terminalExecutionFlag ? "ON · TILTOTT" : "OFF"}</span>
        <span data-ok={!readiness?.safety.windowsBridgeExecutionFlag}>Windows execution: {readiness?.safety.windowsBridgeExecutionFlag ? "ON · TILTOTT" : "OFF"}</span>
        <span data-ok={Boolean(readiness?.policy.explicitApprovalRequired)}>Approval: KÖTELEZŐ</span>
        <span data-ok={Boolean(readiness?.policy.rollbackPointRequired)}>Rollback: KÖTELEZŐ</span>
      </div>
      <section className={styles.prodConnectorFoundation} data-state={connector?.state || "DISABLED"}>
        <header><div><LockKeyhole size={15} /><strong>P10.1 · READ-ONLY CONNECTOR FOUNDATION</strong></div><b>{connector?.state || "DISABLED"}</b></header>
        <div className={styles.prodConnectorReferenceGrid}>
          <span data-ok={Boolean(connector?.references.endpointConfigured)}><b>Endpoint ref</b><small>{connector?.references.endpointConfigured ? "konfigurálva" : "hiányzik"}</small></span>
          <span data-ok={Boolean(connector?.references.credentialConfigured)}><b>Credential ref</b><small>{connector?.references.credentialConfigured ? "konfigurálva" : "hiányzik"}</small></span>
          <span data-ok={Boolean(connector?.references.hostKeyConfigured)}><b>Host-key ref</b><small>{connector?.references.hostKeyConfigured ? "konfigurálva" : "hiányzik"}</small></span>
          <span data-ok={!connector?.networkTransportImplemented}><b>Network transport</b><small>{connector?.networkTransportImplemented ? "AKTÍV · TILTOTT" : "NINCS IMPLEMENTÁLVA"}</small></span>
        </div>
        <div className={styles.prodConnectorProbeList}>{(connector?.probeCatalog || []).map((probe) => <span key={probe.id}>{probe.id} · AUDIT_ONLY</span>)}</div>
        <section className={styles.prodProbePlanner} data-ready={connector?.state === "FOUNDATION_READY" ? "true" : "false"}>
          <header><div><ServerCog size={15} /><strong>P10.2 · PROBE PLAN COMPILER</strong></div><b>PLAN ONLY · NO NETWORK</b></header>
          <div className={styles.prodProbePlannerControls}>
            <select aria-label="PROD read-only probe terv" value={selectedProbe} onChange={(event) => { setSelectedProbe(event.target.value); setProbePlan(null); setPlanMessage(""); }} disabled={planBusy}>
              {(connector?.probeCatalog || []).map((probe) => <option key={probe.id} value={probe.id}>{probe.id}</option>)}
            </select>
            <button type="button" onClick={() => void buildProbePlan()} disabled={planBusy || connector?.state !== "FOUNDATION_READY"}>{planBusy ? "TERV KÉSZÜL…" : "TERV ELŐÁLLÍTÁSA"}</button>
            <span>Browser input: csak probe ID · command/host/credential NEM adható meg.</span>
          </div>
          {probePlan ? <div className={styles.prodProbePlanResult}>
            <span><b>Probe</b><small>{probePlan.probeId}</small></span>
            <span><b>Adapter action</b><small>{probePlan.adapterAction}</small></span>
            <span><b>Execution</b><small>{probePlan.executionAvailable ? "TILTOTT ÁLLAPOT" : "NINCS"}</small></span>
            <span><b>Network</b><small>{probePlan.networkAccessAttempted ? "TILTOTT ÁLLAPOT" : "NEM TÖRTÉNT"}</small></span>
            <span><b>Output</b><small>{probePlan.outputPolicy.dataClass} · max {probePlan.limits.maxOutputBytes} B</small></span>
            <span><b>Policy</b><small>sanitize + audit · RAW→AI tiltva</small></span>
          </div> : null}
          {planMessage ? <p>{planMessage}</p> : <p>Csak immutable read-only terv készül. A compiler nem old fel reference-et és nem indít transportot.</p>}
        </section>
        <p>Reference érték nem jelenik meg · credential nem oldódik fel · hálózati kapcsolat nem történik · RAW PROD → AI tiltott.</p>
      </section>
      {readiness?.blockers?.length ? <ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p><ShieldCheck size={14} /> Read-only smoke readiness zöld. Ez továbbra sem jelent PROD execution jogot.</p>}
      <footer>{readiness?.readOnlySmokeAllowed ? "READ-ONLY SMOKE ENGEDÉLYEZHETŐ · EXECUTION TOVÁBBRA IS TILTVA" : "PROD KAPCSOLAT NINCS MEGNYITVA"}</footer>
    </section>
  );
}
