"use client";

import { Laptop, LockKeyhole, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { WindowsBridgeReadiness } from "@/app/lib/dev-center/terminal-hub/windows-bridge";
import styles from "./DeveloperConsole.module.css";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

export default function WindowsBridgePanel() {
  const [readiness, setReadiness] = useState<WindowsBridgeReadiness | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/dev/terminal-hub/windows-bridge/readiness", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; readiness?: WindowsBridgeReadiness; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.readiness) throw new Error(payload?.error || "A Windows Bridge readiness nem tölthető be.");
      setReadiness(payload.readiness);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Windows Bridge readiness nem tölthető be.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className={styles.windowsBridgePanel} data-enabled={readiness?.bridgeEnabled ? "true" : "false"}>
      <header>
        <div><Laptop size={18} /><div><span>WINDOWS DESKTOP BRIDGE · P8</span><strong>PowerShell helyi agent · fail-closed foundation</strong></div></div>
        <div><b>{readiness?.state || "LOADING"}</b><button type="button" onClick={() => void load()} disabled={busy} title="Windows Bridge readiness frissítése"><RefreshCw size={14} /></button></div>
      </header>
      {error ? <div className={styles.windowsBridgeError}>{error}</div> : null}
      <div className={styles.windowsBridgeGrid}>
        <article><ShieldCheck size={16} /><span>Transport</span><strong>{readiness?.security.transport || "OUTBOUND_HTTPS_ONLY"}</strong><small>Nincs bejövő Windows port és nincs böngésző → localhost bridge.</small></article>
        <article><LockKeyhole size={16} /><span>Credential</span><strong>{readiness?.security.credentialStore || "WINDOWS_CREDENTIAL_MANAGER_OR_DPAPI"}</strong><small>Bridge token nem kerül böngésző localStorage-ba.</small></article>
        <article><WifiOff size={16} /><span>PowerShell execution</span><strong>{readiness?.executionEnabled ? "GATE ON · AGENT MÉG NINCS" : "OFF"}</strong><small>A foundation nem indít PowerShell processzt.</small></article>
      </div>
      <div className={styles.windowsBridgeSecurityRow}>
        <span>RAW: jogosult emberi UI</span><span>SANITIZED: AI szűrt</span><span>AUDIT: maszkolt meta</span><span>PROD: TILTVA</span>
      </div>
      <ul>
        {(readiness?.blockers || ["Windows Bridge feature flag OFF.", "Windows Bridge pairing kill switch OFF.", "Windows Bridge execution kill switch OFF."]).map((blocker) => <li key={blocker}>{blocker}</li>)}
      </ul>
      <footer>Protocol v{readiness?.protocolVersion || 1} · pairing max. {readiness?.security.oneTimePairingMaxAgeSeconds || 600}s · böngésző közvetlen processz-hozzáférés: NINCS</footer>
    </section>
  );
}
