"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import BenjadminPersonProfileCard from "./BenjadminPersonProfileCard";
import { getBenjadminPerson, type BenjadminPersonCode } from "./benjadminPeople";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  Coins,
  Moon,
  Play,
  Square,
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
    aiRuntimeStrictReady?: boolean;
    aiRuntimeStrictReadyLicenses?: number;
    aiRuntimeStrictBlockedLicenses?: number;
    aiRuntimeStrictBlockers?: string[];
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
  provider?: string | null;
  includedStorageBytes?: number | null;
  bucketHardLimitBytes?: number | null;
  includedScope?: string | null;
  billingModel?: string | null;
  note: string;
};

type InfrastructureSummary = {
  ok: boolean;
  collectedAt?: string;
  servers: InfrastructureServer[];
  storages: InfrastructureStorage[];
  storageBilling?: {
    provider?: string | null;
    scope?: string | null;
    includedStorageBytes?: number | null;
    bucketHardLimitBytes?: number | null;
    observedUsedBytes?: number | null;
    observedIncludedRemainingBytes?: number | null;
    note?: string | null;
    sourceCheckedAt?: string | null;
  } | null;
};

type TeamDashboardMetrics = {
  ok: boolean;
  generatedAt: string;
  period: { day: string; month: string; weekStart: string };
  time: {
    people: Array<{
      code: string;
      name: string;
      todayMinutes: number;
      weekMinutes: number;
      monthMinutes: number;
      source: string;
      measurement: string;
    }>;
    benjadminTimer: { running: boolean; timerId: string | null; startedAt: string | null };
    notes: string[];
  };
  costs: {
    infrastructure: {
      monthlyHuf: number;
      configuredCount: number;
      totalCount: number;
      complete: boolean;
      items: Array<{ label: string; env: string; monthlyHuf: number | null }>;
      source: string;
    };
    projection: { infrastructureDailyHuf: number; infrastructureAnnualHuf: number };
  };
};

type ExecutivePanelKey = "team" | "costs" | "time";
type TeamDisplayTheme = "light" | "dark" | "sunlight";
const TEAM_DISPLAY_THEME_KEY = "benjadmin-team-display-theme";

type TeamMember = {
  id: string;
  profileCode: BenjadminPersonCode;
  code?: string;
  name: string;
  position: string;
  responsibilities: string[];
  image: string;
  tone: "owner" | "lead" | "internal" | "partner" | "external";
};

type LineSeries = {
  label: string;
  values: number[];
  tone: "cyan" | "lime" | "amber";
};

const TEAM: TeamMember[] = [
  { id: "benjadmin", profileCode: "BENJADMIN", name: "BenjAdmin", position: "Rendszergazda · fejlesztési vezető · rendszertulajdonos", responsibilities: getBenjadminPerson("BENJADMIN").responsibilities, image: getBenjadminPerson("BENJADMIN").image, tone: "owner" },
  { id: "benai", profileCode: "BENAI", name: "Ben-AI", position: "Fejlesztésirányító AI · koordinátor", responsibilities: getBenjadminPerson("BENAI").responsibilities, image: getBenjadminPerson("BENAI").image, tone: "lead" },
  { id: "armin", profileCode: "ARMINAI", code: "ARMINAI", name: "Ármin-AI", position: "Belső kódmérnök · frontend / alkalmazás", responsibilities: getBenjadminPerson("ARMINAI").responsibilities, image: getBenjadminPerson("ARMINAI").image, tone: "internal" },
  { id: "jazmin", profileCode: "JAZMINAI", code: "JAZMINAI", name: "Jázmin-AI", position: "Belső kódmérnök · backend / adatbázis", responsibilities: getBenjadminPerson("JAZMINAI").responsibilities, image: getBenjadminPerson("JAZMINAI").image, tone: "internal" },
  { id: "outmin", profileCode: "OUTMINAI", code: "OUTMINAI", name: "Outmin-AI", position: "Külső kódmérnök · partner fejlesztési sík", responsibilities: getBenjadminPerson("OUTMINAI").responsibilities, image: getBenjadminPerson("OUTMINAI").image, tone: "partner" },
  { id: "mforge", profileCode: "MFORGE", code: "MFORGE", name: "M.Forge-AI", position: "Coding Worker · külső AI fejlesztő", responsibilities: getBenjadminPerson("MFORGE").responsibilities, image: getBenjadminPerson("MFORGE").image, tone: "external" },
  { id: "vguard", profileCode: "VGUARD", code: "VGUARD", name: "V.Guard-AI", position: "Review & Quality Worker · külső AI ellenőr", responsibilities: getBenjadminPerson("VGUARD").responsibilities, image: getBenjadminPerson("VGUARD").image, tone: "external" },
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

function formatMinutes(value: number | null | undefined) {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} p`;
  return `${hours} ó ${rest.toString().padStart(2, "0")} p`;
}

function ExecutivePanelHeader({ title, subtitle, open, onToggle, actions }: { title: string; subtitle: string; open: boolean; onToggle: () => void; actions?: React.ReactNode }) {
  return (
    <header className="benjadmin-team-screen__executive-head">
      <button type="button" onClick={onToggle} className="benjadmin-team-screen__executive-toggle" aria-expanded={open}>
        {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        <span><strong>{title}</strong><small>{subtitle}</small></span>
      </button>
      {actions ? <div className="benjadmin-team-screen__executive-actions">{actions}</div> : null}
    </header>
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

export default function BenjadminTeamScreen({ theme, onClose }: { theme: "light" | "dark"; onClose: () => void }) {
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
  const [selectedProfile, setSelectedProfile] = useState<BenjadminPersonCode | null>(null);
  const [financePopoverOpen, setFinancePopoverOpen] = useState(false);
  const [displayTheme, setDisplayTheme] = useState<TeamDisplayTheme>(theme);
  const [metrics, setMetrics] = useState<TeamDashboardMetrics | null>(null);
  const [timeBusy, setTimeBusy] = useState(false);
  const [panels, setPanels] = useState<Record<ExecutivePanelKey, boolean>>({ team: true, costs: true, time: true });

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
      const [engineResponse, serverResponse, controlResponse, partnerResponse, infrastructureResponse, entitlementResponse, metricsResponse] = await Promise.all([
        fetch("/api/dev/engine/state", { headers, cache: "no-store" }),
        fetch("/api/license/server-status", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/control-plane", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/partner-projects", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/infrastructure-summary", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/entitlements", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/team-dashboard-summary", { headers, cache: "no-store" }),
      ]);
      const [enginePayload, serverPayload, controlPayload, partnerPayload, infrastructurePayload, entitlementPayload, metricsPayload] = await Promise.all([
        engineResponse.json(), serverResponse.json(), controlResponse.json(), partnerResponse.json(), infrastructureResponse.json(), entitlementResponse.json(), metricsResponse.json(),
      ]);
      if (!engineResponse.ok || !enginePayload?.state) throw new Error(enginePayload?.error || "A fejlesztési állapot nem tölthető be.");
      setEngine(enginePayload.state as EngineState);
      if (serverResponse.ok) setServerStatus(serverPayload as ServerStatus);
      if (controlResponse.ok) setControl((controlPayload?.controlPlane || controlPayload) as ControlSnapshot);
      if (partnerResponse.ok) setPartner(partnerPayload as PartnerSnapshot);
      if (entitlementResponse.ok && entitlementPayload?.entitlements) setEntitlements(entitlementPayload.entitlements as EntitlementSnapshot);
      if (metricsResponse.ok && metricsPayload?.ok) setMetrics(metricsPayload as TeamDashboardMetrics);
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

  useEffect(() => {
    const stored = window.localStorage.getItem(TEAM_DISPLAY_THEME_KEY);
    const next: TeamDisplayTheme = stored === "light" || stored === "dark" || stored === "sunlight" ? stored : theme;
    setDisplayTheme(next);
  }, [theme]);

  const changeDisplayTheme = useCallback((next: TeamDisplayTheme) => {
    setDisplayTheme(next);
    try { window.localStorage.setItem(TEAM_DISPLAY_THEME_KEY, next); } catch {}
  }, []);

  useEffect(() => {
    if (!financePopoverOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setFinancePopoverOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [financePopoverOpen]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("benjadminTeamExecutivePanels");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Record<ExecutivePanelKey, boolean>>;
        setPanels((current) => ({ ...current, ...parsed }));
      }
    } catch {}
  }, []);

  const togglePanel = useCallback((key: ExecutivePanelKey) => {
    setPanels((current) => {
      const next = { ...current, [key]: !current[key] };
      try { window.localStorage.setItem("benjadminTeamExecutivePanels", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  async function toggleBenjadminTime() {
    const key = window.localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key || timeBusy) return;
    setTimeBusy(true);
    try {
      const response = await fetch("/api/dev/engine/benjadmin-time", {
        method: "POST",
        headers: { "x-dimpro-license-admin-key": key, "content-type": "application/json" },
        body: JSON.stringify({ action: metrics?.time.benjadminTimer.running ? "stop" : "start", note: "BENJADMIN csapatnézet saját fejlesztési ráfordítás" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az időmérés nem módosítható.");
      await load(true);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "Az időmérés művelete sikertelen.");
    } finally {
      setTimeBusy(false);
    }
  }

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
  const aiStrictReady = aiSummary.aiRuntimeStrictReady === true;
  const aiStrictReadinessLabel = aiStrictReady ? "ELLENŐRZÉSRE KÉSZ" : "NEM KÉSZ";
  const aiStrictReadinessTitle = (aiSummary.aiRuntimeStrictBlockers || []).join(" · ") || "Nincs azonosított blokkoló tényező.";
  const elapsedMonthDays = Math.max(1, new Date().getDate());
  const projectedAiMonthlyHuf = aiMonthlyCost > 0 ? (aiMonthlyCost / elapsedMonthDays) * 30.4375 : 0;
  const infrastructureMonthlyHuf = Number(metrics?.costs.infrastructure.monthlyHuf || 0);
  const projectedMonthlyHuf = infrastructureMonthlyHuf + projectedAiMonthlyHuf;
  const projectedDailyHuf = projectedMonthlyHuf / 30.4375;
  const projectedAnnualHuf = projectedMonthlyHuf * 12;
  const infrastructureCostComplete = metrics?.costs.infrastructure.complete === true;
  const knownMonthHuf = infrastructureMonthlyHuf + aiMonthlyCost;
  const timePeople = metrics?.time.people || [];
  const totalTodayMinutes = timePeople.reduce((sum, item) => sum + item.todayMinutes, 0);
  const totalWeekMinutes = timePeople.reduce((sum, item) => sum + item.weekMinutes, 0);
  const totalMonthMinutes = timePeople.reduce((sum, item) => sum + item.monthMinutes, 0);
  const renderTeamMember = (member: TeamMember, nodeClass: string) => {
    const worker = member.code ? workerByCode.get(member.code) : null;
    const workerId = worker?.id;
    const assigned = workerId ? (engine?.tasks || []).filter((task) => task.assignedWorkerId === workerId && isOpenTask(task.status)).length : null;
    const active = workerId ? (engine?.sessions || []).filter((session) => session.workerId === workerId && ["open", "active"].includes(session.status)).length : null;
    const fallbackStatus = member.profileCode === "BENJADMIN" ? "Főirányító" : member.profileCode === "BENAI" ? "Koordinátor" : "Készenlét";
    return (
      <article key={member.id} className={"benjadmin-team-screen__member benjadmin-team-screen__tree-node " + nodeClass + " is-" + member.tone} data-testid={"team-member-" + member.id}>
        <button type="button" className="benjadmin-team-screen__avatar-button" onClick={() => setSelectedProfile(member.profileCode)} aria-label={member.name + " részletes munkaköri profil"}>
          <span className="benjadmin-team-screen__avatar"><Image src={member.image} alt={member.name + " hexagon avatár"} width={512} height={512} priority /></span>
        </button>
        <div className="benjadmin-team-screen__member-copy">
          <div className="benjadmin-team-screen__member-title">
            <div><h2>{member.name}</h2><p>{member.position}</p></div>
            <span className={worker ? "is-" + worker.status : "is-active"}>{worker ? statusLabel(worker.status) : fallbackStatus}</span>
          </div>
          <ul>{member.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
          {worker ? <footer><span>Nyitott feladat: <b>{assigned}</b></span><span>Aktív munkamenet: <b>{active}</b></span></footer> : null}
        </div>
      </article>
    );
  };

  return (
    <main className={`benjadmin-team-screen admin-theme-${displayTheme}`} data-theme={displayTheme} data-testid="benjadmin-team-screen">
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
            const hetznerIncluded = storage.provider === "HETZNER_OBJECT_STORAGE" && typeof storage.includedStorageBytes === "number";
            const usageDetail = capacityKnown
              ? `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.capacityBytes)} · szabad: ${formatBytes(storage.freeBytes)}`
              : hetznerIncluded
                ? `${formatBytes(storage.usedBytes)} foglalt · ${formatBytes(storage.includedStorageBytes)} közös account-báziskeret`
                : `${formatBytes(storage.usedBytes)} foglalt · DIMPRO hard keret nincs beállítva`;
            return (
              <article className="benjadmin-team-screen__infra-card is-storage" key={storage.code} data-testid={`infra-storage-${storage.code.toLowerCase()}`}>
                <header><div><HardDrive size={16} /><strong>{storage.label}</strong></div><span className={storage.online ? "is-ok" : "is-pending"}>{storage.online ? "ÉLŐ" : "ELLENŐRIZENDŐ"}</span></header>
                <p title={storage.bucket || ""}>{storage.bucket || "Hetzner Object Storage"}</p>
                <UsageBar label="Tárhelyfoglaltság" value={storage.usagePercent} detail={usageDetail} />
                <div className="benjadmin-team-screen__infra-facts">
                  <span><Database size={13} /> Foglalt: <b>{storage.usedBytes != null ? formatBytes(storage.usedBytes) : "—"}</b></span>
                  <span><HardDrive size={13} /> DIMPRO hard keret: <b>{capacityKnown ? formatBytes(storage.capacityBytes) : "nincs beállítva"}</b></span>
                  {hetznerIncluded ? <span><Database size={13} /> Hetzner báziskeret: <b>{formatBytes(storage.includedStorageBytes)} közös</b></span> : null}
                  {storage.bucketHardLimitBytes ? <span><HardDrive size={13} /> Bucket technikai limit: <b>{formatBytes(storage.bucketHardLimitBytes)}</b></span> : null}
                  <span><Activity size={13} /> Objektumok: <b>{storage.objectCount != null ? `${storage.objectCount}${storage.truncated ? "+" : ""} db` : "—"}</b></span>
                  <span><ShieldCheck size={13} /> S3 kapcsolat: <b>{storage.online ? "rendben" : "hiba"}</b></span>
                </div>
              </article>
            );
          })}
          <div className="benjadmin-team-screen__ai-finance is-sidebar" data-testid="benjadmin-ai-finance"><header><div><Coins size={17} /><div><span>AI FINANSZÍROZÁS ÉS TOKENKERET</span><strong>Költség, felhasználás és belső keretek</strong></div></div></header><div className="benjadmin-team-screen__infra-facts"><span>Havi költség: <b>{formatHuf(aiMonthlyCost)}</b></span><span>Havi keret: <b>{aiMonthlyBudget > 0 ? formatHuf(aiMonthlyBudget) : "Nincs beállítva"}</b></span><span>Tokenforgalom: <b>{formatCompactNumber(aiTotalTokens)}</b></span><span>Tokenkeret: <b>{aiTokenBudget > 0 ? formatCompactNumber(aiTokenBudget) : "Nincs beállítva"}</b></span></div></div>
        </aside>

        <section className="benjadmin-team-screen__center" aria-label="BENJADMIN vezetői nézet">
          <div className="benjadmin-team-screen__center-head">
            <div><UsersRound size={18} /><span>BENJADMIN VEZETŐI NÉZET</span></div>
            <small>{loading ? "Adatok frissítése..." : refreshedAt ? `Frissítve: ${refreshedAt.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "—"}</small>
          </div>

          <section className="benjadmin-team-screen__executive-panel is-team" data-panel="team">
            <ExecutivePanelHeader
              title="BENJADMIN CSAPATTABLÓ"
              subtitle={panels.team ? "Családfa / szervezeti fa · avatárra kattintva részletes profil" : `7 tag · ${activeSessions} aktív munkamenet · ${openTasks} nyitott feladat`}
              open={panels.team}
              onToggle={() => togglePanel("team")}
            />
            {panels.team ? (
              <div className="benjadmin-team-screen__team-tree">
                <div className="benjadmin-team-screen__tree-level is-owner-level">{renderTeamMember(TEAM[0], "is-owner-node")}</div>
                <div className="benjadmin-team-screen__tree-connector is-short" aria-hidden="true" />
                <div className="benjadmin-team-screen__tree-level is-lead-level">{renderTeamMember(TEAM[1], "is-lead-node")}</div>
                <div className="benjadmin-team-screen__tree-branch is-engineer-branch" aria-hidden="true" />
                <div className="benjadmin-team-screen__tree-level is-engineer-level">{TEAM.slice(2, 5).map((member) => renderTeamMember(member, "is-worker-node"))}</div>
                <div className="benjadmin-team-screen__tree-branch is-external-branch" aria-hidden="true" />
                <div className="benjadmin-team-screen__tree-external-head">
                  <span>KÜLSŐ AI WORKEREK</span>
                  <button type="button" className="benjadmin-team-screen__finance-hex" onClick={() => setFinancePopoverOpen((current) => !current)} aria-label="AI finanszírozás és tokenkeret"><Coins size={16} /></button>
                  {financePopoverOpen ? <div className="benjadmin-team-screen__finance-popover"><strong>AI finanszírozás</strong><span>Havi költség: <b>{formatHuf(aiMonthlyCost)}</b></span><span>Havi keret: <b>{aiMonthlyBudget > 0 ? formatHuf(aiMonthlyBudget) : "Nincs beállítva"}</b></span><span>Tokenforgalom: <b>{formatCompactNumber(aiTotalTokens)}</b></span><span>Tokenkeret: <b>{aiTokenBudget > 0 ? formatCompactNumber(aiTokenBudget) : "Nincs beállítva"}</b></span></div> : null}
                </div>
                <div className="benjadmin-team-screen__tree-level is-external-level">{TEAM.slice(5, 7).map((member) => renderTeamMember(member, "is-worker-node is-external-worker-node"))}</div>
              </div>
            ) : null}
          </section>

          <section className="benjadmin-team-screen__executive-panel is-costs" data-panel="costs">
            <ExecutivePanelHeader
              title="KÖLTSÉGEK ÉS FINANSZÍROZÁS"
              subtitle={panels.costs ? "TÉNY és BECSLÉS külön jelölve · AI + infrastruktúra" : `Havi ismert: ${formatHuf(knownMonthHuf)} · éves ${infrastructureCostComplete ? `becslés: ${formatHuf(projectedAnnualHuf)}` : projectedAnnualHuf > 0 ? `részbecslés: ≥ ${formatHuf(projectedAnnualHuf)}` : "becslés: nincs teljes költségadat"}`}
              open={panels.costs}
              onToggle={() => togglePanel("costs")}
            />
            {panels.costs ? <div className="benjadmin-team-screen__executive-body">
              <div className="benjadmin-team-screen__metric-grid is-cost-grid">
                <article><small>TÉNY · AI KÖLTSÉG / HÓ</small><strong>{formatHuf(aiMonthlyCost)}</strong><span>naplózott aktuális havi felhasználás</span></article>
                <article><small>TÉNY / KONFIG · HAVI ISMERT</small><strong>{formatHuf(knownMonthHuf)}</strong><span>AI aktuális + beállított fix infrastruktúra</span></article>
                <article><small>BECSLÉS · NAPI ÁTLAG</small><strong>{infrastructureCostComplete ? formatHuf(projectedDailyHuf) : projectedDailyHuf > 0 ? `≥ ${formatHuf(projectedDailyHuf)}` : "Nincs teljes adat"}</strong><span>{infrastructureCostComplete ? "aktuális AI ütem + fix infrastruktúra" : "részbecslés · hiányzó fix díjak nélkül"}</span></article>
                <article><small>BECSLÉS · ÉVES</small><strong>{infrastructureCostComplete ? formatHuf(projectedAnnualHuf) : projectedAnnualHuf > 0 ? `≥ ${formatHuf(projectedAnnualHuf)}` : "Nincs teljes adat"}</strong><span>{infrastructureCostComplete ? "12 havi évesített becslés" : "részbecslés · a teljes éves költség csak a fix díjak rögzítése után számolható"}</span></article>
              </div>

              <div className="benjadmin-team-screen__cost-columns">
                <div className="benjadmin-team-screen__cost-card">
                  <header><Coins size={15} /><strong>AI finanszírozás</strong><span className={aiStrictReady ? "is-ok" : "is-pending"}>{aiStrictReadinessLabel}</span></header>
                  <div className="benjadmin-team-screen__cost-line"><span>Havi AI költség</span><b>{formatHuf(aiMonthlyCost)}</b></div>
                  <div className="benjadmin-team-screen__cost-line"><span>Finanszírozási keret</span><b>{aiMonthlyBudget > 0 ? formatHuf(aiMonthlyBudget) : "Nincs beállítva"}</b></div>
                  <UsageBar label="Finanszírozási kihasználtság" value={aiBudgetPercent} detail={aiBudgetPercent == null ? aiBudgetSourceLabel : `${aiBudgetSourceLabel} · ${aiBudgetPercent.toFixed(1)}%`} />
                  <div className="benjadmin-team-screen__cost-line"><span>Tokenforgalom / hó</span><b>{formatCompactNumber(aiTotalTokens)}</b></div>
                  <div className="benjadmin-team-screen__cost-line"><span>Tokenkeret / hó</span><b>{aiTokenBudget > 0 ? formatCompactNumber(aiTokenBudget) : "Nincs beállítva"}</b></div>
                  <UsageBar label="Tokenkeret kihasználtság" value={aiTokenPercent} detail={aiTokenPercent == null ? aiTokenBudgetSourceLabel : `${aiTokenBudgetSourceLabel} · ${aiTokenPercent.toFixed(1)}%`} />
                  <small title={aiStrictReadinessTitle}>{aiRuntimePolicyLabel}</small>
                </div>
                <div className="benjadmin-team-screen__cost-card">
                  <header><Server size={15} /><strong>Szerver / infrastruktúra költség</strong><span className={metrics?.costs.infrastructure.complete ? "is-ok" : "is-pending"}>{metrics?.costs.infrastructure.complete ? "TELJES" : "RÉSZLEGES"}</span></header>
                  {(metrics?.costs.infrastructure.items || []).map((item) => <div className="benjadmin-team-screen__cost-line" key={item.env}><span>{item.label}</span><b>{item.monthlyHuf == null ? "Nincs beállítva" : formatHuf(item.monthlyHuf)}</b></div>)}
                  <div className="benjadmin-team-screen__cost-line is-total"><span>Beállított infrastruktúra / hó</span><b>{formatHuf(infrastructureMonthlyHuf)}</b></div>
                  <small>{metrics ? `${metrics.costs.infrastructure.configuredCount}/${metrics.costs.infrastructure.totalCount} költségelem konfigurálva.` : "Költségadatok betöltése..."}</small>
                </div>
              </div>
              <div className="benjadmin-team-screen__operations-strip">
                <span>Nyitott feladat <b>{openTasks}</b></span>
                <span>Aktív session <b>{activeSessions}</b></span>
                <span>Partner futási tér <b>{partner?.runtimeIsolation?.ready ? "READY" : partner?.runtimeIsolation?.stage || "—"}</b></span>
                <span>Függő jóváhagyás <b>{control?.summary?.pendingApprovals ?? 0}</b></span>
              </div>
            </div> : null}
          </section>

          <section className="benjadmin-team-screen__executive-panel is-time" data-panel="time">
            <ExecutivePanelHeader
              title="FEJLESZTÉSI IDŐ ÉS RÁFORDÍTÁS"
              subtitle={panels.time ? "BenjAdmin + ChatGPT/VPS-MCP + AI személyek · mérési forrás szerint" : `Ma ${formatMinutes(totalTodayMinutes)} · hét ${formatMinutes(totalWeekMinutes)} · hónap ${formatMinutes(totalMonthMinutes)}`}
              open={panels.time}
              onToggle={() => togglePanel("time")}
              actions={<button type="button" className={`benjadmin-team-screen__timer-button${metrics?.time.benjadminTimer.running ? " is-running" : ""}`} onClick={() => void toggleBenjadminTime()} disabled={timeBusy}>{metrics?.time.benjadminTimer.running ? <Square size={13} /> : <Play size={13} />}<span>{metrics?.time.benjadminTimer.running ? "Saját idő leállítása" : "Saját idő indítása"}</span></button>}
            />
            {panels.time ? <div className="benjadmin-team-screen__executive-body">
              <div className="benjadmin-team-screen__metric-grid is-time-grid">
                <article><small>MAI ÖSSZES NAPLÓZOTT</small><strong>{formatMinutes(totalTodayMinutes)}</strong><span>különböző mérési források összege</span></article>
                <article><small>EZEN A HÉTEN</small><strong>{formatMinutes(totalWeekMinutes)}</strong><span>{metrics?.period.weekStart || "—"} óta</span></article>
                <article><small>EBBEN A HÓNAPBAN</small><strong>{formatMinutes(totalMonthMinutes)}</strong><span>{metrics?.period.month || "—"}</span></article>
                <article><small>BENJADMIN SAJÁT / HÓ</small><strong>{formatMinutes(timePeople.find((item) => item.code === "BENJADMIN")?.monthMinutes)}</strong><span>{metrics?.time.benjadminTimer.running ? "időmérés jelenleg fut" : "kézi, explicit időnapló"}</span></article>
              </div>
              <div className="benjadmin-team-screen__time-table-wrap">
                <table className="benjadmin-team-screen__time-table">
                  <thead><tr><th>Résztvevő</th><th>Mai idő</th><th>Heti idő</th><th>Havi idő</th><th>Mérés</th></tr></thead>
                  <tbody>{timePeople.map((item) => {
                    const profileCode = (["BENJADMIN", "BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"] as string[]).includes(item.code) ? item.code as BenjadminPersonCode : null;
                    const measurement = item.measurement === "MANUAL" ? "kézi idő" : item.measurement === "PROVIDER_ACTIVE" ? "provider aktív" : item.measurement === "SESSION_WALL" ? "session falióra" : item.measurement === "DEV_WORKLOG" ? "dev napló / falióra" : "nincs adat";
                    return <tr key={item.code}>
                      <td>{profileCode ? <button type="button" className="benjadmin-team-screen__time-person" onClick={() => setSelectedProfile(profileCode)}>{item.name}</button> : <strong>{item.name}</strong>}</td>
                      <td>{formatMinutes(item.todayMinutes)}</td><td>{formatMinutes(item.weekMinutes)}</td><td>{formatMinutes(item.monthMinutes)}</td><td><span className="benjadmin-team-screen__measurement-badge">{measurement}</span></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="benjadmin-team-screen__measurement-note"><Clock3 size={14} /><span>Az idők eltérő mérési módszerű adatok: kézi idő, session falióra, provider aktív idő vagy fejlesztési munkamenet-napló. A ChatGPT + VPS-MCP érték munkamenet-falióra, ezért szüneteket is tartalmazhat; ez nem AI „gondolkodási idő”.</span></div>
            </div> : null}
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

      {selectedProfile && <BenjadminPersonProfileCard code={selectedProfile} onClose={setSelectedProfile.bind(null, null)} />}
      {error ? <div className="benjadmin-team-screen__error">{error}</div> : null}
      <div className="benjadmin-team-screen__theme-modes" data-testid="benjadmin-team-theme-modes" aria-label="BENJADMIN nézet témája">
        <button type="button" className={displayTheme === "light" ? "is-active" : ""} onClick={() => changeDisplayTheme("light")} aria-label="Világos mód"><Sun size={15} /><span>Világos</span></button>
        <button type="button" className={displayTheme === "dark" ? "is-active" : ""} onClick={() => changeDisplayTheme("dark")} aria-label="Sötét mód"><Moon size={15} /><span>Sötét</span></button>
        <button type="button" className={displayTheme === "sunlight" ? "is-active" : ""} onClick={() => changeDisplayTheme("sunlight")} aria-label="Sunlight mód"><Sun size={15} /><span>Sunlight</span></button>
      </div>
      <button type="button" className="benjadmin-team-screen__refresh" onClick={() => void load()} disabled={loading} aria-label="Csapatképernyő frissítése" title="Frissítés">
        <RefreshCw size={17} className={loading ? "is-spinning" : ""} />
      </button>
      <div className="benjadmin-team-screen__shortcut">D · Ctrl+Alt+0 = megnyitás / bezárás · dupla kattintás = bezárás</div>
    </main>
  );
}
