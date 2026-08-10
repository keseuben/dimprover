"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, CheckCircle2, CircleAlert, GitBranch, ListTodo, LockKeyhole, RefreshCw } from "lucide-react";
import type { DevEngineGateStatus, DevEngineTask, DevEngineWorker, DevEngineWorkerSession } from "@/app/lib/dev-center/engine-types";

type EngineState = {
  workers: DevEngineWorker[];
  tasks: DevEngineTask[];
  sessions: DevEngineWorkerSession[];
  locks: Array<{ id: string; scope_key?: string; scope_type?: string; session_id?: string }>;
};

export default function DevEnginePanel() {
  const [gate, setGate] = useState<DevEngineGateStatus | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setBusy(true);
    try {
      const headers = { "x-dimpro-license-admin-key": key };
      const [gateResponse, stateResponse] = await Promise.all([
        fetch("/api/dev/engine/gate", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/state", { headers, cache: "no-store" }),
      ]);
      const gatePayload = await gateResponse.json().catch(() => null) as { gate?: DevEngineGateStatus; error?: string } | null;
      const statePayload = await stateResponse.json().catch(() => null) as { state?: EngineState; error?: string } | null;
      if (!stateResponse.ok || !statePayload?.state) throw new Error(statePayload?.error || "A BENJADMIN engine állapot nem tölthető be.");
      setGate(gatePayload?.gate || null);
      setState(statePayload.state);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A BENJADMIN engine állapot nem tölthető be.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const readySessions = state?.sessions.filter((session) => session.status === "active" && session.handshakeStage === "READY") || [];
  const queue = state?.tasks.filter((task) => ["queued", "ready", "claimed", "in_progress", "testing"].includes(task.status)) || [];

  return (
    <section className="dev-section dev-engine-panel" id="m2-engine">
      <div className="dev-section-heading">
        <div>
          <p className="dev-section-label">BENJADMIN B3 M2</p>
          <h2>PostgreSQL task / worker / session engine</h2>
        </div>
        <div className="dev-engine-heading-actions">
          <span className={`dev-engine-gate ${gate?.ready ? "is-ready" : "is-pending"}`}>
            {gate?.ready ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            {gate?.ready ? "M2 gate READY" : "M2 gate folyamatban"}
          </span>
          <button type="button" className="dev-secondary-button" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={15} className={busy ? "is-spinning" : ""} /> {busy ? "Frissítés…" : "Frissítés"}
          </button>
        </div>
      </div>

      {error ? <div className="dev-data-warning">{error}</div> : null}

      <div className="dev-engine-metrics">
        <article><Bot size={19} /><span>Worker-ek</span><strong>{state?.workers.length ?? 0}/3</strong><small>ÁrminAI · JázminAI · OutminAI</small></article>
        <article><Activity size={19} /><span>READY session</span><strong>{readySessions.length}/3</strong><small>teljes handshake + scope lock</small></article>
        <article><ListTodo size={19} /><span>Task queue</span><strong>{queue.length}</strong><small>aktív / végrehajtható feladat</small></article>
        <article><LockKeyhole size={19} /><span>Aktív lock</span><strong>{state?.locks.length ?? 0}</strong><small>ütközésvédett scope</small></article>
      </div>

      <div className="dev-engine-grid">
        <article className="dev-panel">
          <div className="dev-panel-heading"><div className="dev-panel-icon"><Bot size={20} /></div><div><p className="dev-section-label">AI worker-ek</p><h3>BenAI kiosztási állapot</h3></div></div>
          <div className="dev-engine-list">
            {(state?.workers || []).map((worker) => {
              const session = readySessions.find((item) => item.workerId === worker.id);
              return <div key={worker.id} className="dev-engine-row"><div><strong>{worker.name}</strong><small>{worker.role}</small></div><span className={session ? "is-ready" : worker.status === "busy" ? "is-busy" : ""}>{session ? "READY" : worker.status.toUpperCase()}</span></div>;
            })}
          </div>
        </article>

        <article className="dev-panel">
          <div className="dev-panel-heading"><div className="dev-panel-icon"><GitBranch size={20} /></div><div><p className="dev-section-label">Task queue</p><h3>Aktív fejlesztési feladatok</h3></div></div>
          <div className="dev-engine-list">
            {queue.slice(0, 6).map((task) => <div key={task.id} className="dev-engine-row"><div><strong>{task.title}</strong><small>{task.branchName || "branch még nincs kiosztva"}</small></div><span>{task.status}</span></div>)}
            {!queue.length ? <p className="dev-engine-empty">Nincs aktív task a queue-ban.</p> : null}
          </div>
        </article>
      </div>

      {gate?.blockers?.length ? <div className="dev-engine-blockers"><strong>M2 gate hátralévő feltételek:</strong>{gate.blockers.map((blocker) => <span key={blocker}>• {blocker}</span>)}</div> : null}
    </section>
  );
}
