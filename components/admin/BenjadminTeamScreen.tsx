"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Coins,
  Gauge,
  Moon,
  RefreshCw,
  Sun,
  Server,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

type Worker = {
  id: string;
  code: string;
  name: string;
  role: string;
  status: string;
};

type Task = {
  assignedWorkerId?: string | null;
  status: string;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type Session = {
  workerId?: string | null;
  status: string;
  openedAt?: string | null;
};

type Environment = {
  code: string;
  name: string;
  status: string;
  read_only?: boolean;
};

type EngineState = {
  workers: Worker[];
  tasks: Task[];
  sessions: Session[];
  environments: Environment[];
  updatedAt?: string;
};

type ServerStatus = {
  ok: boolean;
  collectedAt?: string;
  server?: {
    hostname?: string;
    loadAverage?: number[];
    uptimeSeconds?: number;
  };
  memory?: {
    totalBytes?: number;
    availableBytes?: number;
    usagePercent?: number;
    swapTotalBytes?: number;
    swapUsedBytes?: number;
    swapFreeBytes?: number;
    swapUsagePercent?: number;
  };
  disk?: {
    sizeKb?: number;
    usedKb?: number;
    availableKb?: number;
    usePercent?: number;
  } | null;
  services?: {
    nginx?: { ok?: boolean };
    pm2?: { ok?: boolean; processes?: Array<{ status?: string }> };
  };
  operations?: {
    releaseStorage?: { totalBytes?: number; fileCount?: number; status?: string };
    backup?: { status?: string; totalCount?: number; latestSizeBytes?: number };
  };
};

type ControlSnapshot = {
  monitoring?: Array<Record<string, unknown>>;
  storageTelemetry?: Array<Record<string, unknown>>;
  summary?: {
    activeCommands?: number;
    pendingApprovals?: number;
    monitorSamples?: number;
    storageSamples?: number;
  };
};

type PartnerSnapshot = {
  runtimeIsolation?: {
    ready?: boolean;
    stage?: string;
    root?: string;
  };
};

type EntitlementSnapshot = {
  summary?: {
    aiEnabledLicenses?: number;
    aiRequestsThisMonth?: number;
    aiCostHufThisMonth?: number;
    aiMonthlyBudgetHuf?: number;
    centralAiMonthlyBudgetHuf?: number;
    legacyAiMonthlyBudgetHuf?: number;
    aiBudgetSource?: string;
    aiBudgetPercent?: number;
    aiInputTokensThisMonth?: number;
    aiOutputTokensThisMonth?: number;
    aiTotalTokensThisMonth?: number;
    aiMonthlyTokenBudget?: number;
    centralAiMonthlyTokenBudget?: number;
    aiTokenBudgetSource?: string;
    aiTokenBudgetPercent?: number;
    aiRuntimePolicyMode?: string;
    aiRuntimeCentralPolicyLicenses?: number;
  };
};


type InfrastructureServer = {
  code: string;
  label: string;
  host: string;
  online: boolean;
  latencyMs?: number | null;
  statusCode?: number | null;
  memory?: { usagePercent?: number; totalBytes?: number; usedBytes?: number; availableBytes?: number } | null;
  swap?: { usagePercent?: number; totalBytes?: number; usedBytes?: number; availableBytes?: number } | null;
  disk?: { usePercent?: number; totalBytes?: number; usedBytes?: number; availableBytes?: number } | null;
  telemetry: string;
  sampledAt?: string | null;
  load1m?: number | null;
  note: string;
};

type InfrastructureStorage = {
  code: string;
  label: string;
  endpoint?: string | null;
  bucket?: string | null;
  online: boolean;
  usedBytes?: number | null;
  capacityBytes?: number | null;
  freeBytes?: number | null;
  usagePercent?: number | null;
  objectCount?: number | null;
  truncated?: boolean;
  note: string;
};

type InfrastructureSummary = {
  ok: boolean;
  collectedAt?: string;
  servers: InfrastructureServer[];
  storages: InfrastructureStorage[];
};

type TeamMember = {
  id: string;
  code?: string;
  name: string;
  position: string;
  responsibilities: string[];
  image: string;
  tone: "owner" | "lead" | "internal" | "partner";
};

type LineSeries = {
  label: string;
  values: number[];
  tone: "cyan" | "lime" | "amber";
};

const TEAM: TeamMember[] = [
  {
    id: "benjadmin",
    name: "Benjadmin",
    position: "Emberi főirányító · rendszertulajdonos",
    responsibilities: ["Végső döntések és prioritások", "Jóváhagyások és fejlesztési irány", "PROD műveletek explicit engedélyezése"],
    image: "/benjadmin/team/01_BenjAdmin.webp",
    tone: "owner",
  },
  {
    id: "benai",
    name: "Ben-AI",
    position: "Fejlesztésirányító AI · koordinátor",
    responsibilities: ["Feladat- és fejlesztőkiosztás", "Munkafa, ág és hatókör koordináció", "Acceptance, build és fejlesztési sorrend"],
    image: "/benjadmin/team/02_BenAI.webp",
    tone: "lead",
  },
  {
    id: "armin",
    code: "ARMINAI",
    name: "Ármin-AI",
    position: "Belső kódmérnök · frontend / alkalmazás",
    responsibilities: ["Felületek és alkalmazáslogika", "Komponensek és reszponzív működés", "Frontend teszt és acceptance"],
    image: "/benjadmin/team/03_ArminAI.webp",
    tone: "internal",
  },
  {
    id: "jazmin",
    code: "JAZMINAI",
    name: "Jázmin-AI",
    position: "Belső kódmérnök · backend / adatbázis",
    responsibilities: ["API és szerveroldali logika", "Adatbázis és migráció", "Backend teszt és adatbiztonság"],
    image: "/benjadmin/team/04_JazminAI.webp",
    tone: "internal",
  },
  {
    id: "outmin",
    code: "OUTMINAI",
    name: "Outmin-AI",
    position: "Külső kódmérnök · partner fejlesztési sík",
    responsibilities: ["Partner- és külső projektek", "Elkülönített partner munkafa", "Belső DIMPRO hozzáférés: alapértelmezett tiltás"],
    image: "/benjadmin/team/05_OutminAI.webp",
    tone: "partner",
  },
];

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatBytes(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function formatCompactNumber(value?: number | null) {
  const amount = Math.max(0, Number(value || 0));
  return new Intl.NumberFormat("hu-HU", { notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

function formatHuf(value?: number | null) {
  const amount = Math.max(0, Number(value || 0));
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: amount < 100 ? 1 : 0 }).format(amount)} Ft`;
}

function formatUptime(seconds?: number | null) {
  const value = Math.max(0, Number(seconds || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  return days ? `${days} nap ${hours} óra` : `${hours} óra`;
}

function isOpenTask(status?: string) {
  return ["queued", "ready", "claimed", "in_progress", "testing", "blocked"].includes((status || "").toLowerCase());
}

function statusLabel(status?: string) {
  const value = (status || "").toLowerCase();
  const labels: Record<string, string> = {
    ready: "Kész (READY)",
    active: "Aktív",
    online: "Online",
    open: "Nyitott",
    busy: "Foglalt",
    closed: "Lezárt",
    offline: "Offline",
    quarantine: "Karantén",
  };
  return labels[value] || status || "Nincs adat";
}

function chartPath(values: number[], width = 320, height = 94) {
  if (!values.length) return "";
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const left = 8;
  const right = width - 8;
  const top = 8;
  const bottom = height - 8;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : left + (index / (values.length - 1)) * (right - left);
    const y = bottom - ((value - min) / range) * (bottom - top);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function MiniLineChart({ title, subtitle, labels, series, emptyText }: { title: string; subtitle: string; labels: string[]; series: LineSeries[]; emptyText?: string }) {
  const hasData = series.some((item) => item.values.some((value) => value > 0));
  const displayLabels = labels.length <= 4
    ? labels
    : [labels[0], labels[Math.floor((labels.length - 1) / 2)], labels[labels.length - 1]];
  return (
    <section className="benjadmin-team-screen__chart-card">
      <header>
        <div><span>VONALDIAGRAM</span><h3>{title}</h3></div>
        <small>{subtitle}</small>
      </header>
      <div className="benjadmin-team-screen__chart-wrap">
        {hasData ? (
          <svg viewBox="0 0 320 112" role="img" aria-label={title}>
            <line x1="8" x2="312" y1="94" y2="94" className="benjadmin-team-screen__chart-axis" />
            <line x1="8" x2="312" y1="51" y2="51" className="benjadmin-team-screen__chart-gridline" />
            {series.map((item) => (
              <polyline key={item.label} points={chartPath(item.values)} className={`benjadmin-team-screen__chart-line is-${item.tone}`} fill="none" />
            ))}
          </svg>
        ) : (
          <div className="benjadmin-team-screen__chart-empty"><Activity size={22} /><span>{emptyText || "Még nincs elegendő valós mérési minta."}</span></div>
        )}
      </div>
      <div className="benjadmin-team-screen__chart-labels">
        {displayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
      <div className="benjadmin-team-screen__legend">
        {series.map((item) => <span key={item.label} className={`is-${item.tone}`}><i />{item.label}</span>)}
      </div>
    </section>
  );
}

function UsageBar({ label, value, detail }: { label: string; value?: number | null; detail: string }) {
  const known = typeof value === "number" && Number.isFinite(value);
  const safe = known ? Math.max(0, Math.min(100, value)) : 0;
  const tone = !known ? " is-unknown" : safe >= 90 ? " is-danger" : safe >= 75 ? " is-warning" : "";
  return (
    <div className={`benjadmin-team-screen__usage${tone}`}>
      <div><span>{label}</span><strong>{known ? `${Math.round(safe)}%` : "—"}</strong></div>
      <div className="benjadmin-team-screen__usage-track"><span style={{ width: `${safe}%` }} /></div>
      <small>{detail}</small>
    </div>
  );
}

export default function BenjadminTeamScreen({ theme, onThemeToggle, onClose }: { theme: "light" | "dark"; onThemeToggle: () => void; onClose: () => void }) {
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [control, setControl] = useState<ControlSnapshot | null>(null);
  const [partner, setPartner] = useState<PartnerSnapshot | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot | null>(null);
  const [infrastructure, setInfrastructure] = useState<InfrastructureSummary | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<Array<{ label: string; production: number; database: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    const key = window.localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) {
      setError("Hiányzik az aktív BENJADMIN admin munkamenet.");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const headers = { "x-dimpro-license-admin-key": key };
      const [engineResponse, serverResponse, controlResponse, partnerResponse, infrastructureResponse, entitlementResponse] = await Promise.all([
        fetch("/api/dev/engine/state", { headers, cache: "no-store" }),
        fetch("/api/license/server-status", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/control-plane", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/partner-projects", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/infrastructure-summary", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/entitlements", { headers, cache: "no-store" }),
      ]);
      const [enginePayload, serverPayload, controlPayload, partnerPayload, infrastructurePayload, entitlementPayload] = await Promise.all([
        engineResponse.json(), serverResponse.json(), controlResponse.json(), partnerResponse.json(), infrastructureResponse.json(), entitlementResponse.json(),
      ]);
      if (!engineResponse.ok || !enginePayload?.state) throw new Error(enginePayload?.error || "A fejlesztési állapot nem tölthető be.");
      setEngine(enginePayload.state as EngineState);
      if (serverResponse.ok) setServerStatus(serverPayload as ServerStatus);
      if (controlResponse.ok) setControl((controlPayload?.controlPlane || controlPayload) as ControlSnapshot);
      if (partnerResponse.ok) setPartner(partnerPayload as PartnerSnapshot);
      if (entitlementResponse.ok && entitlementPayload?.entitlements) setEntitlements(entitlementPayload.entitlements as EntitlementSnapshot);
      if (infrastructureResponse.ok) {
        const nextInfrastructure = infrastructurePayload as InfrastructureSummary;
        setInfrastructure(nextInfrastructure);
        const production = nextInfrastructure.servers?.find((item) => item.code === "PRODUCTION");
        const database = nextInfrastructure.servers?.find((item) => item.code === "DATABASE");
        const stamp = new Date();
        setLatencyHistory((current) => [...current, {
          label: stamp.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          production: Number(production?.latencyMs || 0),
          database: Number(database?.latencyMs || 0),
        }].slice(-12));
      }
      setRefreshedAt(new Date());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A csapatképernyő adatfrissítése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const workerByCode = useMemo(() => new Map((engine?.workers || []).map((worker) => [worker.code, worker])), [engine?.workers]);

  const activity = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const labels: string[] = [];
    const tasks = Array.from({ length: 7 }, () => 0);
    const sessions = Array.from({ length: 7 }, () => 0);
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(today - offset * 86400000);
      labels.push(new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit" }).format(date));
    }
    for (const task of engine?.tasks || []) {
      const stamp = new Date(task.updatedAt || task.createdAt || "");
      if (Number.isNaN(stamp.getTime())) continue;
      const day = new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate()).getTime();
      const diff = Math.floor((today - day) / 86400000);
      if (diff >= 0 && diff < 7) tasks[6 - diff] += 1;
    }
    for (const session of engine?.sessions || []) {
      const stamp = new Date(session.openedAt || "");
      if (Number.isNaN(stamp.getTime())) continue;
      const day = new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate()).getTime();
      const diff = Math.floor((today - day) / 86400000);
      if (diff >= 0 && diff < 7) sessions[6 - diff] += 1;
    }
    return { labels, tasks, sessions };
  }, [engine?.sessions, engine?.tasks]);

  const monitorTrend = useMemo(() => {
    const rows = [...(control?.monitoring || [])]
      .filter((row) => textValue(row.target_kind) === "DEV" && textValue(row.sampled_at))
      .sort((a, b) => Date.parse(textValue(a.sampled_at)) - Date.parse(textValue(b.sampled_at)))
      .slice(-18);
    return {
      labels: rows.map((row) => new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit" }).format(new Date(textValue(row.sampled_at)))),
      cpu: rows.map((row) => numberValue(row.cpu_percent)),
      memory: rows.map((row) => numberValue(row.memory_percent)),
      disk: rows.map((row) => numberValue(row.disk_percent)),
    };
  }, [control?.monitoring]);

  const persistentLatencyTrend = useMemo(() => {
    const rows = [...(control?.monitoring || [])]
      .filter((row) => ["PRODUCTION", "DATABASE"].includes(textValue(row.target_kind)) && textValue(row.sampled_at))
      .sort((a, b) => Date.parse(textValue(a.sampled_at)) - Date.parse(textValue(b.sampled_at)))
      .slice(-36);
    const buckets = new Map<string, { label: string; production: number; database: number }>();
    for (const row of rows) {
      const stamp = new Date(textValue(row.sampled_at));
      if (Number.isNaN(stamp.getTime())) continue;
      const key = stamp.toISOString().slice(0, 16);
      const current = buckets.get(key) || {
        label: stamp.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }),
        production: 0,
        database: 0,
      };
      if (textValue(row.target_kind) === "PRODUCTION") current.production = numberValue(row.response_ms);
      if (textValue(row.target_kind) === "DATABASE") current.database = numberValue(row.response_ms);
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).slice(-12);
  }, [control?.monitoring]);

  const diskTotal = Number(serverStatus?.disk?.sizeKb || 0) * 1024;
  const diskUsed = Number(serverStatus?.disk?.usedKb || 0) * 1024;
  const diskFree = Number(serverStatus?.disk?.availableKb || 0) * 1024;
  const memoryTotal = Number(serverStatus?.memory?.totalBytes || 0);
  const memoryAvailable = Number(serverStatus?.memory?.availableBytes || 0);
  const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);
  const swapTotal = Number(serverStatus?.memory?.swapTotalBytes || 0);
  const swapUsed = Number(serverStatus?.memory?.swapUsedBytes || 0);
  const swapFree = Number(serverStatus?.memory?.swapFreeBytes || Math.max(0, swapTotal - swapUsed));
  const pm2Processes = serverStatus?.services?.pm2?.processes || [];
  const pm2Online = pm2Processes.filter((item) => item.status === "online").length;
  const openTasks = (engine?.tasks || []).filter((task) => isOpenTask(task.status)).length;
  const activeSessions = (engine?.sessions || []).filter((session) => ["open", "active"].includes(session.status)).length;
  const productionServer = infrastructure?.servers.find((item) => item.code === "PRODUCTION");
  const databaseServer = infrastructure?.servers.find((item) => item.code === "DATABASE");
  const infrastructureStorages = infrastructure?.storages || [];
  const latencySource = persistentLatencyTrend.length >= 2 ? persistentLatencyTrend : latencyHistory;
  const latencyTrend = {
    labels: latencySource.map((item) => item.label),
    production: latencySource.map((item) => item.production),
    database: latencySource.map((item) => item.database),
    persistent: persistentLatencyTrend.length >= 2,
  };
  const aiSummary = entitlements?.summary || {};
  const aiMonthlyCost = Number(aiSummary.aiCostHufThisMonth || 0);
  const aiMonthlyBudget = Number(aiSummary.aiMonthlyBudgetHuf || 0);
  const aiBudgetPercent = aiMonthlyBudget > 0 ? Math.min(100, Math.max(0, Number(aiSummary.aiBudgetPercent || 0))) : null;
  const aiTotalTokens = Number(aiSummary.aiTotalTokensThisMonth || 0);
  const aiTokenBudget = Number(aiSummary.aiMonthlyTokenBudget || 0);
  const aiTokenPercent = aiTokenBudget > 0 ? Math.min(100, Math.max(0, Number(aiSummary.aiTokenBudgetPercent || 0))) : null;
  const aiBudgetSourceLabel = aiSummary.aiBudgetSource === "central_identity_module_limits"
    ? "Identity Core keret"
    : aiSummary.aiBudgetSource === "mixed"
      ? "központi + kompatibilitási keret"
      : aiSummary.aiBudgetSource === "legacy_license_bridge"
        ? "kompatibilitási licencbridge"
        : "belső keret szükséges";
  const aiTokenBudgetSourceLabel = aiSummary.aiTokenBudgetSource === "central_identity_module_limits"
    ? "Identity Core tokenkeret"
    : aiSummary.aiTokenBudgetSource === "benjadmin_env"
      ? "BENJADMIN belső tokenkeret"
      : "opcionális belső limit";
  const aiRuntimePolicyLabel = aiSummary.aiRuntimePolicyMode === "strict"
    ? "központi AI-policy"
    : aiSummary.aiRuntimePolicyMode === "prefer"
      ? "központi policy + legacy biztonsági korlát"
      : "legacy AI-policy";

  return (
    <main className={`benjadmin-team-screen admin-theme-${theme}`} data-theme={theme} data-testid="benjadmin-team-screen">
      <div className="benjadmin-protective__grid" aria-hidden="true" />
      <div className="benjadmin-protective__glow benjadmin-protective__glow--a" aria-hidden="true" />
      <div className="benjadmin-protective__glow benjadmin-protective__glow--b" aria-hidden="true" />

      <header className="benjadmin-team-screen__brand">
        <div className="benjadmin-protective__wordmark" aria-label="DIMPRO BENJADMIN">
          <button type="button" className="benjadmin-protective__d" data-testid="benjadmin-team-screen-d" onDoubleClick={onClose} aria-label="BENJADMIN csapatképernyő bezárása dupla kattintással">D</button><span>IMPRO BENJADMIN</span>
        </div>
        <p>BENJADMIN CSAPAT · működési és infrastruktúra nézet</p>
      </header>

      <section className="benjadmin-team-screen__layout">
        <aside className="benjadmin-team-screen__side benjadmin-team-screen__side--left" aria-label="Szerverek és tárhelyek">
          <div className="benjadmin-team-screen__section-title"><Server size={17} /><div><span>INFRASTRUKTÚRA</span><strong>Szerverek és tárhelyek</strong></div></div>

          <article className="benjadmin-team-screen__infra-card is-primary">
            <header><div><Server size={16} /><strong>BENJADMIN DEV VPS</strong></div><span className={serverStatus?.ok ? "is-ok" : "is-pending"}>{serverStatus?.ok ? "ÉLŐ" : "NINCS ADAT"}</span></header>
            <p>{serverStatus?.server?.hostname || "Telemetria betöltése..."}</p>
            <UsageBar label="Memóriaterhelés" value={Number(serverStatus?.memory?.usagePercent || 0)} detail={`${formatBytes(memoryUsed)} / ${formatBytes(memoryTotal)} · szabad: ${formatBytes(memoryAvailable)}`} />
            <UsageBar label="Swap használat" value={swapTotal > 0 ? Number(serverStatus?.memory?.swapUsagePercent || 0) : null} detail={swapTotal > 0 ? `${formatBytes(swapUsed)} / ${formatBytes(swapTotal)} · szabad: ${formatBytes(swapFree)}` : "Swap nincs konfigurálva ezen a szerveren."} />
            <UsageBar label="Lemezfoglaltság" value={Number(serverStatus?.disk?.usePercent || 0)} detail={`${formatBytes(diskUsed)} / ${formatBytes(diskTotal)} · szabad: ${formatBytes(diskFree)}`} />
            <div className="benjadmin-team-screen__infra-facts">
              <span><Cpu size={13} /> 1 perces terhelés: <b>{Number(serverStatus?.server?.loadAverage?.[0] || 0).toFixed(2)}</b></span>
              <span><Activity size={13} /> PM2: <b>{pm2Online}/{pm2Processes.length} online</b></span>
              <span><ShieldCheck size={13} /> Nginx: <b>{serverStatus?.services?.nginx?.ok ? "rendben" : "ellenőrizendő"}</b></span>
              <span><Server size={13} /> Üzemidő: <b>{formatUptime(serverStatus?.server?.uptimeSeconds)}</b></span>
            </div>
          </article>

          <article className="benjadmin-team-screen__infra-card" data-testid="infra-production">
            <header><div><Server size={16} /><strong>PRODUCTION / ÉLES VPS</strong></div><span className={productionServer?.online ? "is-ok" : "is-pending"}>{productionServer?.online ? "ÉLŐ" : "NINCS KAPCSOLAT"}</span></header>
            <p>{productionServer?.host || "213.160.68.24"}</p>
            <UsageBar label="Memóriaterhelés" value={productionServer?.memory?.usagePercent} detail={productionServer?.memory?.totalBytes ? `${formatBytes(productionServer.memory.usedBytes)} / ${formatBytes(productionServer.memory.totalBytes)} · szabad: ${formatBytes(productionServer.memory.availableBytes)}` : "Read-only erőforrásminta még nem érhető el."} />
            <UsageBar label="Swap használat" value={productionServer?.swap?.totalBytes ? productionServer.swap.usagePercent : null} detail={productionServer?.swap?.totalBytes ? `${formatBytes(productionServer.swap.usedBytes)} / ${formatBytes(productionServer.swap.totalBytes)} · szabad: ${formatBytes(productionServer.swap.availableBytes)}` : "Read-only swap minta még nem érhető el."} />
            <UsageBar label="Lemezfoglaltság" value={productionServer?.disk?.usePercent} detail={productionServer?.disk?.totalBytes ? `${formatBytes(productionServer.disk.usedBytes)} / ${formatBytes(productionServer.disk.totalBytes)} · szabad: ${formatBytes(productionServer.disk.availableBytes)}` : "Read-only erőforrásminta még nem érhető el."} />
            <div className="benjadmin-team-screen__infra-facts">
              <span><Cpu size={13} /> 1 perces terhelés: <b>{productionServer?.load1m != null ? productionServer.load1m.toFixed(2) : "—"}</b></span>
              <span><Activity size={13} /> HTTPS: <b>{productionServer?.statusCode || "—"}</b></span>
              <span><ShieldCheck size={13} /> Elérhetőség: <b>{productionServer?.online ? "rendben" : "hiba"}</b></span>
              <span><Server size={13} /> Válaszidő: <b>{productionServer?.latencyMs != null ? `${productionServer.latencyMs} ms` : "—"}</b></span>
            </div>
          </article>

          <article className="benjadmin-team-screen__infra-card" data-testid="infra-database">
            <header><div><Database size={16} /><strong>DB VPS</strong></div><span className={databaseServer?.online ? "is-ok" : "is-pending"}>{databaseServer?.online ? "ÉLŐ" : "NINCS KAPCSOLAT"}</span></header>
            <p>{databaseServer?.host || "213.160.68.33"}</p>
            <UsageBar label="Memóriaterhelés" value={databaseServer?.memory?.usagePercent} detail={databaseServer?.memory?.totalBytes ? `${formatBytes(databaseServer.memory.usedBytes)} / ${formatBytes(databaseServer.memory.totalBytes)} · szabad: ${formatBytes(databaseServer.memory.availableBytes)}` : "Read-only erőforrásminta még nem érhető el."} />
            <UsageBar label="Swap használat" value={databaseServer?.swap?.totalBytes ? databaseServer.swap.usagePercent : null} detail={databaseServer?.swap?.totalBytes ? `${formatBytes(databaseServer.swap.usedBytes)} / ${formatBytes(databaseServer.swap.totalBytes)} · szabad: ${formatBytes(databaseServer.swap.availableBytes)}` : "Read-only swap minta még nem érhető el."} />
            <UsageBar label="Lemezfoglaltság" value={databaseServer?.disk?.usePercent} detail={databaseServer?.disk?.totalBytes ? `${formatBytes(databaseServer.disk.usedBytes)} / ${formatBytes(databaseServer.disk.totalBytes)} · szabad: ${formatBytes(databaseServer.disk.availableBytes)}` : "Read-only erőforrásminta még nem érhető el."} />
            <div className="benjadmin-team-screen__infra-facts">
              <span><Cpu size={13} /> 1 perces terhelés: <b>{databaseServer?.load1m != null ? databaseServer.load1m.toFixed(2) : "—"}</b></span>
              <span><Database size={13} /> PostgreSQL: <b>{databaseServer?.online ? "elérhető" : "hiba"}</b></span>
              <span><ShieldCheck size={13} /> Port: <b>5432</b></span>
              <span><Server size={13} /> Válaszidő: <b>{databaseServer?.latencyMs != null ? `${databaseServer.latencyMs} ms` : "—"}</b></span>
            </div>
          </article>

          {infrastructureStorages.map((storage) => {
            const capacityKnown = typeof storage.capacityBytes === "number" && storage.capacityBytes > 0;
            const usageDetail = capacityKnown
              ? `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.capacityBytes)} · szabad: ${formatBytes(storage.freeBytes)}`
              : `${formatBytes(storage.usedBytes)} foglalt · a DIMPRO tárhelykeret még nincs konfigurálva`;
            return (
              <article className="benjadmin-team-screen__infra-card is-storage" key={storage.code} data-testid={`infra-storage-${storage.code.toLowerCase()}`}>
                <header><div><HardDrive size={16} /><strong>{storage.label}</strong></div><span className={storage.online ? "is-ok" : "is-pending"}>{storage.online ? "ÉLŐ" : "ELLENŐRIZENDŐ"}</span></header>
                <p title={storage.bucket || ""}>{storage.bucket || "Hetzner Object Storage"}</p>
                <UsageBar label="Tárhelyfoglaltság" value={storage.usagePercent} detail={usageDetail} />
                <div className="benjadmin-team-screen__infra-facts">
                  <span><Database size={13} /> Foglalt: <b>{storage.usedBytes != null ? formatBytes(storage.usedBytes) : "—"}</b></span>
                  <span><HardDrive size={13} /> Teljes keret: <b>{capacityKnown ? formatBytes(storage.capacityBytes) : "nincs beállítva"}</b></span>
                  <span><Activity size={13} /> Objektumok: <b>{storage.objectCount != null ? `${storage.objectCount}${storage.truncated ? "+" : ""} db` : "—"}</b></span>
                  <span><ShieldCheck size={13} /> S3 kapcsolat: <b>{storage.online ? "rendben" : "hiba"}</b></span>
                </div>
              </article>
            );
          })}
        </aside>

        <section className="benjadmin-team-screen__center" aria-label="BENJADMIN csapat">
          <div className="benjadmin-team-screen__center-head">
            <div><UsersRound size={18} /><span>BENJADMIN CSAPAT</span></div>
            <small>{loading ? "Adatok frissítése..." : refreshedAt ? `Frissítve: ${refreshedAt.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "—"}</small>
          </div>

          <div className="benjadmin-team-screen__team-grid">
            {TEAM.map((member) => {
              const worker = member.code ? workerByCode.get(member.code) : null;
              const workerId = worker?.id;
              const assigned = workerId ? (engine?.tasks || []).filter((task) => task.assignedWorkerId === workerId && isOpenTask(task.status)).length : null;
              const active = workerId ? (engine?.sessions || []).filter((session) => session.workerId === workerId && ["open", "active"].includes(session.status)).length : null;
              return (
                <article key={member.id} className={`benjadmin-team-screen__member is-${member.tone}`} data-testid={`team-member-${member.id}`}>
                  <div className="benjadmin-team-screen__avatar"><Image src={member.image} alt={`${member.name} hexagon embléma`} width={512} height={512} priority /></div>
                  <div className="benjadmin-team-screen__member-copy">
                    <div className="benjadmin-team-screen__member-title">
                      <div><h2>{member.name}</h2><p>{member.position}</p></div>
                      <span className={worker ? `is-${worker.status}` : "is-active"}>{worker ? statusLabel(worker.status) : member.id === "benjadmin" ? "Főirányító" : "Koordinátor"}</span>
                    </div>
                    <ul>{member.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
                    {worker ? <footer><span>Nyitott feladat: <b>{assigned}</b></span><span>Aktív munkamenet: <b>{active}</b></span></footer> : null}
                  </div>
                </article>
              );
            })}
          </div>

          <section className="benjadmin-team-screen__ai-finance" data-testid="benjadmin-ai-finance">
            <header>
              <div><Coins size={17} /><div><span>AI FINANSZÍROZÁS ÉS TOKENKERET</span><strong>Költség, felhasználás és belső keretek</strong></div></div>
              <small>{aiSummary.aiEnabledLicenses ?? 0} aktív AI licenc · {aiSummary.aiRequestsThisMonth ?? 0} kérés / hó · {aiRuntimePolicyLabel}</small>
            </header>
            <div className="benjadmin-team-screen__ai-finance-grid">
              <article><span>AI költség / hó</span><strong>{formatHuf(aiMonthlyCost)}</strong><small>központi, naplózott felhasználás</small></article>
              <article><span>Finanszírozási keret / hó</span><strong>{aiMonthlyBudget > 0 ? formatHuf(aiMonthlyBudget) : "Nincs beállítva"}</strong><small>{aiBudgetPercent == null ? aiBudgetSourceLabel : `${aiBudgetSourceLabel} · ${aiBudgetPercent.toFixed(1)}% felhasználva`}</small></article>
              <article><span>Tokenforgalom / hó</span><strong>{formatCompactNumber(aiTotalTokens)}</strong><small>{formatCompactNumber(aiSummary.aiInputTokensThisMonth)} be · {formatCompactNumber(aiSummary.aiOutputTokensThisMonth)} ki</small></article>
              <article><span>Tokenkeret / hó</span><strong>{aiTokenBudget > 0 ? formatCompactNumber(aiTokenBudget) : "Nincs beállítva"}</strong><small>{aiTokenPercent == null ? aiTokenBudgetSourceLabel : `${aiTokenBudgetSourceLabel} · ${aiTokenPercent.toFixed(1)}% felhasználva`}</small></article>
            </div>
            <div className="benjadmin-team-screen__ai-budget-lines">
              <div>
                <div><span><Gauge size={13} /> Finanszírozási kihasználtság</span><b>{aiBudgetPercent == null ? "—" : `${aiBudgetPercent.toFixed(1)}%`}</b></div>
                <div className="benjadmin-team-screen__ai-track"><span style={{ width: `${aiBudgetPercent || 0}%` }} /></div>
              </div>
              <div>
                <div><span><Gauge size={13} /> Tokenkeret kihasználtság</span><b>{aiTokenPercent == null ? "—" : `${aiTokenPercent.toFixed(1)}%`}</b></div>
                <div className={`benjadmin-team-screen__ai-track${aiTokenPercent == null ? " is-unset" : ""}`}><span style={{ width: `${aiTokenPercent || 0}%` }} /></div>
              </div>
            </div>
            <footer>
              <span>Nyitott feladat: <b>{openTasks}</b></span>
              <span>Aktív munkamenet: <b>{activeSessions}</b></span>
              <span>Partner futási tér: <b>{partner?.runtimeIsolation?.ready ? "READY" : partner?.runtimeIsolation?.stage || "Nincs adat"}</b></span>
              <span>Függő jóváhagyás: <b>{control?.summary?.pendingApprovals ?? 0}</b></span>
            </footer>
          </section>
        </section>

        <aside className="benjadmin-team-screen__side benjadmin-team-screen__side--right" aria-label="Működési diagramok">
          <div className="benjadmin-team-screen__section-title"><Activity size={17} /><div><span>MŰKÖDÉSI DIAGRAMOK</span><strong>Trendek és rendszerállapot</strong></div></div>

          <MiniLineChart
            title="Rendszerterhelési trend"
            subtitle="valós monitorozási minták (monitoring) · 60 mp"
            labels={monitorTrend.labels}
            series={[
              { label: "CPU", values: monitorTrend.cpu, tone: "cyan" },
              { label: "Memória", values: monitorTrend.memory, tone: "lime" },
              { label: "Lemez", values: monitorTrend.disk, tone: "amber" },
            ]}
            emptyText="A B3.1 valós idejű monitorozás (monitoring) még nem gyűjt elegendő mintát. Itt CPU / memória / lemez trend jelenik meg, amint az adatgyűjtés aktív."
          />


          <MiniLineChart
            title="Elérési válaszidő"
            subtitle={latencyTrend.persistent ? "tartós B3.1 minták · 60 mp" : "aktuális munkamenet · 30 mp mintavétel"}
            labels={latencyTrend.labels}
            series={[
              { label: "ÉLES VPS", values: latencyTrend.production, tone: "cyan" },
              { label: "DB VPS", values: latencyTrend.database, tone: "lime" },
            ]}
            emptyText="A válaszidő-trendhez legalább egy élő infrastruktúra-minta szükséges."
          />

          <MiniLineChart
            title="Fejlesztési aktivitás"
            subtitle="utolsó 7 nap"
            labels={activity.labels}
            series={[
              { label: "Feladatmozgás (task)", values: activity.tasks, tone: "cyan" },
              { label: "Munkamenetek (session)", values: activity.sessions, tone: "lime" },
            ]}
            emptyText="Az utolsó 7 napban nincs rögzített fejlesztési aktivitás."
          />
        </aside>
      </section>

      {error ? <div className="benjadmin-team-screen__error">{error}</div> : null}
      <button type="button" className="benjadmin-team-screen__theme-toggle" data-testid="benjadmin-team-theme-toggle" onClick={onThemeToggle} aria-label={theme === "light" ? "Sötét mód" : "Világos mód"} title={theme === "light" ? "Sötét mód" : "Világos mód"}>
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <button type="button" className="benjadmin-team-screen__refresh" onClick={() => void load()} disabled={loading} aria-label="Csapatképernyő frissítése" title="Frissítés">
        <RefreshCw size={17} className={loading ? "is-spinning" : ""} />
      </button>
      <div className="benjadmin-team-screen__shortcut">D · Ctrl+Alt+0 = megnyitás / bezárás · dupla kattintás = bezárás</div>
    </main>
  );
}
