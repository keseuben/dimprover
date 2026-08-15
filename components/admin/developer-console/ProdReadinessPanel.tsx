"use client";

import { LockKeyhole, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ProdReadiness } from "@/app/lib/dev-center/terminal-hub/prod-readiness";
import styles from "./DeveloperConsole.module.css";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

export default function ProdReadinessPanel() {
  const [readiness, setReadiness] = useState<ProdReadiness | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/dev/terminal-hub/prod-readiness", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; readiness?: ProdReadiness; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.readiness) throw new Error(payload?.error || "A PROD readiness nem tölthető be.");
      setReadiness(payload.readiness);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A PROD readiness nem tölthető be.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      {readiness?.blockers?.length ? <ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p><ShieldCheck size={14} /> Read-only smoke readiness zöld. Ez továbbra sem jelent PROD execution jogot.</p>}
      <footer>{readiness?.readOnlySmokeAllowed ? "READ-ONLY SMOKE ENGEDÉLYEZHETŐ · EXECUTION TOVÁBBRA IS TILTVA" : "PROD KAPCSOLAT NINCS MEGNYITVA"}</footer>
    </section>
  );
}
