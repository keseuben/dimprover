"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  CircleAlert,
  Database,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

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
  if (["draft", "pending", "not_bound", "unknown"].includes(normalized)) return "is-warning";
  return "is-muted";
}

function environmentLabel(value: string) {
  if (value === "NOT_BOUND") return "NINCS BIND";
  return value.toUpperCase();
}

export default function BenjadminPartnerDevelopmentPanel({ query }: Props) {
  const [snapshot, setSnapshot] = useState<PartnerSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refreshRef = useRef(false);
  const slugEditedRef = useRef(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [partnerOrgId, setPartnerOrgId] = useState("");
  const [deliveryModel, setDeliveryModel] = useState<PartnerProject["deliveryModel"]>("HANDOFF");
  const [classification, setClassification] = useState<PartnerProject["dataClassification"]>("NORMAL");

  const load = useCallback(async (silent = false) => {
    if (refreshRef.current) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    refreshRef.current = true;
    if (!silent) setBusy(true);
    try {
      const response = await fetch("/api/dev/engine/partner-projects", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as (PartnerSnapshot & { ok?: boolean; error?: string }) | null;
      if (!response.ok || !payload?.health) throw new Error(payload?.error || "A Partner Development Plane állapot nem tölthető be.");
      setSnapshot(payload);
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
    ].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery);
  }), [snapshot?.projects, normalizedQuery]);

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

  const health = snapshot?.health;
  const pendingTables = health?.checks.filter((item) => !item.ready).length || 0;

  return (
    <section className="operator-partner-panel" data-testid="partner-development-panel">
      <header className="operator-partner-head">
        <div>
          <span>PARTNER DEVELOPMENT PLANE · B3.2</span>
          <h2><Boxes size={17} /> Partner fejlesztések</h2>
          <p>Belső DIMPRO síktól elkülönített partnerprojektek, OutminAI worker és delivery életciklus.</p>
        </div>
        <div className="operator-partner-head__badges">
          <span className={`operator-status-badge ${health?.ready ? "is-ok" : "is-warning"}`} data-testid="partner-schema-status">
            {health?.ready ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            SCHEMA {health?.ready ? "READY" : "PENDING"}
          </span>
          <span className={`operator-status-badge ${snapshot?.runtimeIsolation?.ready ? "is-ok" : "is-partner"}`} data-testid="partner-runtime-status">
            <ShieldCheck size={13} />
            {snapshot?.runtimeIsolation?.ready
              ? "OUTMINAI · DEFAULT DENY · P2 RUNTIME READY"
              : snapshot?.runtimeIsolation?.preflightReady
                ? "OUTMINAI · DEFAULT DENY · P2 PREFLIGHT READY"
                : "OUTMINAI · DEFAULT DENY · P2 RUNTIME PENDING"}
          </span>
          <button type="button" onClick={() => void load(false)} disabled={busy} title="Partner állapot frissítése">
            <RefreshCw size={15} className={busy ? "is-spinning" : ""} />
          </button>
        </div>
      </header>

      <div className="operator-partner-metrics">
        <div><span>Partner projektek</span><strong>{snapshot?.projects.length || 0}</strong></div>
        <div><span>Registry schema</span><strong>{health?.actualSchemaVersion || "STAGED"}</strong></div>
        <div><span>Hiányzó táblák</span><strong>{pendingTables}</strong></div>
        <div><span>Default worker</span><strong>OUTMINAI</strong></div>
        <div><span>P2 runtime</span><strong>{snapshot?.runtimeIsolation?.stage || "PENDING"}</strong></div>
        <div><span>PROD</span><strong>APPROVAL GATE</strong></div>
      </div>

      <div className="operator-partner-grid">
        <div className="operator-table-card operator-partner-table-card">
          <div className="operator-table-title">
            <div><span>PARTNER REGISTRY</span><h2>Projekt- és környezet-összkép</h2></div>
            <span>{projects.length} rekord</span>
          </div>
          <div className="operator-table-wrap">
            <table className="operator-data-table operator-partner-table" data-testid="partner-project-table">
              <thead>
                <tr>
                  <th>Kód</th>
                  <th>Partner / termék</th>
                  <th>Worker</th>
                  <th>DEV</th>
                  <th>STAG</th>
                  <th>PROD / Handoff</th>
                  <th>Delivery</th>
                  <th>Health</th>
                  <th>Aktivitás</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.projectId}>
                    <td><strong>{project.projectCode}</strong><small>{project.dataClassification}</small></td>
                    <td><strong>{project.name}</strong><small>{project.partnerOrgId || project.slug}</small></td>
                    <td><span className="operator-partner-worker">{project.defaultWorkerCode}</span><small>{project.internalEngineAccess}</small></td>
                    <td><span className={`operator-status-badge ${healthTone(project.environments.DEV)}`}>{environmentLabel(project.environments.DEV)}</span></td>
                    <td><span className={`operator-status-badge ${healthTone(project.environments.STAG)}`}>{environmentLabel(project.environments.STAG)}</span></td>
                    <td><span className={`operator-status-badge ${healthTone(project.environments.PROD)}`}>{project.deliveryTargetStatus}</span></td>
                    <td><strong>{project.deliveryModel}</strong><small>{project.repositoryCount} repo</small></td>
                    <td><span className={`operator-status-badge ${healthTone(project.health)}`}>{project.health}</span></td>
                    <td>{formatDate(project.lastActivityAt)}</td>
                  </tr>
                ))}
                {!projects.length ? (
                  <tr>
                    <td colSpan={9} className="operator-table-empty" data-testid="partner-empty-state">
                      {health?.ready
                        ? "Még nincs partnerprojekt. Az első projekt draftként hozható létre."
                        : "A P1 Partner Registry kódja előkészítve; a source-of-truth DEV sémamigráció még nincs alkalmazva."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="operator-partner-side">
          <div className="operator-mini-table-card operator-partner-create">
            <div className="operator-table-title"><div><span>ÚJ PARTNERPROJEKT</span><h2>Draft registry</h2></div></div>
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
              <span>Slug</span>
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
                <span>Delivery</span>
                <select value={deliveryModel} disabled={!health?.ready || creating} onChange={(event) => setDeliveryModel(event.target.value as PartnerProject["deliveryModel"])}>
                  <option value="HANDOFF">HANDOFF</option>
                  <option value="DIMPRO_HOSTED">DIMPRO_HOSTED</option>
                  <option value="PARTNER_HOSTED">PARTNER_HOSTED</option>
                </select>
              </label>
              <label>
                <span>Adatminősítés</span>
                <select value={classification} disabled={!health?.ready || creating} onChange={(event) => setClassification(event.target.value as PartnerProject["dataClassification"])}>
                  <option value="NORMAL">NORMAL</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="operator-partner-create-button"
              disabled={!health?.ready || creating || !name.trim() || !slug.trim()}
              onClick={() => void createDraft()}
            >
              <Plus size={15} /> {creating ? "Létrehozás..." : "Draft létrehozása"}
            </button>
            {!health?.ready ? <small className="operator-partner-schema-note"><Database size={13} /> Aktiválás csak DEV DB backup + migráció után.</small> : null}
            {message ? <small className="operator-partner-message is-ok">{message}</small> : null}
            {error ? <small className="operator-partner-message is-danger">{error}</small> : null}
          </div>

          <div className="operator-compact-warning is-warning">
            <ShieldCheck size={16} />
            <div>
              <strong>Internal / Partner határ</strong>
              <span>
                {snapshot?.runtimeIsolation?.ready
                  ? "P2 runtime izoláció READY: partner root, worker credential és belső DIMPRO védelem igazolt. Repo/DB/storage provisioning P3."
                  : snapshot?.runtimeIsolation?.preflightReady
                    ? "P2 runtime preflight READY: partner root, worker token, SSH public identity és belső DEV root mód előkészítve. A külön Outmin Linux identity acceptance még hiányzik."
                    : "P2 policy core aktív: internal repo/worktree/scope DEFAULT DENY. OutminAI OS/MCP identity aktiválás külön runtime gate; repo/DB/storage provisioning P3."}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
