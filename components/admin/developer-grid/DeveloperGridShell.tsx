"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DeveloperGridFoundation,
  DeveloperGridRuntimeState,
  GridActivityEvent,
  GridEventPage,
  GridStateDelta,
  WorkerRegistryEntry,
  WorkerSession,
} from "@/app/lib/developer-grid/types";
import styles from "./DeveloperGridShell.module.css";

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function mergeSessions(current: WorkerSession[], incoming: WorkerSession[]) {
  const map = new Map(current.map((session) => [session.id, session]));
  for (const session of incoming) map.set(session.id, session);
  return [...map.values()];
}

function mergeEvents(current: GridActivityEvent[], incoming: GridActivityEvent[]) {
  const map = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) map.set(event.id, event);
  return [...map.values()].sort((a, b) => a.sequence - b.sequence).slice(-120);
}

function summary(event?: GridActivityEvent | null) {
  if (!event) return "Nincs activity esemény.";
  const value = event.delta?.summary;
  return typeof value === "string" && value.trim() ? value.trim() : event.kind;
}

function WorkerCell({ worker, className, session, event }: { worker: WorkerRegistryEntry; className: string; session?: WorkerSession | null; event?: GridActivityEvent | null }) {
  const working = Boolean(session && !session.endedAt);
  return (
    <section className={`${styles.card} ${className}`}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.workerName}>{worker.label}</div>
          <div className={styles.role}>{worker.role}</div>
        </div>
        <span className={`${styles.state} ${working ? styles.stateWorking : ""}`}>{working ? "WORKING" : worker.state}</span>
      </div>
      <div className={styles.cardBody}>
        {session ? (
          <>
            <strong>{session.developmentContext.workItem}</strong>
            <span>Stage {session.developmentContext.workStageIndex ?? "–"} · {session.developmentContext.source}</span>
            <span>Task: {session.taskId}</span>
            <span>HEAD: {session.sourceProvenance.head ? session.sourceProvenance.head.slice(0, 12) : "–"}</span>
            <span className={session.sourceProvenance.sourceState === "VERIFIED" ? styles.ok : styles.blocked}>Source: {session.sourceProvenance.sourceState}</span>
          </>
        ) : (
          <>
            <span>Nincs aktív authoritative task/session.</span>
            <span>Legutóbbi activity: {summary(event)}</span>
          </>
        )}
      </div>
    </section>
  );
}

export default function DeveloperGridShell() {
  const [foundation, setFoundation] = useState<DeveloperGridFoundation | null>(null);
  const [runtimeState, setRuntimeState] = useState<DeveloperGridRuntimeState | null>(null);
  const [events, setEvents] = useState<GridActivityEvent[]>([]);
  const [connection, setConnection] = useState<"CONNECTING" | "DELTA_LIVE" | "DEGRADED">("CONNECTING");
  const [lastUpdate, setLastUpdate] = useState("");
  const [error, setError] = useState("");
  const stateRevisionRef = useRef(0);
  const eventCursorRef = useRef<string | null>(null);

  const applyState = useCallback((state: DeveloperGridRuntimeState) => {
    stateRevisionRef.current = state.revision || 0;
    setRuntimeState(state);
  }, []);

  const applyStateDelta = useCallback((delta: GridStateDelta) => {
    stateRevisionRef.current = Math.max(stateRevisionRef.current, delta.cursor || 0);
    if (!delta.changes.length) return;
    setRuntimeState((current) => {
      if (!current) return current;
      return {
        ...current,
        revision: Math.max(current.revision, delta.cursor),
        task: delta.task || current.task,
        sessions: mergeSessions(current.sessions, delta.sessions),
        changes: [...current.changes, ...delta.changes].slice(-1000),
        updatedAt: delta.changes.at(-1)?.timestamp || current.updatedAt,
      };
    });
  }, []);

  const applyEventPage = useCallback((page: GridEventPage) => {
    if (page.nextCursor) eventCursorRef.current = page.nextCursor;
    if (page.events.length) setEvents((current) => mergeEvents(current, page.events));
  }, []);

  const pollDeltas = useCallback(async () => {
    try {
      const stateUrl = `/api/dev/grid/state?after=${stateRevisionRef.current}&limit=100`;
      const eventUrl = `/api/dev/grid/events?${eventCursorRef.current ? `cursor=${encodeURIComponent(eventCursorRef.current)}&` : ""}limit=100`;
      const [stateResponse, eventResponse] = await Promise.all([
        fetch(stateUrl, { headers: adminHeaders(), cache: "no-store" }),
        fetch(eventUrl, { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const statePayload = await stateResponse.json().catch(() => null) as { ok?: boolean; delta?: GridStateDelta; error?: string } | null;
      const eventPayload = await eventResponse.json().catch(() => null) as { ok?: boolean; page?: GridEventPage; error?: string } | null;
      if (!stateResponse.ok || !statePayload?.delta) throw new Error(statePayload?.error || "A state delta nem érhető el.");
      if (!eventResponse.ok || !eventPayload?.page) throw new Error(eventPayload?.error || "Az activity delta nem érhető el.");
      applyStateDelta(statePayload.delta);
      applyEventPage(eventPayload.page);
      setConnection("DELTA_LIVE");
      setLastUpdate(new Date().toISOString());
      setError("");
    } catch (caught) {
      setConnection("DEGRADED");
      setError(caught instanceof Error ? caught.message : "A delta kapcsolat megszakadt.");
    }
  }, [applyEventPage, applyStateDelta]);

  useEffect(() => {
    let alive = true;
    const initialize = async () => {
      try {
        const [foundationResponse, materializeResponse] = await Promise.all([
          fetch("/api/dev/grid/foundation", { headers: adminHeaders(), cache: "no-store" }),
          fetch("/api/dev/grid/state", { method: "POST", headers: adminHeaders(), cache: "no-store" }),
        ]);
        const foundationPayload = await foundationResponse.json().catch(() => null) as { ok?: boolean; foundation?: DeveloperGridFoundation; error?: string } | null;
        const materializePayload = await materializeResponse.json().catch(() => null) as { ok?: boolean; materialized?: { state?: DeveloperGridRuntimeState }; error?: string } | null;
        if (!foundationResponse.ok || !foundationPayload?.foundation) throw new Error(foundationPayload?.error || "A Developer Grid foundation nem tölthető be.");
        if (!materializeResponse.ok || !materializePayload?.materialized?.state) {
          const fallback = await fetch("/api/dev/grid/state", { headers: adminHeaders(), cache: "no-store" });
          const fallbackPayload = await fallback.json().catch(() => null) as { ok?: boolean; state?: DeveloperGridRuntimeState; error?: string } | null;
          if (!fallback.ok || !fallbackPayload?.state) throw new Error(materializePayload?.error || fallbackPayload?.error || "A Developer Grid state nem tölthető be.");
          if (alive) applyState(fallbackPayload.state);
        } else if (alive) {
          applyState(materializePayload.materialized.state);
        }
        if (alive) setFoundation(foundationPayload.foundation);

        let cursor: string | null = null;
        for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
          const response = await fetch(`/api/dev/grid/events?${cursor ? `cursor=${encodeURIComponent(cursor)}&` : ""}limit=50`, { headers: adminHeaders(), cache: "no-store" });
          const payload = await response.json().catch(() => null) as { ok?: boolean; page?: GridEventPage; error?: string } | null;
          if (!response.ok || !payload?.page) throw new Error(payload?.error || "Az activity history nem tölthető be.");
          if (alive) applyEventPage(payload.page);
          cursor = payload.page.nextCursor;
          if (!payload.page.hasMore) break;
        }
        if (alive) {
          setConnection("DELTA_LIVE");
          setLastUpdate(new Date().toISOString());
          setError("");
        }
      } catch (caught) {
        if (!alive) return;
        setConnection("DEGRADED");
        setError(caught instanceof Error ? caught.message : "A Developer Grid nem érhető el.");
      }
    };
    void initialize();
    const timer = window.setInterval(() => { void pollDeltas(); }, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [applyEventPage, applyState, pollDeltas]);

  const cells = useMemo(() => {
    const workers = foundation?.workers || [];
    return {
      tl: workers.find((worker) => worker.position === "TOP_LEFT"),
      tr: workers.find((worker) => worker.position === "TOP_RIGHT"),
      bl: workers.find((worker) => worker.position === "BOTTOM_LEFT"),
      br: workers.find((worker) => worker.position === "BOTTOM_RIGHT"),
      devmin: workers.find((worker) => worker.position === "AUXILIARY"),
    };
  }, [foundation]);

  const sessionFor = useCallback((worker: WorkerRegistryEntry | undefined) => {
    if (!worker) return null;
    return runtimeState?.sessions.find((session) => session.workerCode === worker.code && session.endedAt === null) || null;
  }, [runtimeState?.sessions]);

  const eventFor = useCallback((worker: WorkerRegistryEntry | undefined) => {
    if (!worker) return null;
    return [...events].reverse().find((event) => event.workerCode === worker.code) || null;
  }, [events]);

  const source = sessionFor(cells.tr)?.sourceProvenance || foundation?.sourceProvenance || null;
  const currentTask = runtimeState?.task || foundation?.task || null;
  const latestEvents = [...events].reverse().slice(0, 6);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <h1 className={styles.title}>BENJADMIN · DEVELOPER GRID V1</h1>
          <div className={styles.subtitle}>AI Fejlesztésirányítási Központ · foundation · ChatGrid fallback/reference érintetlen</div>
        </div>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles.versionBadge}`}>{foundation?.version ? `v${foundation.version.replace("-dev", "")} DEV` : "v0.1.1 DEV"}</span>
          <span className={styles.badge}>DEV ONLY</span>
          <span className={styles.badge}>PROD DENY</span>
          <span className={`${styles.badge} ${connection === "DELTA_LIVE" ? styles.liveBadge : connection === "DEGRADED" ? styles.degradedBadge : ""}`}>{connection === "DELTA_LIVE" ? "DELTA LIVE" : connection}</span>
        </div>
      </header>
      {error ? <p className={styles.blocked}>{error}</p> : null}
      <div className={styles.grid}>
        {cells.tl ? <WorkerCell worker={cells.tl} className={styles.tl} session={sessionFor(cells.tl)} event={eventFor(cells.tl)} /> : null}
        {cells.tr ? <WorkerCell worker={cells.tr} className={styles.tr} session={sessionFor(cells.tr)} event={eventFor(cells.tr)} /> : null}
        {cells.bl ? <WorkerCell worker={cells.bl} className={styles.bl} session={sessionFor(cells.bl)} event={eventFor(cells.bl)} /> : null}
        {cells.br ? <WorkerCell worker={cells.br} className={styles.br} session={sessionFor(cells.br)} event={eventFor(cells.br)} /> : null}

        <section className={styles.control}>
          <div className={styles.controlHeader}>
            <div>
              <h2 className={styles.controlTitle}>BENJADMIN FEJLESZTŐI VEZÉRLŐPULT</h2>
              <div className={styles.subtitle}>Central Core · authoritative task/session + delta state/activity</div>
            </div>
            <Link href="/admin/dev-console" className={styles.link}>Fejlesztői Konzol referencia →</Link>
          </div>
          <div className={styles.tabs}>
            {(foundation?.controlPlane.views || ["ÁTTEKINTÉS", "FELADATOK", "MODULOK", "DOKUMENTUMOK", "ÁTADÓK", "BUILDEK", "ESEMÉNYEK"]).map((tab) => <span key={tab} className={styles.tab}>{tab}</span>)}
          </div>
          <div className={styles.sections}>
            <div className={styles.panel}>
              <h3>Aktuális task</h3>
              <p>{currentTask?.title || "Foundation betöltése..."}</p>
              <p>Task ID: {currentTask?.id || "–"}</p>
              <p>Státusz: {currentTask?.status || "–"} · prioritás {currentTask?.priority ?? "–"}</p>
              <p>State revision: {runtimeState?.revision ?? 0}</p>
            </div>
            <div className={styles.panel}>
              <h3>Source provenance</h3>
              <p className={source?.sourceState === "VERIFIED" ? styles.ok : styles.blocked}>{source?.sourceState || "ELLENŐRZÉS"}</p>
              <p>Branch: {source?.branch || "–"}</p>
              <p>HEAD: {source?.head ? source.head.slice(0, 12) : "–"}</p>
              <p>Verified: {source?.verifiedAt ? new Date(source.verifiedAt).toLocaleTimeString("hu-HU") : "–"}</p>
            </div>
            <div className={styles.panel}>
              <h3>Central Core</h3>
              <ul>{(foundation?.centralCore.domains || []).slice(0, 8).map((domain) => <li key={domain}>{domain}</li>)}</ul>
            </div>
            <div className={styles.panel}>
              <h3>Build nodes</h3>
              <ul>{(foundation?.buildNodes || []).map((node) => <li key={node.id}>{node.hostname} · {node.state}{node.lastVerifiedAt ? ` · ${new Date(node.lastVerifiedAt).toLocaleTimeString("hu-HU")}` : ""}<br /><small>{node.reason}</small></li>)}</ul>
              <p>Executor: {foundation?.buildExecutor.kind === "CANONICAL_DEV_SERVER" ? "Canonical DEV szerver" : foundation?.buildExecutor.node?.hostname || "–"}</p>
              <p>Nem hitelesített alternatív / párhuzamos build: TILOS</p>
            </div>
            <div className={styles.panel}>
              <h3>Realtime</h3>
              <p className={connection === "DELTA_LIVE" ? styles.ok : styles.blocked}>{connection}</p>
              <p>State: revision delta</p>
              <p>Activity: cursor delta</p>
              <p>Full snapshot polling: TILTVA</p>
              <p>Utolsó frissítés: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("hu-HU") : "–"}</p>
            </div>
            <div className={styles.panel}>
              <h3>Release / Runtime</h3>
              <p className={foundation?.releaseRuntimeProvenance.state === "VERIFIED" ? styles.ok : foundation?.releaseRuntimeProvenance.state === "BLOCKED" ? styles.blocked : ""}>{foundation?.releaseRuntimeProvenance.state || "NOT_CONFIGURED"}</p>
              <p>Verzió: {foundation?.version ? `v${foundation.version.replace("-dev", "")} DEV` : "v0.1.1 DEV"}</p>
              <p>Build ID: {foundation?.releaseRuntimeProvenance.buildId || "–"}</p>
              <p>Commit: {foundation?.releaseRuntimeProvenance.sourceCommit ? foundation.releaseRuntimeProvenance.sourceCommit.slice(0, 12) : "–"}</p>
              <p>Branch: {foundation?.releaseRuntimeProvenance.sourceBranch || "–"}</p>
              <p>Mismatch → BLOCKED · RELEASE_STATE_MISMATCH</p>
            </div>
            <div className={`${styles.panel} ${styles.activityPanel}`}>
              <h3>Legutóbbi SANITIZED activity</h3>
              {latestEvents.length ? latestEvents.map((event) => (
                <div className={styles.activityRow} key={event.id}>
                  <b>{event.workerCode}</b><span>{event.kind}{event.origin === "BACKFILL" ? " · BACKFILL" : ""}</span><small>{summary(event)}</small><time>{new Date(event.timestamp).toLocaleTimeString("hu-HU")}</time>
                </div>
              )) : <p>Még nincs activity esemény.</p>}
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
