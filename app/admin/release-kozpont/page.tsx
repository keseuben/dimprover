"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  GitBranch,
  History,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Rocket,
  Save,
  ShieldCheck,
} from "lucide-react";

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

function statusClass(status: ReleaseStatus) {
  if (status === "production_deployed") return "border-emerald-300/35 bg-emerald-400/10 text-emerald-100";
  if (status === "ready_for_production" || status === "approved") return "border-lime-300/35 bg-lime-400/10 text-lime-100";
  if (status === "staging_candidate" || status === "dev_testing") return "border-cyan-300/35 bg-cyan-400/10 text-cyan-100";
  if (status === "blocked" || status === "rolled_back") return "border-red-300/35 bg-red-400/10 text-red-100";
  if (status === "rollback_ready") return "border-amber-300/35 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/[0.05] text-slate-200";
}

function stageStatusClass(status: RuntimeStage["status"]) {
  if (status === "online") return "border-emerald-300/35 bg-emerald-400/10 text-emerald-100";
  if (status === "offline") return "border-red-300/35 bg-red-400/10 text-red-100";
  return "border-amber-300/35 bg-amber-400/10 text-amber-100";
}

function toggleArray(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function requiredChecklistState(release?: ReleaseRecord | null) {
  const required = release?.checklist.filter((item) => item.required) ?? [];
  const completed = required.filter((item) => item.checked).length;
  return { completed, total: required.length, ready: required.length > 0 && completed === required.length };
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

function StatCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{helper}</p>
    </div>
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

  const selectedRelease = useMemo(() => releases.find((item) => item.id === selectedId) ?? null, [releases, selectedId]);
  const readiness = requiredChecklistState(selectedRelease);

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
    setMessage("");
  }

  function createNewDraft() {
    setSelectedId(null);
    setDraft({ ...emptyDraft, version: createVersionSuggestion() });
    setIsNew(true);
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
      <main className="min-h-screen bg-[#050812] px-5 py-8 text-slate-100 lg:px-8">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
          <div className="w-full rounded-[2rem] border border-amber-300/25 bg-slate-950/85 p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300/75">Védett Release Központ</p>
            <h1 className="mt-4 text-3xl font-black text-white">Licencadmin belépés szükséges</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">A Release Központ csak licencadmin belépés után érhető el.</p>
            {message && <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{message}</p>}
            <Link href="/admin" className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950">Licencadmin belépés →</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#06111f] text-white">
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.16)_1px,transparent_1px)] [background-size:54px_54px]" />
      <div className="relative mx-auto max-w-[1780px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-7 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link href="/admin/dev" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-white">
                <ArrowLeft size={18} /> Vissza a fejlesztői kezdőlapra
              </Link>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-300/80">DIMPROVER belső verziókövetés</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">Release Központ / Élesítési napló</h1>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
                DEV → STAGING → PRODUCTION állapotkövetés, release candidate nyilvántartás, checklist, changelog, rollback pont és kézi jóváhagyási folyamat. Az MVP nem végez automatikus élesítést.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[440px]">
              <button type="button" onClick={createNewDraft} className="inline-flex items-center justify-center gap-3 rounded-2xl bg-lime-300 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-lime-200">
                <Rocket size={18} /> Új release jelölt
              </button>
              <button type="button" onClick={() => void loadCenter()} disabled={loading} className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/30 hover:text-white disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />} Frissítés
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <StatCard label="Release bejegyzés" value={stats.total} helper="Belső release nyilvántartás." />
            <StatCard label="Aktív" value={stats.active} helper="Nem archivált release jelöltek." />
            <StatCard label="Élesített" value={stats.production} helper="Production deployed státuszú verziók." />
            <StatCard label="Legutóbbi verzió" value={stats.latestVersion} helper="A legutóbb frissített release verziója." />
          </div>

          {message && <p className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p>}
        </header>

        <section className="mb-6 grid gap-4 xl:grid-cols-3">
          {stages.map((stage) => (
            <article key={stage.id} className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{stage.id}</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{stage.label}</h2>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${stageStatusClass(stage.status)}`}>{stage.status}</span>
              </div>
              <div className="mt-5 grid gap-2 text-sm font-semibold text-slate-300 sm:grid-cols-2">
                <p>PM2: <span className="font-mono text-cyan-100">{stage.processName}</span></p>
                <p>PID: <span className="font-mono text-cyan-100">{stage.pid}</span></p>
                <p>Uptime: <span className="text-cyan-100">{stage.uptime}</span></p>
                <p>Memória: <span className="text-cyan-100">{stage.memory}</span></p>
                <p>CPU: <span className="text-cyan-100">{stage.cpu}</span></p>
                <p>Static: <span className={stage.staticStatus === "ok" ? "text-emerald-200" : "text-red-200"}>{stage.staticStatus}</span></p>
              </div>
              <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">Build idő: {formatDateTime(stage.buildTime)}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{stage.note}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">Release lista</h2>
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">{releases.length} db</span>
              </div>
              <div className="max-h-[920px] space-y-3 overflow-auto pr-1">
                {loading ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm font-bold text-slate-400">Betöltés...</div>
                ) : releases.map((release) => {
                  const state = requiredChecklistState(release);
                  return (
                    <button key={release.id} type="button" onClick={() => selectRelease(release)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === release.id ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-slate-950/35 hover:border-cyan-300/30 hover:bg-white/[0.07]"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-white">{release.title}</p>
                          <p className="mt-1 truncate text-xs font-bold text-cyan-100/80">{release.version}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(release.status)}`}>{optionLabel(options.statuses, release.status)}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs font-semibold leading-5 text-slate-400">{release.summary || release.technicalChangelog || "Nincs összefoglaló."}</p>
                      <p className="mt-3 text-[11px] font-bold text-slate-500">Checklist: {state.completed}/{state.total} kötelező · Frissítve: {formatDateTime(release.updatedAt)}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
            <form onSubmit={saveRelease} className="grid gap-5">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-300/80">{isNew ? "Új release jelölt" : "Release szerkesztése"}</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{draft.title || "Cím nélküli release"}</h2>
                  {!isNew && selectedRelease && <p className="mt-2 text-xs font-semibold text-slate-500">Létrehozva: {formatDateTime(selectedRelease.createdAt)} · Frissítve: {formatDateTime(selectedRelease.updatedAt)}</p>}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void copyText(draft.aiHandoff, "Release AI átadó blokk vágólapra másolva.")} className="inline-flex items-center gap-2 rounded-2xl border border-lime-300/35 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-100 hover:bg-lime-300/15">
                    <ClipboardCopy size={17} /> AI átadó másolása
                  </button>
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Mentés
                  </button>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-amber-300/25 bg-amber-300/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={20} />
                  <div>
                    <p className="text-sm font-black text-amber-100">Biztonsági szabály</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-amber-50/80">Ez a Release Központ MVP nyilvántart, ellenőriz és jóváhagyási állapotot kezel. Nem másolja automatikusan a DEV állapotot a publikus éles felületre.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_0.7fr_0.7fr]">
                <Field label="Release cím">
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={textInputClass()} placeholder="pl. Fejlesztési Napló AI Kontextussegéd élesítés" />
                </Field>
                <Field label="Verziószám">
                  <input value={draft.version} onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))} className={textInputClass()} placeholder="web-2026.07.13-1850" />
                </Field>
                <Field label="Státusz">
                  <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ReleaseStatus }))} className={textInputClass()}>
                    {options.statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Release típus">
                  <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as ReleaseType }))} className={textInputClass()}>
                    {options.types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Forrás állapot">
                  <select value={draft.sourceStage} onChange={(event) => setDraft((current) => ({ ...current, sourceStage: event.target.value as ReleaseStage }))} className={textInputClass()}>
                    {options.stages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Cél állapot">
                  <select value={draft.targetStage} onChange={(event) => setDraft((current) => ({ ...current, targetStage: event.target.value as ReleaseStage }))} className={textInputClass()}>
                    {options.stages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Kötelező checklist">
                  <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${readiness.ready ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-amber-300/35 bg-amber-300/10 text-amber-100"}`}>
                    {selectedRelease ? `${readiness.completed}/${readiness.total} kész` : "Mentés után aktív"}
                  </div>
                </Field>
              </div>

              <Field label="Érintett modulok" helper="Több modul is választható. Ezek alapján később szűrhető lesz, hogy mely release mit érintett.">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {options.modules.map((item) => (
                    <label key={item} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-300/30">
                      <input type="checkbox" checked={draft.modules.includes(item)} onChange={() => setDraft((current) => ({ ...current, modules: toggleArray(current.modules, item) }))} className="h-4 w-4 accent-cyan-300" />
                      {item}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Rövid összefoglaló">
                <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} className={textAreaClass("min-h-24")} placeholder="Mi kerülne át a dev/staging állapotból az éles rendszerbe?" />
              </Field>

              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="Technikai changelog">
                  <textarea value={draft.technicalChangelog} onChange={(event) => setDraft((current) => ({ ...current, technicalChangelog: event.target.value }))} className={textAreaClass("min-h-44")} placeholder="Fájlok, API route-ok, adatmodell, build, konfiguráció, PM2, static asset változások." />
                </Field>
                <Field label="Publikus changelog">
                  <textarea value={draft.publicChangelog} onChange={(event) => setDraft((current) => ({ ...current, publicChangelog: event.target.value }))} className={textAreaClass("min-h-44")} placeholder="Felhasználóbarát szöveg: új funkciók, javítások, fontos változások technikai részletek nélkül." />
                </Field>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="Belső fejlesztői changelog">
                  <textarea value={draft.internalChangelog} onChange={(event) => setDraft((current) => ({ ...current, internalChangelog: event.target.value }))} className={textAreaClass("min-h-36")} placeholder="Belső döntések, kockázatok, fejlesztési előzmények." />
                </Field>
                <Field label="Ismert hibák / kockázatok">
                  <textarea value={draft.knownIssues} onChange={(event) => setDraft((current) => ({ ...current, knownIssues: event.target.value }))} className={textAreaClass("min-h-36 border-amber-300/25 bg-amber-300/5")} placeholder="Mi az, amit még tudni kell élesítés előtt?" />
                </Field>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="Build eredmény">
                  <textarea value={draft.buildResult} onChange={(event) => setDraft((current) => ({ ...current, buildResult: event.target.value }))} className={textAreaClass("min-h-28")} placeholder="Pl. npm run build OK, BUILD_EXIT=0, figyelmeztetések..." />
                </Field>
                <Field label="Smoke / felületteszt eredmény">
                  <textarea value={draft.smokeResult} onChange={(event) => setDraft((current) => ({ ...current, smokeResult: event.target.value }))} className={textAreaClass("min-h-28")} placeholder="HTTP 200, CSS/static 200, API OK, alap route-ok tesztelve..." />
                </Field>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="Rollback terv">
                  <textarea value={draft.rollbackPlan} onChange={(event) => setDraft((current) => ({ ...current, rollbackPlan: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Mit kell visszaállítani, ha élesítés után hiba van?" />
                </Field>
                <Field label="Rollback / backup útvonal">
                  <textarea value={draft.rollbackPath} onChange={(event) => setDraft((current) => ({ ...current, rollbackPath: event.target.value }))} className={textAreaClass("min-h-32 font-mono")} placeholder="pl. backups/release_before_..." />
                </Field>
              </div>

              {selectedRelease && (
                <section className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/5 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/80">Élesítési checklist</p>
                      <p className="mt-1 text-sm font-semibold text-slate-400">Csak nyilvántartás és jóváhagyási kontroll. A tényleges deploy gomb nincs bekötve.</p>
                    </div>
                    <div className={`rounded-full border px-4 py-2 text-xs font-black ${readiness.ready ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-amber-300/35 bg-amber-300/10 text-amber-100"}`}>{readiness.completed}/{readiness.total} kötelező</div>
                  </div>
                  <div className="grid gap-2 xl:grid-cols-2">
                    {selectedRelease.checklist.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-300/30">
                        <input type="checkbox" checked={item.checked} onChange={(event) => void runAction("toggleChecklist", { releaseId: selectedRelease.id, itemId: item.id, checked: event.target.checked })} className="mt-1 h-4 w-4 accent-cyan-300" />
                        <span>
                          <span className="block font-black text-white">{item.label} {item.required && <span className="text-amber-200">*</span>}</span>
                          <span className="mt-1 block text-xs text-slate-500">{item.checked ? `Kész: ${formatDateTime(item.checkedAt ?? undefined)}` : "Nincs bepipálva"}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              <Field label="AI release átadó blokk" helper="Ezt lehet másik csevegőbe, Codex review-ba vagy későbbi release auditba másolni.">
                <textarea value={draft.aiHandoff} onChange={(event) => setDraft((current) => ({ ...current, aiHandoff: event.target.value }))} className={textAreaClass("min-h-56 border-lime-300/25 bg-lime-300/5 focus:border-lime-300 focus:ring-lime-300/10")} />
              </Field>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} {isNew ? "Release jelölt mentése" : "Módosítás mentése"}
                  </button>
                  {!isNew && selectedId && (
                    <>
                      <button type="button" onClick={() => void runAction("setStatus", { releaseId: selectedId, status: "staging_candidate" })} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/15">
                        <GitBranch size={17} /> RC jelölés
                      </button>
                      <button type="button" onClick={() => void runAction("setStatus", { releaseId: selectedId, status: "ready_for_production" })} className="inline-flex items-center gap-2 rounded-2xl border border-lime-300/35 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-100 hover:bg-lime-300/15">
                        <ShieldCheck size={17} /> Élesítésre kész
                      </button>
                      <button type="button" onClick={() => { if (!readiness.ready && !window.confirm("A kötelező checklist még nem teljes. Biztosan élesítettként jelölöd?")) return; void runAction("setStatus", { releaseId: selectedId, status: "production_deployed" }); }} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-300/15">
                        <PackageCheck size={17} /> Élesítettként rögzítés
                      </button>
                      <button type="button" onClick={() => void runAction("setStatus", { releaseId: selectedId, status: "rollback_ready" })} className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100 hover:bg-amber-300/15">
                        <History size={17} /> Rollback pont kész
                      </button>
                    </>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
                  <CheckCircle2 className="mr-2 inline text-cyan-200" size={15} />
                  Tárolás: <span className="font-mono text-slate-300">{storageFile || ".dimprover/release-center/release-center.json"}</span>
                </div>
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
