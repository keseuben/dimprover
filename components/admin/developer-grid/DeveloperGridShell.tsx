"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DeveloperGridFoundation, WorkerRegistryEntry } from "@/app/lib/developer-grid/types";
import styles from "./DeveloperGridShell.module.css";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

function WorkerCell({ worker, className }: { worker: WorkerRegistryEntry; className: string }) {
  return (
    <section className={`${styles.card} ${className}`}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.workerName}>{worker.label}</div>
          <div className={styles.role}>{worker.role}</div>
        </div>
        <span className={styles.state}>{worker.state}</span>
      </div>
      <div className={styles.cardBody}>
        Worker-specifikus végrehajtási cella. Az aktuális kontextus forrása a Task + developmentContext + source provenance; a presence itt sem authoritative.
      </div>
    </section>
  );
}

export default function DeveloperGridShell() {
  const [foundation, setFoundation] = useState<DeveloperGridFoundation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/dev/grid/foundation", { headers: adminHeaders(), cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; foundation?: DeveloperGridFoundation; error?: string };
        if (payload.foundation && alive) setFoundation(payload.foundation);
        if (!response.ok && alive) setError(payload.error || "A Developer Grid foundation blokkolt.");
      })
      .catch((caught) => alive && setError(caught instanceof Error ? caught.message : "A Developer Grid nem érhető el."));
    return () => { alive = false; };
  }, []);

  const cells = useMemo(() => {
    const workers = foundation?.workers || [];
    return {
      tl: workers.find((w) => w.position === "TOP_LEFT"),
      tr: workers.find((w) => w.position === "TOP_RIGHT"),
      bl: workers.find((w) => w.position === "BOTTOM_LEFT"),
      br: workers.find((w) => w.position === "BOTTOM_RIGHT"),
      devmin: workers.find((w) => w.position === "AUXILIARY"),
    };
  }, [foundation]);

  const sourceOk = foundation?.sourceProvenance.sourceState === "VERIFIED";

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <h1 className={styles.title}>BENJADMIN · DEVELOPER GRID V1</h1>
          <div className={styles.subtitle}>AI Fejlesztésirányítási Központ · foundation · ChatGrid fallback/reference érintetlen</div>
        </div>
        <div className={styles.badges}>
          <span className={styles.badge}>DEV ONLY</span>
          <span className={styles.badge}>PROD DENY</span>
          <span className={styles.badge}>DELTA / EVENT</span>
        </div>
      </header>
      {error ? <p className={styles.blocked}>{error}</p> : null}
      <div className={styles.grid}>
        {cells.tl ? <WorkerCell worker={cells.tl} className={styles.tl} /> : null}
        {cells.tr ? <WorkerCell worker={cells.tr} className={styles.tr} /> : null}
        {cells.bl ? <WorkerCell worker={cells.bl} className={styles.bl} /> : null}
        {cells.br ? <WorkerCell worker={cells.br} className={styles.br} /> : null}

        <section className={styles.control}>
          <div className={styles.controlHeader}>
            <div>
              <h2 className={styles.controlTitle}>BENJADMIN FEJLESZTŐI VEZÉRLŐPULT</h2>
              <div className={styles.subtitle}>Central Core · task / context / source / review / build / event</div>
            </div>
            <Link href="/admin/dev-console" className={styles.link}>Fejlesztői Konzol referencia →</Link>
          </div>
          <div className={styles.tabs}>
            {(foundation?.controlPlane.views || ["ÁTTEKINTÉS", "FELADATOK", "MODULOK", "DOKUMENTUMOK", "ÁTADÓK", "BUILDEK", "ESEMÉNYEK"]).map((tab) => <span key={tab} className={styles.tab}>{tab}</span>)}
          </div>
          <div className={styles.sections}>
            <div className={styles.panel}>
              <h3>Aktuális task</h3>
              <p>{foundation?.task.title || "Foundation betöltése..."}</p>
              <p>Task ID: {foundation?.task.id || "–"}</p>
              <p>Prioritás: {foundation?.task.priority ?? "–"}</p>
            </div>
            <div className={styles.panel}>
              <h3>Source provenance</h3>
              <p className={sourceOk ? styles.ok : styles.blocked}>{foundation?.sourceProvenance.sourceState || "ELLENŐRZÉS"}</p>
              <p>Branch: {foundation?.sourceProvenance.branch || "–"}</p>
              <p>HEAD: {foundation?.sourceProvenance.head ? foundation.sourceProvenance.head.slice(0, 12) : "–"}</p>
            </div>
            <div className={styles.panel}>
              <h3>Central Core</h3>
              <ul>{(foundation?.centralCore.domains || []).slice(0, 8).map((domain) => <li key={domain}>{domain}</li>)}</ul>
            </div>
            <div className={styles.panel}>
              <h3>Build nodes</h3>
              <ul>{(foundation?.buildNodes || []).map((node) => <li key={node.id}>{node.hostname} · {node.state}</li>)}</ul>
              <p>Kerülő build: TILOS</p>
            </div>
            <div className={styles.panel}>
              <h3>Realtime</h3>
              <p className={styles.ok}>DELTA_EVENT</p>
              <p>Full snapshot polling: TILTVA</p>
              <p>History: explicit / paginált</p>
            </div>
            <div className={styles.panel}>
              <h3>Release / Runtime</h3>
              <p>{foundation?.releaseRuntimeProvenance.state || "NOT_CONFIGURED"}</p>
              <p>Mismatch → BLOCKED · RELEASE_STATE_MISMATCH</p>
            </div>
          </div>
          <div className={styles.devmin}>
            <div><strong>{cells.devmin?.label || "05 DevminAI"}</strong><br /><span>Fejlesztési tervező és asszisztens · külön felhozható · nem indul automatikusan kódolni.</span></div>
            <span>{cells.devmin?.state || "IDLE"}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
