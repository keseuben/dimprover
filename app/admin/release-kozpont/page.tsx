"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardCopy,
  GitBranch,
  History,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Rocket,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

type ReleaseStage = "dev" | "staging" | "production";
type ReleaseStatus =
  | "draft"
  | "dev_testing"
  | "staging_candidate"
  | "approved"
  | "ready_for_production"
  | "production_deployed"
  | "rollback_ready"
  | "rolled_back"
  | "blocked"
  | "archived";
type ReleaseType = "web" | "desktop" | "api" | "docs" | "mixed";

type ChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  checked: boolean;
  checkedAt?: string | null;
  note?: string;
};

type ReleaseRecord = {
  id: string;
  version: string;
  title: string;
  type: ReleaseType;
  status: ReleaseStatus;
  sourceStage: ReleaseStage;
  targetStage: ReleaseStage;
  modules: string[];
  summary: string;
  technicalChangelog: string;
  publicChangelog: string;
  internalChangelog: string;
  knownIssues: string;
  testResult: string;
  rollbackPlan: string;
  rollbackPath: string;
  buildResult: string;
  smokeResult: string;
  relatedDevNoteIds: string[];
  aiHandoff: string;
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  deployedAt?: string | null;
  archivedAt?: string | null;
};

type RuntimeStage = {
  id: ReleaseStage;
  label: string;
  processName: string;
  status: "online" | "offline" | "unknown";
  uptime: string;
  pid: string;
  memory: string;
  cpu: string;
  buildTime: string;
  staticStatus: "ok" | "missing" | "unknown";
  note: string;
};

type Option = { id: string; label: string };

type ReleaseResponse = {
  ok: boolean;
  error?: string;
  store?: {
    version: 1;
    updatedAt: string;
    releases: ReleaseRecord[];
  };
  stages?: RuntimeStage[];
  stats?: {
    total: number;
    active: number;
    production: number;
    blocked: number;
    latestVersion: string;
  };
  config?: {
    storageFile: string;
    recommendedPath: string;
    deploymentMode: string;
    warning: string;
  };
  options?: {
    modules: string[];
    statuses: Option[];
    types: Option[];
    stages: Option[];
    checklist: ChecklistItem[];
    hostname: string;
  };
  storage?: {
    file: string;
  };
  affectedRelease?: ReleaseRecord;
};

type Draft = Omit<ReleaseRecord, "id" | "createdAt" | "updatedAt" | "approvedAt" | "deployedAt" | "archivedAt" | "checklist">;
type ReleaseOptions = NonNullable<ReleaseResponse["options"]>;

const defaultChecklist: ChecklistItem[] = [
  { id: "backup", label: "Backup / rollback pont előkészítve", required: true, checked: false },
  { id: "dev_notes", label: "Fejlesztési Napló frissítve", required: true, checked: false },
  { id: "tsc", label: "TypeScript ellenőrzés OK", required: true, checked: false },
  { id: "lint", label: "Lint ellenőrzés OK", required: true, checked: false },
  { id: "build", label: "Build OK", required: true, checked: false },
  { id: "smoke", label: "Smoke teszt OK", required: true, checked: false },
  { id: "static", label: "CSS/static ellenőrzés OK", required: true, checked: false },
  { id: "docs", label: "Dokumentáció frissítve", required: true, checked: false },
  { id: "known_issues", label: "Ismert hibák rögzítve", required: true, checked: false },
  { id: "approval", label: "Kézi jóváhagyás megtörtént", required: true, checked: false },
];

const defaultOptions: ReleaseOptions = {
  modules: ["DIMPROVER web", "Fejlesztési Napló / AI Kontextustár", "Szerverőr / monitoring"],
  statuses: [
    { id: "draft", label: "Tervezet" },
    { id: "dev_testing", label: "DEV teszt alatt" },
    { id: "staging_candidate", label: "Release candidate" },
    { id: "approved", label: "Jóváhagyva" },
    { id: "ready_for_production", label: "Élesítésre kész" },
    { id: "production_deployed", label: "Élesítve" },
    { id: "rollback_ready", label: "Rollback pont kész" },
    { id: "rolled_back", label: "Visszaállítva" },
    { id: "blocked", label: "Blokkolva" },
    { id: "archived", label: "Archiválva" },
  ],
  types: [
    { id: "web", label: "Webes release" },
    { id: "desktop", label: "Desktop release" },
    { id: "api", label: "API / backend release" },
    { id: "docs", label: "Dokumentáció" },
    { id: "mixed", label: "Vegyes release" },
  ],
  stages: [
    { id: "dev", label: "DEV" },
    { id: "staging", label: "STAGING" },
    { id: "production", label: "PRODUCTION" },
  ],
  checklist: defaultChecklist,
  hostname: "-",
};

function createVersionSuggestion() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `web-${yyyy}.${mm}.${dd}-${hh}${min}`;
}

const emptyDraft: Draft = {
  version: createVersionSuggestion(),
  title: "Új DIMPROVER web release jelölt",
  type: "web",
  status: "draft",
  sourceStage: "dev",
  targetStage: "production",
  modules: ["DIMPROVER web"],
  summary: "",
  technicalChangelog: "",
  publicChangelog: "",
  internalChangelog: "",
  knownIssues: "",
  testResult: "",
  rollbackPlan: "",
  rollbackPath: "",
  buildResult: "",
  smokeResult: "",
  relatedDevNoteIds: [],
  aiHandoff: "",
};

function formatDateTime(value?: string) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function textInputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10";
}

function textAreaClass(extra = "") {
  return `${textInputClass()} min-h-28 resize-y leading-6 ${extra}`;
}

function optionLabel(options: Option[], id: string) {
  return options.find((item) => item.id === id)?.label ?? id;
}

function draftFromRelease(release: ReleaseRecord): Draft {
  return {
    version: release.version,
    title: release.title,
    type: release.type,
    status: release.status,
    sourceStage: release.sourceStage,
    targetStage: release.targetStage,
    modules: release.modules,
    summary: release.summary,
    technicalChangelog: release.technicalChangelog,
    publicChangelog: release.publicChangelog,
    internalChangelog: release.internalChangelog,
    knownIssues: release.knownIssues,
    testResult: release.testResult,
    rollbackPlan: release.rollbackPlan,
    rollbackPath: release.rollbackPath,
    buildResult: release.buildResult,
    smokeResult: release.smokeResult,
    relatedDevNoteIds: release.relatedDevNoteIds,
    aiHandoff: release.aiHandoff,
  };
}

function toggleArray(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function requiredChecklistState(release?: ReleaseRecord | null) {
  const required = release?.checklist.filter((item) => item.required) ?? [];
  const completed = required.filter((item) => item.checked).length;
  return { completed, total: required.length, ready: required.length > 0 && completed === required.length };
}

function releaseStatusTone(status: ReleaseStatus): "default" | "ok" | "warning" | "danger" | "info" {
  if (status === "production_deployed") return "ok";
  if (status === "approved" || status === "ready_for_production") return "ok";
  if (status === "dev_testing" || status === "staging_candidate") return "info";
  if (status === "rollback_ready") return "warning";
  if (status === "blocked" || status === "rolled_back") return "danger";
  return "default";
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-[0.17em] text-cyan-200/75">{label}</span>
      <div className="mt-2">{children}</div>
      {helper && <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{helper}</span>}
    </label>
  );
}

export default function ReleaseCenterPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [stages, setStages] = useState<RuntimeStage[]>([]);
  const [options, setOptions] = useState(defaultOptions);
  const [stats, setStats] = useState({ total: 0, active: 0, production: 0, blocked: 0, latestVersion: "-" });
  const [storageFile, setStorageFile] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isNew, setIsNew] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const selectedRelease = useMemo(() => releases.find((item) => item.id === selectedId) ?? null, [releases, selectedId]);
  const readiness = requiredChecklistState(selectedRelease);
  const visibleReleases = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return releases.filter((release) => {
      if (statusFilter !== "all" && release.status !== statusFilter) return false;
      if (!clean) return true;
      return [release.version, release.title, release.type, release.status, release.sourceStage, release.targetStage, release.summary, ...(release.modules || [])]
        .some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [query, releases, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(visibleReleases.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedReleases = visibleReleases.slice((safePage - 1) * pageSize, safePage * pageSize);
  const stageOverview: RuntimeStage[] = stages.length ? stages : options.stages.map((stage) => ({
    id: stage.id as ReleaseStage,
    label: stage.label,
    processName: "—",
    status: "unknown",
    uptime: "—",
    pid: "—",
    memory: "—",
    cpu: "—",
    buildTime: "—",
    staticStatus: "unknown",
    note: "Valós futási adat jelenleg nem érhető el.",
  }));

  async function loadCenter(keyOverride = adminKey) {
    const key = keyOverride.trim();
    if (!key) {
      setAuthorized(false);
      setLoading(false);
      setMessage("Licencadmin belépés szükséges. Előbb nyisd meg az /admin felületet.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/release-center", {
        headers: { "x-dimpro-license-admin-key": key, accept: "application/json" },
        cache: "no-store",
      });
      const data = (await response.json()) as ReleaseResponse;
      if (!response.ok || !data.ok || !data.store) {
        setAuthorized(false);
        setMessage(data.error ?? "Nem sikerült betölteni a Release Központot.");
        return;
      }
      setAuthorized(true);
      setReleases(data.store.releases);
      setStages(data.stages ?? []);
      setOptions(data.options ?? defaultOptions);
      setStats(data.stats ?? { total: data.store.releases.length, active: 0, production: 0, blocked: 0, latestVersion: "-" });
      setStorageFile(data.storage?.file ?? data.config?.storageFile ?? "");
      if (data.store.releases.length > 0) {
        const nextSelected = data.store.releases.find((item) => item.id === selectedId) ?? data.store.releases[0];
        setSelectedId(nextSelected.id);
        setDraft(draftFromRelease(nextSelected));
        setIsNew(false);
      } else {
        setSelectedId(null);
        setDraft({ ...emptyDraft, version: createVersionSuggestion() });
        setIsNew(true);
      }
    } catch (error) {
      setAuthorized(false);
      setMessage(error instanceof Error ? error.message : "Ismeretlen Release Központ hiba.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedKey = localStorage.getItem("dimproLicenseAdminKey")?.trim() ?? "";
    setAdminKey(storedKey);
    void loadCenter(storedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    const key = adminKey.trim();
    if (!key) {
      setMessage("Hiányzik a licencadmin kulcs.");
      return null;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/release-center", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = (await response.json()) as ReleaseResponse;
      if (!response.ok || !data.ok || !data.store) {
        setMessage(data.error ?? "A művelet sikertelen.");
        return null;
      }
      setReleases(data.store.releases);
      setStages(data.stages ?? []);
      setOptions(data.options ?? defaultOptions);
      setStats(data.stats ?? { total: data.store.releases.length, active: 0, production: 0, blocked: 0, latestVersion: "-" });
      if (data.affectedRelease) {
        setSelectedId(data.affectedRelease.id);
        setDraft(draftFromRelease(data.affectedRelease));
        setIsNew(false);
      }
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen műveleti hiba.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveRelease(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!draft.title.trim()) {
      setMessage("A release cím megadása kötelező.");
      return;
    }
    if (!draft.version.trim()) {
      setMessage("A verziószám megadása kötelező.");
      return;
    }
    const result = await runAction(isNew ? "create" : "update", isNew ? { draft } : { releaseId: selectedId, draft });
    if (result?.ok) setMessage(isNew ? "Új release bejegyzés létrehozva." : "Release bejegyzés frissítve.");
  }

  function selectRelease(release: ReleaseRecord) {
    setSelectedId(release.id);
    setDraft(draftFromRelease(release));
    setIsNew(false);
    setDrawerOpen(true);
    setMessage("");
  }

  function createNewDraft() {
    setSelectedId(null);
    setDraft({ ...emptyDraft, version: createVersionSuggestion() });
    setIsNew(true);
    setDrawerOpen(true);
    setMessage("");
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text || "-");
      setMessage(success);
    } catch {
      setMessage("Nem sikerült vágólapra másolni. Jelöld ki és másold kézzel.");
    }
  }

  if (!authorized && !loading) {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>Licencadmin belépés szükséges</h1>
          <p>{message || "A Release Központ csak aktív BENJADMIN munkamenettel érhető el."}</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · KIADÁSOK (RELEASE)"
        title="Release Központ / élesítési napló"
        description="DEV → STAGING → PRODUCTION nyilvántartás, checklist, changelog és rollback kontroll. A felület nem végez automatikus élesítést."
        actions={(
          <>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadCenter()} disabled={loading}>
              {loading ? <Loader2 className="is-spinning" size={16} /> : <RefreshCcw size={16} />} Frissítés
            </button>
            <button type="button" className="benjadmin-data-primary-action" onClick={createNewDraft}><Rocket size={16} /> Új release jelölt</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Release bejegyzés" value={stats.total} />
            <BenjadminMetric label="Aktív" value={stats.active} tone="ok" />
            <BenjadminMetric label="Élesített" value={stats.production} tone="ok" />
            <BenjadminMetric label="Blokkolt" value={stats.blocked} tone={stats.blocked ? "danger" : "default"} />
            <BenjadminMetric label="Legutóbbi verzió" value={stats.latestVersion} />
          </>
        )}
        toolbar={(
          <>
            <div className="benjadmin-data-filter-group" aria-label="Release státusz szűrő">
              {["all", "dev_testing", "staging_candidate", "ready_for_production", "production_deployed", "blocked"].map((status) => (
                <button key={status} type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => { setStatusFilter(status); setPage(1); }}>
                  {status === "all" ? "Mind" : optionLabel(options.statuses, status)}
                </button>
              ))}
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés verzió, cím, modul, státusz vagy célkörnyezet alapján" /></label>
            <div className="benjadmin-data-stage-strip" aria-label="Környezetek állapota">
              {stageOverview.map((stage) => <span key={stage.id} className={`is-${stage.status}`}>{stage.label}: <b>{stage.status === "online" ? "ONLINE" : stage.status.toUpperCase()}</b></span>)}
            </div>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message || `Tárolás: ${storageFile || ".dimprover/release-center/release-center.json"}`}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleReleases.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table" data-testid="benjadmin-release-table">
            <thead>
              <tr>
                <th>Verzió</th>
                <th>Release cím</th>
                <th>Típus</th>
                <th>Státusz</th>
                <th>Útvonal</th>
                <th>Modulok</th>
                <th>Checklist</th>
                <th>Build / smoke</th>
                <th>Frissítve</th>
                <th>Művelet</th>
              </tr>
            </thead>
            <tbody>
              {pagedReleases.length === 0 ? (
                <tr><td colSpan={10} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő release bejegyzés.</td></tr>
              ) : pagedReleases.map((release) => {
                const state = requiredChecklistState(release);
                return (
                  <tr key={release.id}>
                    <td className="is-mono"><strong>{release.version}</strong></td>
                    <td className="is-wide"><strong>{release.title}</strong><br /><small>{release.summary || "Nincs összefoglaló."}</small></td>
                    <td>{optionLabel(options.types, release.type)}</td>
                    <td><BenjadminStatusPill tone={releaseStatusTone(release.status)}>{optionLabel(options.statuses, release.status)}</BenjadminStatusPill></td>
                    <td className="is-nowrap">{release.sourceStage.toUpperCase()} → {release.targetStage.toUpperCase()}</td>
                    <td>{release.modules.length ? release.modules.length : 0}</td>
                    <td><BenjadminStatusPill tone={state.ready ? "ok" : "warning"}>{state.completed}/{state.total}</BenjadminStatusPill></td>
                    <td><span className="benjadmin-data-compact-result">B: {release.buildResult ? "rögzítve" : "—"} · S: {release.smokeResult ? "rögzítve" : "—"}</span></td>
                    <td className="is-nowrap">{formatDateTime(release.updatedAt)}</td>
                    <td><button type="button" className="benjadmin-data-row-action" onClick={() => selectRelease(release)}>Részletek</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {drawerOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Release szerkesztő bezárása" onClick={() => setDrawerOpen(false)} /> : null}
      {drawerOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-release-drawer" data-testid="benjadmin-release-drawer">
          <header>
            <div><span>{isNew ? "ÚJ RELEASE JELÖLT" : "RELEASE RÉSZLETEK"}</span><strong>{draft.version || "—"}</strong></div>
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Bezárás"><X size={18} /></button>
          </header>
          <form onSubmit={saveRelease} className="benjadmin-data-drawer__body benjadmin-release-form">
            <div className="benjadmin-data-security-note">
              <AlertTriangle size={17} /><div><strong>Biztonsági szabály</strong><span>Ez a felület nyilvántart és jóváhagyási állapotot kezel. Automatikus PRODUCTION deploy nincs bekötve.</span></div>
            </div>

            <div className="benjadmin-data-form-grid">
              <Field label="Release cím"><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={textInputClass()} /></Field>
              <Field label="Verzió"><input value={draft.version} onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))} className={textInputClass()} /></Field>
              <Field label="Státusz"><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ReleaseStatus }))} className={textInputClass()}>{options.statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <Field label="Release típus"><select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as ReleaseType }))} className={textInputClass()}>{options.types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <Field label="Forrás környezet"><select value={draft.sourceStage} onChange={(event) => setDraft((current) => ({ ...current, sourceStage: event.target.value as ReleaseStage }))} className={textInputClass()}>{options.stages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <Field label="Cél környezet"><select value={draft.targetStage} onChange={(event) => setDraft((current) => ({ ...current, targetStage: event.target.value as ReleaseStage }))} className={textInputClass()}>{options.stages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            </div>

            <section className="benjadmin-data-form-section">
              <header><strong>Érintett modulok</strong><span>{draft.modules.length} kiválasztva</span></header>
              <div className="benjadmin-data-chip-grid">
                {options.modules.map((item) => <button key={item} type="button" className={draft.modules.includes(item) ? "is-active" : ""} onClick={() => setDraft((current) => ({ ...current, modules: toggleArray(current.modules, item) }))}>{draft.modules.includes(item) ? "✓ " : "+ "}{item}</button>)}
              </div>
            </section>

            <Field label="Rövid összefoglaló"><textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} className={textAreaClass("min-h-20")} /></Field>
            <div className="benjadmin-release-form__two">
              <Field label="Technikai változásnapló (changelog)"><textarea value={draft.technicalChangelog} onChange={(event) => setDraft((current) => ({ ...current, technicalChangelog: event.target.value }))} className={textAreaClass("min-h-28")} /></Field>
              <Field label="Publikus változásnapló (changelog)"><textarea value={draft.publicChangelog} onChange={(event) => setDraft((current) => ({ ...current, publicChangelog: event.target.value }))} className={textAreaClass("min-h-28")} /></Field>
              <Field label="Belső fejlesztői változásnapló"><textarea value={draft.internalChangelog} onChange={(event) => setDraft((current) => ({ ...current, internalChangelog: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Ismert hibák / kockázatok"><textarea value={draft.knownIssues} onChange={(event) => setDraft((current) => ({ ...current, knownIssues: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Build eredmény"><textarea value={draft.buildResult} onChange={(event) => setDraft((current) => ({ ...current, buildResult: event.target.value }))} className={textAreaClass("min-h-20")} /></Field>
              <Field label="Smoke / felületteszt"><textarea value={draft.smokeResult} onChange={(event) => setDraft((current) => ({ ...current, smokeResult: event.target.value }))} className={textAreaClass("min-h-20")} /></Field>
              <Field label="Rollback terv"><textarea value={draft.rollbackPlan} onChange={(event) => setDraft((current) => ({ ...current, rollbackPlan: event.target.value }))} className={textAreaClass("min-h-20")} /></Field>
              <Field label="Rollback / backup útvonal"><textarea value={draft.rollbackPath} onChange={(event) => setDraft((current) => ({ ...current, rollbackPath: event.target.value }))} className={textAreaClass("min-h-20 font-mono")} /></Field>
            </div>

            {!isNew && selectedRelease ? (
              <section className="benjadmin-data-form-section">
                <header><strong>Élesítési ellenőrzőlista (checklist)</strong><span>{readiness.completed}/{readiness.total} kötelező</span></header>
                <div className="benjadmin-release-checklist">
                  {selectedRelease.checklist.map((item) => (
                    <label key={item.id}><input type="checkbox" checked={item.checked} onChange={(event) => void runAction("toggleChecklist", { releaseId: selectedRelease.id, itemId: item.id, checked: event.target.checked })} /><span><strong>{item.label}{item.required ? " *" : ""}</strong><small>{item.checked ? `Kész: ${formatDateTime(item.checkedAt ?? undefined)}` : "Nincs bepipálva"}</small></span></label>
                  ))}
                </div>
              </section>
            ) : null}

            <Field label="AI release átadó blokk"><textarea value={draft.aiHandoff} onChange={(event) => setDraft((current) => ({ ...current, aiHandoff: event.target.value }))} className={textAreaClass("min-h-32")} /></Field>

            <div className="benjadmin-release-form__actions">
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void copyText(draft.aiHandoff, "Release AI átadó blokk vágólapra másolva.")}><ClipboardCopy size={16} /> AI átadó másolása</button>
              <button type="submit" className="benjadmin-data-primary-action" disabled={saving}>{saving ? <Loader2 className="is-spinning" size={16} /> : <Save size={16} />}{isNew ? "Release jelölt mentése" : "Módosítás mentése"}</button>
            </div>

            {!isNew && selectedId ? (
              <section className="benjadmin-release-status-actions">
                <button type="button" onClick={() => void runAction("setStatus", { releaseId: selectedId, status: "staging_candidate" })}><GitBranch size={15} /> RC jelölés</button>
                <button type="button" onClick={() => void runAction("setStatus", { releaseId: selectedId, status: "ready_for_production" })}><ShieldCheck size={15} /> Élesítésre kész</button>
                <button type="button" onClick={() => { if (!readiness.ready && !window.confirm("A kötelező checklist még nem teljes. Biztosan élesítettként jelölöd?")) return; void runAction("setStatus", { releaseId: selectedId, status: "production_deployed" }); }}><PackageCheck size={15} /> Élesítettként rögzítés</button>
                <button type="button" onClick={() => void runAction("setStatus", { releaseId: selectedId, status: "rollback_ready" })}><History size={15} /> Rollback pont kész</button>
              </section>
            ) : null}
          </form>
        </aside>
      ) : null}
    </>
  );
}
