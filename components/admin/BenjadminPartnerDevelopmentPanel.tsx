"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  CircleAlert,
  Database,
  Plus,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { BenjadminBarChart } from "./BenjadminDashboardKit";

type PartnerHealth = {
  configured: boolean;
  ready: boolean;
  expectedSchemaVersion: string;
  actualSchemaVersion: string | null;
  bootstrapId: string | null;
  errorCode: string | null;
  checkedAt: string;
  checks: Array<{ table: string; ready: boolean; errorCode: string | null }>;
};

type PartnerProject = {
  projectId: string;
  projectCode: string;
  name: string;
  slug: string;
  partnerOrgId: string | null;
  deliveryModel: "DIMPRO_HOSTED" | "PARTNER_HOSTED" | "HANDOFF";
  dataClassification: "NORMAL" | "CONFIDENTIAL" | "RESTRICTED";
  status: string;
  provisionState: "DRAFT" | "VALIDATING" | "PROVISIONING" | "BASELINE_TEST" | "READY";
  provisionAttempt: number;
  provisionStartedAt: string | null;
  provisionedAt: string | null;
  lastProvisionError: string | null;
  internalEngineAccess: "NONE" | "ALLOWLIST";
  defaultWorkerCode: string;
  defaultWorkerName: string;
  repositoryCount: number;
  environments: { DEV: string; STAG: string; PROD: string };
  deliveryTargetStatus: string;
  lastActivityAt: string;
  health: "DRAFT" | "READY" | "DEGRADED" | "PENDING" | "CLOSED";
};

type PartnerRuntimeIsolation = {
  ready: boolean;
  stage: "READY" | "PENDING";
  rootReady: boolean;
  directoriesReady: boolean;
  tokenHashReady: boolean;
  internalRootModeProtected: boolean;
  sshPublicKeyStaged: boolean;
  preflightReady: boolean;
  markerReady: boolean;
  internalRootProtected: boolean;
  workerTokenReady: boolean;
  sshIdentityReady: boolean;
  blockers: string[];
  checkedAt: string;
};

type PartnerSnapshot = {
  health: PartnerHealth;
  runtimeIsolation: PartnerRuntimeIsolation;
  projects: PartnerProject[];
  checkedAt: string;
};

type PartnerHandoff = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  releaseId: string;
  status: "draft" | "prepared" | "handed_over" | "accepted" | "rejected" | "cancelled";
  checksum: string;
  gitCommit: string;
  buildId: string;
  handedOverAt: string | null;
  handedOverBy: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = { query: string };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function healthTone(value: string) {
  const normalized = value.toLowerCase();
  if (["ready", "online", "active"].includes(normalized)) return "is-ok";
  if (["degraded", "offline"].includes(normalized)) return "is-danger";
  if (["draft", "pending", "not_bound", "unknown", "validating", "provisioning", "baseline_test"].includes(normalized)) return "is-warning";
  return "is-muted";
}

function environmentLabel(value: string) {
  const labels: Record<string, string> = {
    NOT_BOUND: "Nincs kapcsolva (NOT_BOUND)",
    ready: "Kész (READY)",
    online: "Online",
    pending: "Függő (PENDING)",
    unknown: "Ismeretlen (UNKNOWN)",
    degraded: "Gyengült (DEGRADED)",
    offline: "Kapcsolat nélkül (OFFLINE)",
  };
  return labels[value] || labels[value.toLowerCase()] || value.toUpperCase();
}

function deliveryModelLabel(value: PartnerProject["deliveryModel"]) {
  if (value === "HANDOFF") return "Átadás (HANDOFF)";
  if (value === "DIMPRO_HOSTED") return "DIMPRO hosztolt (DIMPRO_HOSTED)";
  return "Partner hosztolt (PARTNER_HOSTED)";
}

function classificationLabel(value: PartnerProject["dataClassification"]) {
  if (value === "NORMAL") return "Normál (NORMAL)";
  if (value === "CONFIDENTIAL") return "Bizalmas (CONFIDENTIAL)";
  return "Korlátozott (RESTRICTED)";
}

function engineAccessLabel(value: PartnerProject["internalEngineAccess"]) {
  return value === "ALLOWLIST" ? "Engedélylista (ALLOWLIST)" : "Nincs (NONE)";
}

function deliveryTargetLabel(value: string) {
  if (!value || value === "NOT_CONFIGURED") return "Nincs beállítva (NOT_CONFIGURED)";
  const [target, status] = value.split(":");
  const targetLabel = target === "HANDOFF" ? "Átadás (HANDOFF)" : target === "DIMPRO_HOSTED" ? "DIMPRO hosztolt" : target === "PARTNER_HOSTED" ? "Partner hosztolt" : target;
  const statusLabel = status === "ready" ? "Kész (READY)" : status === "draft" ? "Vázlat (DRAFT)" : status === "pending" ? "Függő (PENDING)" : status || "—";
  return `${targetLabel}: ${statusLabel}`;
}

function provisionLabel(value: PartnerProject["provisionState"]) {
  const labels: Record<PartnerProject["provisionState"], string> = {
    DRAFT: "Vázlat (DRAFT)",
    VALIDATING: "Ellenőrzés (VALIDATING)",
    PROVISIONING: "Kiépítés (PROVISIONING)",
    BASELINE_TEST: "Alapteszt (BASELINE_TEST)",
    READY: "Kész (READY)",
  };
  return labels[value];
}

function handoffStatusLabel(value: PartnerHandoff["status"]) {
  const labels: Record<PartnerHandoff["status"], string> = {
    draft: "Vázlat (draft)",
    prepared: "Előkészítve (prepared)",
    handed_over: "Átadva (handed over)",
    accepted: "Elfogadva (accepted)",
    rejected: "Elutasítva (rejected)",
    cancelled: "Visszavonva (cancelled)",
  };
  return labels[value];
}

export default function BenjadminPartnerDevelopmentPanel({ query }: Props) {
  const [snapshot, setSnapshot] = useState<PartnerSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [provisioningProjectId, setProvisioningProjectId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refreshRef = useRef(false);
  const slugEditedRef = useRef(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [partnerOrgId, setPartnerOrgId] = useState("");
  const [deliveryModel, setDeliveryModel] = useState<PartnerProject["deliveryModel"]>("HANDOFF");
  const [classification, setClassification] = useState<PartnerProject["dataClassification"]>("NORMAL");

  const [handoffs, setHandoffs] = useState<PartnerHandoff[]>([]);
  const [handoffBusy, setHandoffBusy] = useState("");
  const [handoffProjectId, setHandoffProjectId] = useState("");
  const [handoffGitCommit, setHandoffGitCommit] = useState("");
  const [handoffBuildId, setHandoffBuildId] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  const load = useCallback(async (silent = false) => {
    if (refreshRef.current) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    refreshRef.current = true;
    if (!silent) setBusy(true);
    try {
      const headers = { "x-dimpro-license-admin-key": key };
      const [projectsResponse, handoffsResponse] = await Promise.all([
        fetch("/api/dev/engine/partner-projects", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/partner-handoffs", { headers, cache: "no-store" }),
      ]);
      const payload = await projectsResponse.json().catch(() => null) as (PartnerSnapshot & { ok?: boolean; error?: string }) | null;
      const handoffPayload = await handoffsResponse.json().catch(() => null) as { ok?: boolean; handoffs?: PartnerHandoff[]; error?: string } | null;
      if (!projectsResponse.ok || !payload?.health) throw new Error(payload?.error || "A partnerfejlesztési sík (Partner Development Plane) állapota nem tölthető be.");
      if (!handoffsResponse.ok || !handoffPayload?.ok) throw new Error(handoffPayload?.error || "A partnerátadások nem tölthetők be.");
      setSnapshot(payload);
      setHandoffs(handoffPayload.handoffs || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A Partner Development Plane állapot nem tölthető be.");
    } finally {
      refreshRef.current = false;
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const intervalId = window.setInterval(refreshIfVisible, 5000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [load]);

  const normalizedQuery = query.trim().toLocaleLowerCase("hu-HU");
  const projects = useMemo(() => (snapshot?.projects || []).filter((project) => {
    if (!normalizedQuery) return true;
    return [
      project.projectCode,
      project.name,
      project.slug,
      project.partnerOrgId,
      project.deliveryModel,
      project.dataClassification,
      project.defaultWorkerCode,
      project.health,
      project.provisionState,
      project.lastProvisionError,
    ].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery);
  }), [snapshot?.projects, normalizedQuery]);


  const eligibleHandoffProjects = useMemo(() => (snapshot?.projects || []).filter((project) =>
    project.deliveryModel === "HANDOFF" && project.provisionState === "READY" && project.status === "ready"
  ), [snapshot?.projects]);

  useEffect(() => {
    if (!handoffProjectId && eligibleHandoffProjects[0]?.projectId) setHandoffProjectId(eligibleHandoffProjects[0].projectId);
  }, [eligibleHandoffProjects, handoffProjectId]);

  const provisionAnalytics = useMemo(() => {
    const source = snapshot?.projects || [];
    const total = Math.max(1, source.length);
    return [
      { label: "Vázlat (DRAFT)", value: source.filter((item) => item.provisionState === "DRAFT").length, total, tone: "default" as const },
      { label: "Ellenőrzés (VALIDATING)", value: source.filter((item) => item.provisionState === "VALIDATING").length, total, tone: "info" as const },
      { label: "Kiépítés (PROVISIONING)", value: source.filter((item) => item.provisionState === "PROVISIONING").length, total, tone: "warning" as const },
      { label: "Alapteszt (BASELINE_TEST)", value: source.filter((item) => item.provisionState === "BASELINE_TEST").length, total, tone: "warning" as const },
      { label: "Kész (READY)", value: source.filter((item) => item.provisionState === "READY").length, total, tone: "ok" as const },
    ];
  }, [snapshot?.projects]);

  const deliveryAnalytics = useMemo(() => {
    const source = snapshot?.projects || [];
    const total = Math.max(1, source.length);
    return [
      { label: "Átadás (HANDOFF)", value: source.filter((item) => item.deliveryModel === "HANDOFF").length, total, tone: "info" as const },
      { label: "DIMPRO hosztolt (DIMPRO_HOSTED)", value: source.filter((item) => item.deliveryModel === "DIMPRO_HOSTED").length, total, tone: "ok" as const },
      { label: "Partner hosztolt (PARTNER_HOSTED)", value: source.filter((item) => item.deliveryModel === "PARTNER_HOSTED").length, total, tone: "warning" as const },
    ];
  }, [snapshot?.projects]);

  const partnerEnvironmentAnalytics = useMemo(() => {
    const source = snapshot?.projects || [];
    const statuses = source.flatMap((item) => [item.environments.DEV, item.environments.STAG, item.environments.PROD]);
    const total = Math.max(1, statuses.length);
    const normalized = statuses.map((item) => item.toLowerCase());
    return [
      { label: "Kész / online (ready/online)", value: normalized.filter((item) => ["ready", "online"].includes(item)).length, total, tone: "ok" as const },
      { label: "Függő / ismeretlen (pending/unknown)", value: normalized.filter((item) => ["pending", "unknown", "not_bound"].includes(item)).length, total, tone: "warning" as const },
      { label: "Gyengült / offline (degraded/offline)", value: normalized.filter((item) => ["degraded", "offline"].includes(item)).length, total, tone: "danger" as const },
    ];
  }, [snapshot?.projects]);

  async function createDraft() {
    if (!snapshot?.health.ready || creating) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/dev/engine/partner-projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({
          name,
          slug,
          partnerOrgId: partnerOrgId || null,
          deliveryModel,
          dataClassification: classification,
          creationKey: `${partnerOrgId || "partner"}:${slug}`,
          createdBy: "BenjAdmin",
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; result?: { projectCode?: string } } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A partnerprojekt draft nem hozható létre.");
      setMessage(`${payload.result?.projectCode || "Partnerprojekt"} draft létrehozva.`);
      setName("");
      setSlug("");
      setPartnerOrgId("");
      slugEditedRef.current = false;
      await load(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "A partnerprojekt draft nem hozható létre.");
    } finally {
      setCreating(false);
    }
  }


  async function provisionProject(project: PartnerProject) {
    if (!snapshot?.health.ready || !snapshot?.runtimeIsolation?.ready || provisioningProjectId) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setProvisioningProjectId(project.projectId);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dev/engine/partner-projects/${encodeURIComponent(project.projectId)}/provision`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({ createdBy: "BenjAdmin" }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        ready?: boolean;
        code?: string;
        error?: string;
        project?: PartnerProject | null;
      } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A partnerprojekt provisioning sikertelen.");
      setMessage(payload.ready
        ? `${project.projectCode} provisioning READY.`
        : `${project.projectCode} provisioning előkészítve; ${payload.code || "külső resource provider szükséges"}.`);
      await load(true);
    } catch (provisionError) {
      setError(provisionError instanceof Error ? provisionError.message : "A partnerprojekt provisioning sikertelen.");
      await load(true);
    } finally {
      setProvisioningProjectId("");
    }
  }

  async function prepareHandoff() {
    if (!handoffProjectId || handoffBusy) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setHandoffBusy("prepare");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/dev/engine/partner-handoffs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": key },
        body: JSON.stringify({
          projectId: handoffProjectId,
          gitCommit: handoffGitCommit,
          buildId: handoffBuildId,
          notes: handoffNotes,
          actor: "BenjAdmin",
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; handoff?: PartnerHandoff } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A partnerátadás előkészítése sikertelen.");
      setMessage(`${payload.handoff?.projectCode || "Partnerprojekt"} átadása előkészítve.`);
      setHandoffGitCommit("");
      setHandoffBuildId("");
      setHandoffNotes("");
      await load(true);
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : "A partnerátadás előkészítése sikertelen.");
    } finally {
      setHandoffBusy("");
    }
  }

  async function transitionHandoff(handoff: PartnerHandoff, action: "HAND_OVER" | "ACCEPT" | "REJECT" | "CANCEL") {
    if (handoffBusy) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setHandoffBusy(`${handoff.id}:${action}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dev/engine/partner-handoffs/${encodeURIComponent(handoff.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": key },
        body: JSON.stringify({ action, actor: "BenjAdmin" }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; handoff?: PartnerHandoff } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A partnerátadás állapotváltása sikertelen.");
      setMessage(`${handoff.projectCode} átadási állapota frissítve.`);
      await load(true);
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : "A partnerátadás állapotváltása sikertelen.");
    } finally {
      setHandoffBusy("");
    }
  }

  const health = snapshot?.health;
  const pendingTables = health?.checks.filter((item) => !item.ready).length || 0;

  return (
    <section className="operator-partner-panel" data-testid="partner-development-panel">
      <header className="operator-partner-head">
        <div>
          <span>PARTNER FEJLESZTÉSI SÍK (Partner Development Plane) · B3.2</span>
          <h2><Boxes size={17} /> Partner fejlesztések</h2>
          <p>Belső DIMPRO síktól elkülönített partnerprojektek, Outmin-AI fejlesztő (worker) és átadási életciklus (delivery lifecycle).</p>
        </div>
        <div className="operator-partner-head__badges">
          <span className={`operator-status-badge ${health?.ready ? "is-ok" : "is-warning"}`} data-testid="partner-schema-status">
            {health?.ready ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            SÉMA {health?.ready ? "READY" : "PENDING"}
          </span>
          <span className={`operator-status-badge ${snapshot?.runtimeIsolation?.ready ? "is-ok" : "is-partner"}`} data-testid="partner-runtime-status">
            <ShieldCheck size={13} />
            {snapshot?.runtimeIsolation?.ready
              ? "Outmin-AI · ALAPÉRTELMEZETT TILTÁS (DEFAULT DENY) · P2 FUTÁSI KÖRNYEZET READY"
              : snapshot?.runtimeIsolation?.preflightReady
                ? "Outmin-AI · ALAPÉRTELMEZETT TILTÁS (DEFAULT DENY) · P2 ELŐELLENŐRZÉS READY"
                : "Outmin-AI · ALAPÉRTELMEZETT TILTÁS (DEFAULT DENY) · P2 FUTÁSI KÖRNYEZET PENDING"}
          </span>
          <button type="button" onClick={() => void load(false)} disabled={busy} title="Partner állapot frissítése">
            <RefreshCw size={15} className={busy ? "is-spinning" : ""} />
          </button>
        </div>
      </header>

      <div className="operator-partner-metrics">
        <div><span>Partnerprojektek</span><strong>{snapshot?.projects.length || 0}</strong></div>
        <div><span>Nyilvántartási séma (registry schema)</span><strong>{health?.actualSchemaVersion || "STAGED"}</strong></div>
        <div><span>Hiányzó adattáblák</span><strong>{pendingTables}</strong></div>
        <div><span>Alapértelmezett fejlesztő (worker)</span><strong>Outmin-AI</strong></div>
        <div><span>P2 futási környezet (runtime)</span><strong>{snapshot?.runtimeIsolation?.stage || "PENDING"}</strong></div>
        <div><span>PROD</span><strong>JÓVÁHAGYÁSI KAPU (approval gate)</strong></div>
      </div>

      <div className="benj-v3-analytics-grid is-compact operator-partner-analytics" aria-label="Partner Development Plane analitika">
        <BenjadminBarChart title="Kiépítési életciklus (provision lifecycle)" subtitle={`${snapshot?.projects.length || 0} partnerprojekt`} items={provisionAnalytics} />
        <BenjadminBarChart title="Átadási modell (delivery model)" subtitle="B3.2 delivery" items={deliveryAnalytics} />
        <BenjadminBarChart title="Partnerkörnyezet állapota (environment health)" subtitle="DEV / STAG / PROD / átadás (handoff)" items={partnerEnvironmentAnalytics} />
      </div>

      <div className="operator-partner-grid">
        <div className="operator-table-card operator-partner-table-card">
          <div className="operator-table-title">
            <div><span>PARTNERNYILVÁNTARTÁS (registry)</span><h2>Projekt- és környezet-összkép</h2></div>
            <span>{projects.length} rekord</span>
          </div>
          <div className="operator-table-wrap">
            <table className="operator-data-table operator-partner-table" data-testid="partner-project-table">
              <thead>
                <tr>
                  <th>Kód</th>
                  <th>Partner / termék</th>
                  <th>Fejlesztő (worker)</th>
                  <th>DEV</th>
                  <th>STAG</th>
                  <th>PROD / Átadás (handoff)</th>
                  <th>Átadás (delivery)</th>
                  <th>Kiépítés (provision)</th>
                  <th>Állapot (health)</th>
                  <th>Aktivitás</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.projectId}>
                    <td><strong>{project.projectCode}</strong><small>{classificationLabel(project.dataClassification)}</small></td>
                    <td><strong>{project.name}</strong><small>{project.partnerOrgId || project.slug}</small></td>
                    <td><span className="operator-partner-worker">{project.defaultWorkerCode}</span><small>{engineAccessLabel(project.internalEngineAccess)}</small></td>
                    <td><span className={`operator-status-badge ${healthTone(project.environments.DEV)}`}>{environmentLabel(project.environments.DEV)}</span></td>
                    <td><span className={`operator-status-badge ${healthTone(project.environments.STAG)}`}>{environmentLabel(project.environments.STAG)}</span></td>
                    <td><span className={`operator-status-badge ${healthTone(project.environments.PROD)}`}>{deliveryTargetLabel(project.deliveryTargetStatus)}</span></td>
                    <td><strong>{deliveryModelLabel(project.deliveryModel)}</strong><small>{project.repositoryCount} repository (repo)</small></td>
                    <td>
                      <span className={`operator-status-badge ${healthTone(project.provisionState)}`}>{provisionLabel(project.provisionState)}</span>
                      <button
                        type="button"
                        className="operator-partner-provision-button"
                        data-testid={`partner-provision-${project.projectCode}`}
                        disabled={
                          !health?.ready
                          || !snapshot?.runtimeIsolation?.ready
                          || project.provisionState === "READY"
                          || Boolean(provisioningProjectId)
                        }
                        onClick={() => void provisionProject(project)}
                      >
                        <Play size={12} />
                        {provisioningProjectId === project.projectId ? "Fut..." : project.provisionState === "READY" ? "Kész" : "Indítás"}
                      </button>
                      {project.lastProvisionError ? <small className="is-danger">{project.lastProvisionError}</small> : null}
                    </td>
                    <td><span className={`operator-status-badge ${healthTone(project.health)}`}>{project.health}</span></td>
                    <td>{formatDate(project.lastActivityAt)}</td>
                  </tr>
                ))}
                {!projects.length ? (
                  <tr>
                    <td colSpan={10} className="operator-table-empty" data-testid="partner-empty-state">
                      {health?.ready
                        ? "Még nincs partnerprojekt. Az első projekt draftként hozható létre."
                        : "A P1 partnernyilvántartás (Partner Registry) kódja előkészítve; az elsődleges DEV adatforrás (source-of-truth) sémamigrációja még nincs alkalmazva."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="operator-partner-side">
          <div className="operator-mini-table-card operator-partner-create">
            <div className="operator-table-title"><div><span>ÚJ PARTNERPROJEKT</span><h2>Vázlatnyilvántartás (draft registry)</h2></div></div>
            <label>
              <span>Partner / termék neve</span>
              <input
                value={name}
                disabled={!health?.ready || creating}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  if (!slugEditedRef.current) setSlug(slugify(value));
                }}
                placeholder="Partner A Portal"
              />
            </label>
            <label>
              <span>Technikai név (slug)</span>
              <input
                value={slug}
                disabled={!health?.ready || creating}
                onChange={(event) => {
                  slugEditedRef.current = true;
                  setSlug(event.target.value.toLowerCase());
                }}
                placeholder="partner-a-portal"
              />
            </label>
            <label>
              <span>Partner szervezet ID / kód</span>
              <input value={partnerOrgId} disabled={!health?.ready || creating} onChange={(event) => setPartnerOrgId(event.target.value)} placeholder="partner-a" />
            </label>
            <div className="operator-partner-form-row">
              <label>
                <span>Átadási modell (delivery)</span>
                <select value={deliveryModel} disabled={!health?.ready || creating} onChange={(event) => setDeliveryModel(event.target.value as PartnerProject["deliveryModel"])}>
                  <option value="HANDOFF">Átadás (HANDOFF)</option>
                  <option value="DIMPRO_HOSTED">DIMPRO hosztolt (DIMPRO_HOSTED)</option>
                  <option value="PARTNER_HOSTED">Partner hosztolt (PARTNER_HOSTED)</option>
                </select>
              </label>
              <label>
                <span>Adatminősítés</span>
                <select value={classification} disabled={!health?.ready || creating} onChange={(event) => setClassification(event.target.value as PartnerProject["dataClassification"])}>
                  <option value="NORMAL">Normál (NORMAL)</option>
                  <option value="CONFIDENTIAL">Bizalmas (CONFIDENTIAL)</option>
                  <option value="RESTRICTED">Korlátozott (RESTRICTED)</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="operator-partner-create-button"
              disabled={!health?.ready || creating || !name.trim() || !slug.trim()}
              onClick={() => void createDraft()}
            >
              <Plus size={15} /> {creating ? "Létrehozás..." : "Vázlat létrehozása (draft)"}
            </button>
            {!health?.ready ? <small className="operator-partner-schema-note"><Database size={13} /> Aktiválás csak DEV DB backup + migráció után.</small> : null}
            {message ? <small className="operator-partner-message is-ok">{message}</small> : null}
            {error ? <small className="operator-partner-message is-danger">{error}</small> : null}
          </div>

          <div className="operator-mini-table-card operator-partner-handoff" data-testid="partner-handoff-panel">
            <div className="operator-table-title"><div><span>P4 · PARTNERÁTADÁS</span><h2>Átadási életciklus (handoff)</h2></div><span>{handoffs.length} átadás</span></div>
            <label>
              <span>Partnerprojekt</span>
              <select value={handoffProjectId} disabled={!eligibleHandoffProjects.length || Boolean(handoffBusy)} onChange={(event) => setHandoffProjectId(event.target.value)}>
                {!eligibleHandoffProjects.length ? <option value="">Nincs átadásra kész projekt</option> : null}
                {eligibleHandoffProjects.map((project) => <option key={project.projectId} value={project.projectId}>{project.projectCode} · {project.name}</option>)}
              </select>
            </label>
            <label>
              <span>Git commit</span>
              <input value={handoffGitCommit} disabled={Boolean(handoffBusy)} onChange={(event) => setHandoffGitCommit(event.target.value)} placeholder="abcdef1" />
            </label>
            <label>
              <span>Build azonosító (build ID)</span>
              <input value={handoffBuildId} disabled={Boolean(handoffBusy)} onChange={(event) => setHandoffBuildId(event.target.value)} placeholder="build-azonosító" />
            </label>
            <label>
              <span>Átadási megjegyzés</span>
              <textarea value={handoffNotes} disabled={Boolean(handoffBusy)} onChange={(event) => setHandoffNotes(event.target.value)} placeholder="Rövid átadási összefoglaló..." />
            </label>
            <button
              type="button"
              className="operator-partner-create-button"
              disabled={!handoffProjectId || !handoffGitCommit.trim() || !handoffBuildId.trim() || Boolean(handoffBusy)}
              onClick={() => void prepareHandoff()}
            >
              <Plus size={15} /> {handoffBusy === "prepare" ? "Előkészítés..." : "Átadás előkészítése"}
            </button>
            <div className="operator-partner-handoff-list">
              {handoffs.slice(0, 6).map((handoff) => (
                <div key={handoff.id} data-testid={`partner-handoff-${handoff.id}`}>
                  <div><strong>{handoff.projectCode || handoff.projectName}</strong><span className={`operator-status-badge ${healthTone(handoff.status)}`}>{handoffStatusLabel(handoff.status)}</span></div>
                  <small>{handoff.buildId || "—"} · {handoff.gitCommit ? handoff.gitCommit.slice(0, 12) : "—"}</small>
                  <small>{handoff.checksum ? `${handoff.checksum.slice(0, 22)}…` : "—"}</small>
                  <div className="operator-partner-handoff-actions">
                    {handoff.status === "prepared" ? <button type="button" disabled={Boolean(handoffBusy)} onClick={() => void transitionHandoff(handoff, "HAND_OVER")}>Átadás rögzítése</button> : null}
                    {handoff.status === "handed_over" ? <button type="button" disabled={Boolean(handoffBusy)} onClick={() => void transitionHandoff(handoff, "ACCEPT")}>Elfogadás</button> : null}
                    {handoff.status === "handed_over" ? <button type="button" disabled={Boolean(handoffBusy)} onClick={() => void transitionHandoff(handoff, "REJECT")}>Elutasítás</button> : null}
                    {["draft", "prepared"].includes(handoff.status) ? <button type="button" disabled={Boolean(handoffBusy)} onClick={() => void transitionHandoff(handoff, "CANCEL")}>Visszavonás</button> : null}
                  </div>
                </div>
              ))}
              {!handoffs.length ? <small className="operator-partner-schema-note">Még nincs partnerátadás.</small> : null}
            </div>
          </div>

          <div className="operator-compact-warning is-warning">
            <ShieldCheck size={16} />
            <div>
              <strong>Belső / partner határ (Internal / Partner)</strong>
              <span>
                {snapshot?.runtimeIsolation?.ready
                  ? "P2 futási izoláció (runtime isolation) READY. A P3 kiépítés (provisioning) átadási módban (HANDOFF) repository/munkafa (worktree) + DEV/STAG nyilvántartás + alapteszt (baseline) segítségével automatizált; hosztolt mód külön adatbázis-/tárhelyszolgáltatói kaput (provider gate) kér."
                  : snapshot?.runtimeIsolation?.preflightReady
                    ? "P2 futási előellenőrzés (runtime preflight) READY: partner gyökér, fejlesztői token (worker token), SSH publikus azonosító és belső DEV gyökérmód előkészítve. A külön Outmin Linux azonosító elfogadása még hiányzik."
                    : "A P2 házirendmag (policy core) aktív: belső repository/munkafa/hatókör (repo/worktree/scope) ALAPÉRTELMEZETTEN TILTOTT (DEFAULT DENY). Az Outmin-AI OS/MCP azonosító aktiválása külön futási kapu (runtime gate); repository/adatbázis/tárhely kiépítés a P3 része."}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
