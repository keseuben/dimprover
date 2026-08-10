"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CheckCircle2, CircleAlert, RefreshCw, ServerCog, ShieldCheck, TerminalSquare } from "lucide-react";

type StartMode = {
  mode: "START" | "DEV_START" | "PROD_START";
  target: string;
  writeAllowed: boolean;
  approvalRequired: boolean;
  description: string;
};

type Probe = { table: string; ready: boolean; errorCode: string | null };
type Row = Record<string, unknown>;

type Snapshot = {
  generatedAt: string;
  architecture: {
    currentMode: string;
    targetMode: string;
    currentHostRole: string;
    targetHostRole: string;
    productionDefault: string;
  };
  startModes: StartMode[];
  schema: {
    controlPlaneReady: boolean;
    storageTelemetryReady: boolean;
    probes: Probe[];
  };
  liveWorklog: Row[];
  workSessions: Row[];
  builds: Row[];
  releases: Row[];
  backups: Row[];
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export default function BenjadminControlPlanePanel({ query }: { query: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    inFlight.current = true;
    if (!silent) setBusy(true);
    try {
      const response = await fetch("/api/dev/engine/control-plane", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { controlPlane?: Snapshot; error?: string } | null;
      if (!response.ok || !payload?.controlPlane) throw new Error(payload?.error || "A Control Plane állapot nem tölthető be.");
      setSnapshot(payload.controlPlane);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A Control Plane állapot nem érhető el.");
    } finally {
      inFlight.current = false;
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  const worklog = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    const source = snapshot?.liveWorklog || [];
    if (!normalized) return source.slice(0, 20);
    return source.filter((row) => JSON.stringify(row).toLocaleLowerCase("hu-HU").includes(normalized)).slice(0, 20);
  }, [query, snapshot?.liveWorklog]);

  const readyProbes = snapshot?.schema.probes.filter((item) => item.ready).length || 0;
  const totalProbes = snapshot?.schema.probes.length || 0;

  return (
    <div className="operator-control-plane-panel">
      <section className="operator-control-plane-head">
        <div>
          <span>B3.1 · CONTROL PLANE</span>
          <h2>Központi fejlesztésirányítás</h2>
          <p>{snapshot?.architecture.currentHostRole || "Állapot betöltése..."}</p>
        </div>
        <div className="operator-control-plane-badges">
          <span className={`operator-status-badge ${snapshot?.schema.controlPlaneReady ? "is-ok" : "is-warning"}`}>
            {snapshot?.schema.controlPlaneReady ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            Schema {readyProbes}/{totalProbes}
          </span>
          <span className="operator-status-badge is-muted"><ServerCog size={13} /> cél: {snapshot?.architecture.targetMode || "CONTROL_VPS"}</span>
          <button type="button" onClick={() => void load(false)} disabled={busy} title="Frissítés"><RefreshCw size={14} className={busy ? "is-spinning" : ""} /></button>
        </div>
      </section>

      {error ? <div className="operator-alert is-danger"><CircleAlert size={15} /> {error}</div> : null}

      <section className="operator-start-grid" aria-label="BENJADMIN start módok">
        {(snapshot?.startModes || []).map((item) => (
          <article key={item.mode} className={`operator-start-card ${item.mode === "PROD_START" ? "is-prod" : item.mode === "DEV_START" ? "is-dev" : ""}`}>
            <div><TerminalSquare size={15} /><strong>{item.mode.replace("_", " ")}</strong></div>
            <span>{item.target}</span>
            <p>{item.description}</p>
            <small>{item.writeAllowed ? "DEV write engedélyezhető védett sessionben" : item.approvalRequired ? "READ ONLY · külön jóváhagyás szükséges" : "READ FIRST"}</small>
          </article>
        ))}
      </section>

      <div className="operator-control-plane-grid">
        <section className="operator-table-card">
          <div className="operator-table-title">
            <div><span>ÉLŐ MUNKANAPLÓ</span><h2>Audit / fejlesztési események</h2></div>
            <span><Activity size={13} /> 5 mp silent refresh</span>
          </div>
          <div className="operator-table-wrap">
            <table className="operator-data-table">
              <thead><tr><th>Idő</th><th>Esemény</th><th>Összefoglaló</th><th className="hide-small">Objektum</th></tr></thead>
              <tbody>
                {worklog.map((row, index) => (
                  <tr key={text(row.id) || `${text(row.created_at)}-${index}`}>
                    <td>{formatDate(row.created_at)}</td>
                    <td><strong>{text(row.action) || "EVENT"}</strong></td>
                    <td><small>{text(row.summary) || "—"}</small></td>
                    <td className="hide-small"><code>{text(row.entity_type) || "—"}</code></td>
                  </tr>
                ))}
                {!worklog.length ? <tr><td colSpan={4} className="operator-table-empty">Nincs megjeleníthető munkanapló-esemény.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="operator-control-plane-side">
          <section className="operator-mini-table-card">
            <div className="operator-table-title"><div><span>B3.1 SÉMA</span><h2>Control / telemetry readiness</h2></div></div>
            <div className="operator-probe-list">
              {(snapshot?.schema.probes || []).map((probe) => (
                <div key={probe.table}><span className={`operator-status-dot ${probe.ready ? "is-ok" : "is-warning"}`} /><strong>{probe.table.replace(/^dev_center_/, "")}</strong><small>{probe.ready ? "READY" : probe.errorCode || "PENDING"}</small></div>
              ))}
            </div>
          </section>
          <section className={`operator-compact-warning ${snapshot?.architecture.productionDefault === "READ_ONLY" ? "is-ok" : "is-warning"}`}>
            <ShieldCheck size={16} />
            <div><strong>PRODUCTION: {snapshot?.architecture.productionDefault || "READ_ONLY"}</strong><span>PROD START önmagában nem ad írási, migration, restart vagy deploy jogot.</span></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
