"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  HardDrive,
  KeyRound,
  Loader2,
  MemoryStick,
  RefreshCcw,
  Server,
} from "lucide-react";

type SummaryLevel = "ok" | "warning" | "error";
type StatusLevel = "ok" | "warning" | "error" | "info";
type ServerStatusTab = "overview" | "storage" | "processes" | "operations" | "warnings" | "monitor" | "raw";

type Pm2Process = {
  name: string;
  status: string;
  cpuPercent: number;
  memoryBytes: number;
  restarts: number;
  uptimeMs: number | null;
  watching: boolean;
};

type TopMemoryProcess = {
  pid: number;
  memoryPercent: number;
  cpuPercent: number;
  rssBytes: number;
  command: string;
};

type StorageItem = {
  name: string;
  path: string;
  sizeBytes: number;
  sizeKb: number;
  percentOfDisk: number | null;
};

type StorageCategory = {
  label: string;
  path: string;
  sizeBytes: number;
  note: string;
};

type FolderSizeGroup = {
  label: string;
  path: string;
  totalSizeBytes: number;
  items: StorageItem[];
  note: string;
};

type SwapProcess = {
  pid: number;
  name: string;
  swapBytes: number;
  command: string;
};

type CodeWarning = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  cause: string;
  severity: "warning" | "error";
};

type CodeWarningsSummary = {
  checked: boolean;
  ok: boolean;
  warningCount: number;
  errorCount: number;
  totalCount: number;
  collectedAt: string | null;
  message: string;
  items: CodeWarning[];
};

type DiagnosticItem = {
  label: string;
  status: StatusLevel;
  value: string;
  detail: string;
};

type BackupStatus = {
  status: StatusLevel;
  message: string;
  totalCount: number;
  hourlyCount: number;
  dailyCount: number;
  weeklyCount: number;
  zeroByteCount: number;
  suspiciousLargeCount: number;
  latestPath: string | null;
  latestSizeBytes: number;
  items: DiagnosticItem[];
};

type DomainRoute = {
  file: string;
  serverName: string;
  proxyPass: string;
  note: string;
};

type SslCertificate = {
  name: string;
  domains: string[];
  expiresAt: string | null;
  daysRemaining: number | null;
  status: StatusLevel;
};

type LogSummaryItem = {
  label: string;
  path: string;
  errorCount: number;
  warningCount: number;
  lastMessages: string[];
  status: StatusLevel;
};

type ReleaseStorage = {
  totalBytes: number;
  fileCount: number;
  expiredCount: number;
  largestFiles: StorageItem[];
  status: StatusLevel;
};

type SecurityCheck = {
  label: string;
  status: StatusLevel;
  detail: string;
};

type CleanupSuggestion = {
  label: string;
  status: StatusLevel;
  potentialBytes: number;
  reason: string;
  action: string;
};

type RecommendedAction = {
  priority: "alacsony" | "közepes" | "magas";
  status: StatusLevel;
  title: string;
  detail: string;
};

type ServerStatusResponse = {
  ok: boolean;
  error?: string;
  collectedAt: string;
  server: {
    hostname: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    loadAverage: number[];
    nodeVersion: string;
    npmVersion: string | null;
    pm2Version: string | null;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    availableBytes: number;
    buffCacheBytes: number;
    usagePercent: number;
    rawUsedPercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapFreeBytes: number;
    swapUsagePercent: number;
  };
  disk: {
    filesystem: string;
    sizeKb: number;
    usedKb: number;
    availableKb: number;
    usePercent: number;
    mountedOn: string;
  } | null;
  services: {
    nginx: {
      ok: boolean;
      message: string;
    };
    pm2: {
      ok: boolean;
      processes: Pm2Process[];
      rawError: string | null;
    };
  };
  storage: {
    rootDirectories: StorageItem[];
    projectDirectories: StorageItem[];
    dimproverDirectories: StorageItem[];
    topProjectFiles: StorageItem[];
    categories: StorageCategory[];
    folderGroups: {
      dimpro: FolderSizeGroup[];
      dimprover: FolderSizeGroup[];
    };
    commandErrors: Record<string, string | null>;
  };
  processes: {
    topMemory: TopMemoryProcess[];
    topSwap: SwapProcess[];
  };
  codeQuality: {
    warnings: CodeWarningsSummary;
  };
  operations: {
    recommendedActions: RecommendedAction[];
    backup: BackupStatus;
    domainRoutes: DomainRoute[];
    sslCertificates: SslCertificate[];
    logs: LogSummaryItem[];
    releaseStorage: ReleaseStorage;
    securityChecks: SecurityCheck[];
    cleanupSuggestions: CleanupSuggestion[];
    commandErrors: Record<string, string | null>;
  };
  git: {
    changedCount: number;
    untrackedCount: number;
    totalCount: number;
  };
  summary: {
    level: SummaryLevel;
    label: string;
    warnings: string[];
  };
};


type MonitorLevel = "ok" | "warning" | "error";

type MonitorCheckItem = {
  id: string;
  label: string;
  status: MonitorLevel;
  value: string;
  detail: string;
  checkedAt: string;
};

type ServerMonitorRun = {
  id: string;
  source: "manual" | "cron" | "api";
  status: MonitorLevel;
  label: string;
  collectedAt: string;
  durationMs: number;
  hostname: string;
  checks: MonitorCheckItem[];
  metrics: {
    diskUsePercent: number | null;
    diskAvailableBytes: number | null;
    memoryUsagePercent: number | null;
    memoryAvailableBytes: number | null;
    swapUsagePercent: number | null;
    loadAverage1m: number;
    pm2OnlineCount: number;
    pm2TotalCount: number;
    homepageStatus: number | null;
    cssStatus: number | null;
    httpStatuses?: Record<string, number | null>;
  };
  notification: {
    attempted: boolean;
    sent: boolean;
    reason: string;
    to: string[];
    error?: string;
    friendlyError?: string;
  };
};

type ServerMonitorEmailTestResult = {
  id: string;
  createdAt: string;
  attempted: boolean;
  sent: boolean;
  reason: string;
  to: string[];
  smtpConfigured: boolean;
  error?: string;
  friendlyError?: string;
};

type MonitorHttpTarget = {
  id: string;
  label: string;
  url: string;
  method: "GET" | "HEAD";
  expected: string;
  checkCss: boolean;
};

type ServerMonitorAlertRule = {
  id: string;
  label: string;
  level: MonitorLevel;
  condition: string;
  emailSubject: string;
};

type ServerMonitorResponse = {
  ok: boolean;
  error?: string;
  config?: {
    historyFile: string;
    cronLogFile: string;
    lastAlertFile: string;
    emailTestLogFile: string;
    emailEnabled: boolean;
    emailRecipients: string[];
    smtpConfigured: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpFromConfigured: boolean;
    monitoredHttpTargets?: MonitorHttpTarget[];
    alertRules?: ServerMonitorAlertRule[];
    duplicateThrottleHours?: number;
    envFileHint: string;
    requiredEnvVars: string[];
    recommendedCron: string;
  };
  latest: ServerMonitorRun | null;
  history: ServerMonitorRun[];
  emailTests: ServerMonitorEmailTestResult[];
  emailTest?: ServerMonitorEmailTestResult;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatKilobytes(value: number) {
  return formatBytes(value * 1024);
}

function formatDurationFromSeconds(value: number) {
  if (!Number.isFinite(value)) return "-";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);

  if (days > 0) return `${days} nap ${hours} óra`;
  if (hours > 0) return `${hours} óra ${minutes} perc`;
  return `${minutes} perc`;
}

function formatDurationFromMs(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return formatDurationFromSeconds(Math.floor(value / 1000));
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU");
}

function statusColor(level: SummaryLevel) {
  if (level === "ok") return "border-emerald-400/50 bg-emerald-500/15 text-emerald-200";
  if (level === "warning") return "border-amber-400/50 bg-amber-500/15 text-amber-200";
  return "border-red-400/50 bg-red-500/15 text-red-200";
}

function percentBarColor(value: number) {
  if (value >= 90) return "bg-red-400";
  if (value >= 75) return "bg-amber-300";
  return "bg-emerald-300";
}

function shortCommand(value: string) {
  if (value.length <= 92) return value;
  return `${value.slice(0, 92)}…`;
}

function StatCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
        <Icon size={27} />
      </div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{helper}</p>
    </div>
  );
}

function UsageBar({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-black text-white">{label}</span>
        <span className="text-sm font-black text-cyan-200">{value}%</span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${percentBarColor(value)}`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function StorageTable({ title, items, emptyText }: { title: string; items: StorageItem[]; emptyText: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
      <h3 className="mb-4 text-base font-black text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-slate-400">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                <th className="px-3">Név</th>
                <th className="px-3">Méret</th>
                <th className="px-3">Lemez %</th>
                <th className="px-3">Útvonal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.path}-${item.sizeBytes}`} className="bg-white/[0.04] text-sm font-semibold text-slate-300">
                  <td className="rounded-l-2xl px-3 py-3 font-black text-white">{item.name}</td>
                  <td className="px-3 py-3 text-cyan-100">{formatBytes(item.sizeBytes)}</td>
                  <td className="px-3 py-3">{item.percentOfDisk === null ? "-" : `${item.percentOfDisk}%`}</td>
                  <td className="rounded-r-2xl px-3 py-3 font-mono text-xs text-slate-400">{item.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemoryProcessTable({ items }: { items: TopMemoryProcess[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-y-3 text-left">
        <thead>
          <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            <th className="px-4">PID</th>
            <th className="px-4">Memória</th>
            <th className="px-4">RSS</th>
            <th className="px-4">CPU</th>
            <th className="px-4">Folyamat / parancs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.pid}-${item.command}`} className="rounded-2xl bg-slate-950/35 text-sm font-semibold text-slate-200">
              <td className="rounded-l-2xl px-4 py-4 font-black text-white">{item.pid}</td>
              <td className="px-4 py-4 text-cyan-100">{item.memoryPercent}%</td>
              <td className="px-4 py-4">{formatBytes(item.rssBytes)}</td>
              <td className="px-4 py-4">{item.cpuPercent}%</td>
              <td className="rounded-r-2xl px-4 py-4 font-mono text-xs text-slate-400" title={item.command}>{shortCommand(item.command)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SwapProcessTable({ items }: { items: SwapProcess[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-y-3 text-left">
        <thead>
          <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            <th className="px-4">PID</th>
            <th className="px-4">Folyamat</th>
            <th className="px-4">Swap</th>
            <th className="px-4">Parancs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.pid}-${item.name}-${item.swapBytes}`} className="rounded-2xl bg-slate-950/35 text-sm font-semibold text-slate-200">
              <td className="rounded-l-2xl px-4 py-4 font-black text-white">{item.pid}</td>
              <td className="px-4 py-4 text-cyan-100">{item.name}</td>
              <td className="px-4 py-4">{formatBytes(item.swapBytes)}</td>
              <td className="rounded-r-2xl px-4 py-4 font-mono text-xs text-slate-400" title={item.command}>{shortCommand(item.command)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolderSizeBarChart({ group }: { group: FolderSizeGroup }) {
  const visibleItems = group.items.filter((item) => item.sizeBytes > 0);
  const maxSize = visibleItems.reduce((max, item) => Math.max(max, item.sizeBytes), 0);

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-black text-white">{group.label}</h3>
          <p className="mt-1 font-mono text-[11px] font-semibold text-cyan-100/80">{group.path}</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{group.note}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/80">Összesen</p>
          <p className="mt-1 text-lg font-black text-white">{formatBytes(group.totalSizeBytes)}</p>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-400">
          Nincs almappa adat, vagy a mappa nem érhető el.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => {
            const widthPercent = maxSize > 0 ? Math.max(2, Math.round((item.sizeBytes / maxSize) * 1000) / 10) : 0;
            const groupPercent = group.totalSizeBytes > 0 ? Math.round((item.sizeBytes / group.totalSizeBytes) * 1000) / 10 : 0;
            return (
              <div key={`${group.path}-${item.path}-${item.sizeBytes}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-300">
                  <span className="min-w-0 truncate font-black text-white" title={item.path}>{item.name}</span>
                  <span className="shrink-0 text-cyan-100">{formatBytes(item.sizeBytes)} · {groupPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.25)]"
                    style={{ width: `${Math.min(Math.max(widthPercent, 0), 100)}%` }}
                  />
                </div>
                <p className="mt-2 truncate font-mono text-[10px] font-semibold text-slate-500" title={item.path}>{item.path}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FolderGroupColumn({ title, helper, groups }: { title: string; helper: string; groups: FolderSizeGroup[] }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/25 p-4">
      <div className="mb-4">
        <h3 className="text-xl font-black tracking-[-0.03em] text-white">{title}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{helper}</p>
      </div>
      <div className="grid gap-4">
        {groups.map((group) => <FolderSizeBarChart key={group.path} group={group} />)}
      </div>
    </div>
  );
}

function statusBadgeClass(status: StatusLevel) {
  if (status === "ok") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
  if (status === "error") return "border-red-300/25 bg-red-400/10 text-red-200";
  if (status === "warning") return "border-amber-300/25 bg-amber-400/10 text-amber-200";
  return "border-cyan-300/25 bg-cyan-400/10 text-cyan-200";
}

function CollapsiblePanel({ title, helper, defaultOpen = false, children }: { title: string; helper?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="rounded-[1.5rem] border border-white/10 bg-slate-950/25 p-4">
      <summary className="cursor-pointer list-none rounded-2xl px-1 py-1 text-lg font-black text-white outline-none marker:hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{title}</span>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Kinyit / összecsuk</span>
        </div>
        {helper && <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{helper}</p>}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
        active ? "border-cyan-300/40 bg-cyan-300 text-slate-950" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/30 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function DiagnosticGrid({ items }: { items: DiagnosticItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className={`rounded-2xl border p-4 ${statusBadgeClass(item.status)}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">{item.label}</p>
          <p className="mt-1 text-xl font-black text-white">{item.value}</p>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-90">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function RecommendedActionList({ items }: { items: RecommendedAction[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={`${item.title}-${item.detail}`} className={`rounded-2xl border p-4 ${statusBadgeClass(item.status)}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">Prioritás: {item.priority}</p>
          <p className="mt-1 text-base font-black text-white">{item.title}</p>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-90">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function DomainRouteTable({ items }: { items: DomainRoute[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left">
        <thead><tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400"><th className="px-3">Domain</th><th className="px-3">Proxy</th><th className="px-3">Megjegyzés</th><th className="px-3">Config</th></tr></thead>
        <tbody>{items.map((item, index) => (
          <tr key={`${item.serverName}-${item.proxyPass}-${index}`} className="bg-white/[0.04] text-sm font-semibold text-slate-300">
            <td className="rounded-l-2xl px-3 py-3 font-black text-white">{item.serverName}</td>
            <td className="px-3 py-3 font-mono text-xs text-cyan-100">{item.proxyPass}</td>
            <td className="px-3 py-3">{item.note}</td>
            <td className="rounded-r-2xl px-3 py-3 font-mono text-xs text-slate-500">{item.file}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function SslTable({ items }: { items: SslCertificate[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.name} className={`rounded-2xl border p-4 ${statusBadgeClass(item.status)}`}>
          <p className="text-sm font-black text-white">{item.name}</p>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-90">Lejárat: {item.daysRemaining === null ? "ismeretlen" : `${item.daysRemaining} nap múlva`}</p>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-80">{item.domains.join(", ") || "Nincs SAN adat"}</p>
        </div>
      ))}
    </div>
  );
}

function LogSummaryList({ items }: { items: LogSummaryItem[] }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.path} className={`rounded-2xl border p-4 ${statusBadgeClass(item.status)}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-black text-white">{item.label}</p>
              <p className="mt-1 font-mono text-[11px] font-semibold opacity-75">{item.path}</p>
            </div>
            <p className="text-sm font-black">Error: {item.errorCount} · Warning: {item.warningCount}</p>
          </div>
          {item.lastMessages.length > 0 && (
            <div className="mt-3 space-y-2">
              {item.lastMessages.map((message, index) => <p key={`${item.path}-${index}`} className="rounded-xl bg-slate-950/30 px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">{message}</p>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReleaseStoragePanel({ data }: { data: ReleaseStorage }) {
  return (
    <div className={`rounded-2xl border p-4 ${statusBadgeClass(data.status)}`}>
      <div className="grid gap-3 md:grid-cols-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">Összméret</p><p className="mt-1 text-2xl font-black text-white">{formatBytes(data.totalBytes)}</p></div>
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">Csomag</p><p className="mt-1 text-2xl font-black text-white">{data.fileCount} db</p></div>
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">Lejárt</p><p className="mt-1 text-2xl font-black text-white">{data.expiredCount} db</p></div>
      </div>
      <div className="mt-4"><StorageTable title="Legnagyobb release fájlok" items={data.largestFiles} emptyText="Nincs release fájl adat." /></div>
    </div>
  );
}

function SecurityChecklist({ items }: { items: SecurityCheck[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className={`rounded-2xl border p-4 ${statusBadgeClass(item.status)}`}>
          <p className="text-base font-black text-white">{item.label}</p>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-90">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function CleanupPlan({ items }: { items: CleanupSuggestion[] }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.label} className={`rounded-2xl border p-4 ${statusBadgeClass(item.status)}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base font-black text-white">{item.label}</p>
            <p className="text-sm font-black">Érintett méret: {formatBytes(item.potentialBytes)}</p>
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-90"><span className="font-black text-white">Ok: </span>{item.reason}</p>
          <p className="mt-1 text-xs font-semibold leading-5 opacity-90"><span className="font-black text-white">Javaslat: </span>{item.action}</p>
        </div>
      ))}
    </div>
  );
}

function CodeWarningList({ data }: { data: CodeWarningsSummary }) {
  if (!data.checked) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-5 text-sm font-semibold leading-6 text-slate-400">
        {data.message}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/80">Warning</p>
          <p className="mt-1 text-2xl font-black text-white">{data.warningCount}</p>
        </div>
        <div className="rounded-2xl border border-red-300/20 bg-red-300/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-100/80">Error</p>
          <p className="mt-1 text-2xl font-black text-white">{data.errorCount}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/80">Lekérve</p>
          <p className="mt-1 text-sm font-black text-white">{data.collectedAt ? formatDateTime(data.collectedAt) : "-"}</p>
        </div>
      </div>

      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-200">
          Nincs megjeleníthető kódminőségi jelzés.
        </p>
      ) : (
        <div className="max-h-[760px] overflow-auto pr-1">
          <div className="space-y-3">
            {data.items.map((item, index) => (
              <div key={`${item.file}-${item.line}-${item.column}-${item.rule}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-black text-cyan-100">
                      {item.file}:{item.line}:{item.column}
                    </p>
                    <p className="mt-2 text-sm font-black text-white">{item.message}</p>
                  </div>
                  <span className={item.severity === "error" ? "shrink-0 rounded-full bg-red-400/15 px-3 py-1 text-xs font-black text-red-200" : "shrink-0 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-200"}>
                    {item.severity === "error" ? "ERROR" : "WARNING"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-[220px_1fr]">
                  <p className="rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[11px] font-bold text-slate-400">{item.rule}</p>
                  <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-semibold leading-5 text-slate-300">
                    <span className="font-black text-cyan-100">Mi okozta: </span>{item.cause}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



function monitorStatusBadge(status: MonitorLevel) {
  if (status === "ok") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-200";
  if (status === "warning") return "border-amber-300/30 bg-amber-400/10 text-amber-200";
  return "border-red-300/30 bg-red-400/10 text-red-200";
}

function ServerMonitorPanel({
  data,
  loading,
  message,
  testEmailLoading,
  onLoadHistory,
  onRunCheck,
  onSendTestEmail,
}: {
  data: ServerMonitorResponse | null;
  loading: boolean;
  message: string;
  testEmailLoading: boolean;
  onLoadHistory: () => void;
  onRunCheck: () => void;
  onSendTestEmail: () => void;
}) {
  const latest = data?.latest ?? null;
  const history = data?.history ?? [];
  const failingChecks = latest?.checks.filter((item) => item.status !== "ok") ?? [];
  const emailTests = data?.emailTests ?? [];
  const latestEmailTest = emailTests[0] ?? null;
  const httpTargets = data?.config?.monitoredHttpTargets ?? [];
  const alertRules = data?.config?.alertRules ?? [];
  const httpStatuses = latest?.metrics.httpStatuses ?? {};

  return (
    <div className="grid gap-7">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Automatikus szerverőr</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">6 óránkénti DIMPRO szerverellenőrzés</h2>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
              Ellenőrzi a főoldal HTTP válaszát, a Next.js CSS/static fájlokat, a helyi appot, PM2 folyamatokat, Nginx konfigurációt,
              tárhelyet, memóriát és a standalone build kritikus fájljait. Hibánál naplóz, és SMTP beállítás esetén e-mailt is tud küldeni.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:w-[660px]">
            <button
              type="button"
              onClick={onRunCheck}
              disabled={loading}
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
              Kézi ellenőrzés
            </button>
            <button
              type="button"
              onClick={onSendTestEmail}
              disabled={loading || testEmailLoading}
              className="inline-flex items-center justify-center gap-3 rounded-2xl border border-emerald-300/35 bg-emerald-300/10 px-5 py-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testEmailLoading ? <Loader2 className="animate-spin" size={18} /> : null}
              Teszt e-mail
            </button>
            <button
              type="button"
              onClick={onLoadHistory}
              disabled={loading}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Napló frissítése
            </button>
          </div>
        </div>

        {message && <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200">{message}</p>}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-3xl border p-5 ${latest ? monitorStatusBadge(latest.status) : "border-white/10 bg-slate-950/35 text-slate-300"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">Legutóbbi állapot</p>
            <p className="mt-2 text-2xl font-black text-white">{latest?.label ?? "Még nincs futtatás"}</p>
            <p className="mt-2 text-xs font-semibold leading-5 opacity-90">{latest ? formatDateTime(latest.collectedAt) : "Indíts kézi ellenőrzést vagy várd meg a cron futást."}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Tárhely / memória</p>
            <p className="mt-2 text-2xl font-black text-white">{latest?.metrics.diskUsePercent ?? "-"}% / {latest?.metrics.memoryUsagePercent ?? "-"}%</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Szabad tárhely: {formatBytes(latest?.metrics.diskAvailableBytes ?? 0)} · elérhető RAM: {formatBytes(latest?.metrics.memoryAvailableBytes ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">PM2 / HTTP / CSS</p>
            <p className="mt-2 text-2xl font-black text-white">{latest ? `${latest.metrics.pm2OnlineCount}/${latest.metrics.pm2TotalCount}` : "-"}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Főoldal: {latest?.metrics.homepageStatus ? `HTTP ${latest.metrics.homepageStatus}` : "-"} · CSS: {latest?.metrics.cssStatus ? `HTTP ${latest.metrics.cssStatus}` : "-"}</p>
          </div>
          <div className={`rounded-3xl border p-5 ${data?.config?.emailEnabled ? "border-emerald-300/25 bg-emerald-400/10" : "border-amber-300/25 bg-amber-400/10"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-200/80">E-mail riasztás</p>
            <p className="mt-2 text-2xl font-black text-white">{data?.config?.emailEnabled ? "Aktív" : "Nincs teljesen beállítva"}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-200/85">SMTP: {data?.config?.smtpConfigured ? "van" : "nincs"} · címzett: {data?.config?.emailRecipients?.length ?? 0} db</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black text-white">Legutóbbi ellenőrzés részletei</h3>
              <p className="mt-1 text-sm font-semibold text-slate-400">A hibás és warning státuszú pontok felül jelennek meg.</p>
            </div>
            {latest && <span className={`rounded-full border px-3 py-1 text-xs font-black ${monitorStatusBadge(latest.status)}`}>{latest.status.toUpperCase()}</span>}
          </div>
          {!latest ? (
            <p className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm font-semibold text-slate-400">Nincs még ellenőrzési napló.</p>
          ) : (
            <div className="grid gap-3">
              {(failingChecks.length ? failingChecks : latest.checks).map((item) => (
                <div key={`${latest.id}-${item.id}`} className={`rounded-2xl border p-4 ${monitorStatusBadge(item.status)}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-black text-white">{item.label}</p>
                      <p className="mt-2 text-xs font-semibold leading-5 opacity-90">{item.detail}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-950/35 px-3 py-1 text-xs font-black">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
          <h3 className="text-xl font-black text-white">Üzemeltetési beállítás</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">A VPS cron bejegyzés 6 óránként futtatja a szerverőrt. A felület csak naplóz és riaszt, automatikusan nem töröl és nem indít újra semmit.</p>

          <div className={`mt-4 rounded-2xl border p-4 ${data?.config?.emailEnabled ? "border-emerald-300/25 bg-emerald-400/10" : "border-amber-300/25 bg-amber-400/10"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-200/80">SMTP / e-mail riasztás</p>
            <p className="mt-2 text-lg font-black text-white">{data?.config?.emailEnabled ? "Riasztásra kész" : "Beállítás szükséges"}</p>
            <div className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-slate-200/90">
              <p>SMTP: <span className="font-black text-white">{data?.config?.smtpConfigured ? "beállítva" : "hiányzik"}</span></p>
              <p>Host: <span className="font-mono text-white">{data?.config?.smtpHost ?? "-"}</span>{data?.config?.smtpPort ? `:${data.config.smtpPort}` : ""}</p>
              <p>Címzettek: <span className="font-black text-white">{data?.config?.emailRecipients?.length ?? 0} db</span></p>
              <p className="break-all">Címzett lista: <span className="font-mono text-white">{data?.config?.emailRecipients?.join(", ") || "-"}</span></p>
              <p>Küldő mező: <span className="font-black text-white">{data?.config?.smtpFromConfigured ? "van" : "hiányzik"}</span></p>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Szükséges env változók</p>
              <p className="mt-2 font-mono text-[11px] font-bold leading-5 text-slate-300">{data?.config?.requiredEnvVars?.join(" · ") ?? "DIMPRO_SMTP_HOST · DIMPRO_SMTP_USER · DIMPRO_SMTP_PASS · DIMPRO_SERVER_MONITOR_EMAIL_TO"}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Hely: {data?.config?.envFileHint ?? "/root/dimprover/.env.local vagy PM2 env"}</p>
            </div>
            {latestEmailTest && (
              <div className={`mt-4 rounded-xl border p-3 ${latestEmailTest.sent ? "border-emerald-300/25 bg-emerald-400/10" : "border-amber-300/25 bg-amber-400/10"}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-200/80">Utolsó teszt e-mail</p>
                <p className="mt-2 text-sm font-black text-white">{latestEmailTest.sent ? "Sikeres küldés" : "Nem ment ki"}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-200/85">{formatDateTime(latestEmailTest.createdAt)} · {latestEmailTest.reason}</p>
                {latestEmailTest.friendlyError && <p className="mt-2 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs font-black leading-5 text-red-50">{latestEmailTest.friendlyError}</p>}
                {latestEmailTest.error && <p className="mt-1 text-xs font-semibold leading-5 text-red-100">Technikai hiba: {latestEmailTest.error}</p>}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Figyelt webes felületek</p>
            <div className="mt-3 grid gap-2">
              {httpTargets.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400">Nincs külön figyelt HTTP cél konfigurálva.</p>
              ) : httpTargets.map((target) => {
                const statusValue = httpStatuses[target.id];
                const statusLabel = statusValue === undefined ? "még nincs futtatás" : statusValue === null ? "nincs válasz" : `HTTP ${statusValue}`;
                const ok = typeof statusValue === "number" && statusValue >= 200 && statusValue < 400;
                return (
                  <div key={target.id} className={`rounded-xl border px-3 py-3 ${ok ? "border-emerald-300/20 bg-emerald-400/10" : statusValue === undefined ? "border-white/10 bg-white/[0.04]" : "border-red-300/25 bg-red-400/10"}`}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-black text-white">{target.label}</p>
                      <p className="font-mono text-xs font-black text-cyan-100">{statusLabel}</p>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-400">{target.url}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-400">Elvárt: {target.expected}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Szerver riasztási szabályok</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Azonos hiba esetén legfeljebb 1 e-mail / {data?.config?.duplicateThrottleHours ?? 6} óra.</p>
            <div className="mt-3 grid gap-2">
              {alertRules.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400">Nincs riasztási szabálylista.</p>
              ) : alertRules.map((rule) => (
                <div key={rule.id} className={`rounded-xl border px-3 py-3 ${rule.level === "error" ? "border-red-300/25 bg-red-400/10" : "border-amber-300/25 bg-amber-400/10"}`}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-black text-white">{rule.label}</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-200">{rule.level}</p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-300">{rule.condition}</p>
                  <p className="mt-1 text-[11px] font-semibold leading-5 text-cyan-100">{rule.emailSubject}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/80">Cron ütemezés</p>
            <p className="mt-2 font-mono text-xs font-bold leading-6 text-cyan-50 break-all">{data?.config?.recommendedCron ?? "7 */6 * * * /bin/bash /root/dimprover/scripts/run-server-monitor.sh"}</p>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Naplófájlok</p>
            <p className="mt-2 font-mono text-xs font-bold leading-6 text-slate-300 break-all">{data?.config?.historyFile ?? ".dimprover/monitor/server-health-history.jsonl"}</p>
            <p className="mt-2 font-mono text-xs font-bold leading-6 text-slate-300 break-all">{data?.config?.cronLogFile ?? ".dimprover/monitor/cron.log"}</p>
          </div>
          {latest?.notification && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Utolsó riasztás</p>
              <p className="mt-2 text-sm font-black text-white">{latest.notification.sent ? "E-mail elküldve" : "Nem küldött e-mailt"}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{latest.notification.reason}</p>
              {latest.notification.friendlyError && <p className="mt-2 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs font-black leading-5 text-red-50">{latest.notification.friendlyError}</p>}
              {latest.notification.error && <p className="mt-1 text-xs font-semibold leading-5 text-red-100">Technikai hiba: {latest.notification.error}</p>}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
        <h3 className="mb-4 text-xl font-black text-white">Ellenőrzési napló</h3>
        {history.length === 0 ? (
          <p className="text-sm font-semibold text-slate-400">Nincs még naplózott ellenőrzés.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  <th className="px-3">Időpont</th>
                  <th className="px-3">Forrás</th>
                  <th className="px-3">Állapot</th>
                  <th className="px-3">Tárhely</th>
                  <th className="px-3">Memória</th>
                  <th className="px-3">PM2</th>
                  <th className="px-3">CSS</th>
                  <th className="px-3">Idő</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 40).map((item) => (
                  <tr key={item.id} className="bg-white/[0.04] text-sm font-semibold text-slate-300">
                    <td className="rounded-l-2xl px-3 py-3 font-black text-white">{formatDateTime(item.collectedAt)}</td>
                    <td className="px-3 py-3">{item.source}</td>
                    <td className="px-3 py-3"><span className={`rounded-full border px-3 py-1 text-xs font-black ${monitorStatusBadge(item.status)}`}>{item.status}</span></td>
                    <td className="px-3 py-3">{item.metrics.diskUsePercent ?? "-"}%</td>
                    <td className="px-3 py-3">{item.metrics.memoryUsagePercent ?? "-"}%</td>
                    <td className="px-3 py-3">{item.metrics.pm2OnlineCount}/{item.metrics.pm2TotalCount}</td>
                    <td className="px-3 py-3">{item.metrics.cssStatus ? `HTTP ${item.metrics.cssStatus}` : "-"}</td>
                    <td className="rounded-r-2xl px-3 py-3">{item.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type PieChartDatum = {
  label: string;
  value: number;
  helper?: string;
};

const PIE_CHART_COLORS = ["#f97316", "#38bdf8", "#a855f7", "#eab308", "#ef4444", "#14b8a6", "#6366f1"];
const PIE_FREE_COLOR = "#22c55e";
const PIE_USED_DISK_COLOR = "#f97316";
const PIE_USED_SWAP_COLOR = "#ef4444";
const PIE_USED_RAM_COLOR = "#38bdf8";
const PIE_CACHE_COLOR = "#a855f7";

function getPieColor(item: PieChartDatum, index: number) {
  const label = item.label.toLowerCase();
  if (label.includes("szabad")) return PIE_FREE_COLOR;
  if (label.includes("foglalt")) return PIE_USED_DISK_COLOR;
  if (label.includes("használt swap")) return PIE_USED_SWAP_COLOR;
  if (label.includes("használt ram")) return PIE_USED_RAM_COLOR;
  if (label.includes("cache") || label.includes("puffer")) return PIE_CACHE_COLOR;
  return PIE_CHART_COLORS[index % PIE_CHART_COLORS.length];
}

function createPieGradient(data: PieChartDatum[]) {
  const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  if (total <= 0) return "rgba(148,163,184,0.22)";

  let cursor = 0;
  const segments = data.map((item, index) => {
    const start = cursor;
    const percent = (Math.max(item.value, 0) / total) * 100;
    cursor += percent;
    const color = getPieColor(item, index);
    return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

function PieChartCard({ title, helper, data, valueFormatter = formatBytes }: { title: string; helper: string; data: PieChartDatum[]; valueFormatter?: (value: number) => string }) {
  const cleanData = data.filter((item) => item.value > 0);
  const total = cleanData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className="relative h-40 w-40 shrink-0 rounded-full shadow-[0_20px_55px_rgba(0,0,0,0.28)]"
          style={{ background: createPieGradient(cleanData) }}
        >
          <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full border border-white/10 bg-[#06111f] text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Összesen</span>
            <span className="mt-1 text-lg font-black text-white">{valueFormatter(total)}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{helper}</p>
          <div className="mt-4 grid gap-2">
            {cleanData.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">Nincs megjeleníthető adat.</p>
            ) : (
              cleanData.map((item, index) => {
                const percent = total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0;
                return (
                  <div key={`${item.label}-${item.value}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: getPieColor(item, index) }} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="shrink-0 text-cyan-100">{valueFormatter(item.value)} · {percent}%</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function loadingLabelForTab(tab: ServerStatusTab) {
  if (tab === "overview") return "Alap szerverállapot frissítése";
  if (tab === "storage") return "Tárhely- és mappaméret adatok lekérdezése";
  if (tab === "processes") return "Folyamat- és swap adatok lekérdezése";
  if (tab === "operations") return "Üzemeltetési diagnosztika lekérdezése";
  if (tab === "warnings") return "Fejlesztői warning lista lekérdezése";
  if (tab === "monitor") return "Automatikus szerverőr napló lekérdezése";
  return "Részletes listák lekérdezése";
}

function LoadingOverlay({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020914]/72 px-5 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[2rem] border border-cyan-300/20 bg-[#081525]/95 p-7 text-center shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
        <div className="mx-auto flex h-24 w-24 items-center justify-center bg-cyan-300/15 text-cyan-100 [clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0_50%)]">
          <div className="flex h-20 w-20 animate-pulse items-center justify-center border border-cyan-200/40 bg-[#06111f] text-sm font-black tracking-[0.18em] [clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0_50%)]">
            DIMPRO
          </div>
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Lekérdezés folyamatban</p>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{label}</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">A nagyobb diagnosztikai lekérdezések külön futnak, hogy az oldal ne akadjon meg.</p>
        <div className="mt-6 h-4 overflow-hidden rounded-full border border-cyan-300/20 bg-white/10">
          <div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{ width: `${Math.min(Math.max(progress, 8), 100)}%` }} />
        </div>
        <p className="mt-3 text-sm font-black text-cyan-100">{Math.round(progress)}%</p>
      </div>
    </div>
  );
}

export default function ServerStatusPage() {
  const [adminKey, setAdminKey] = useState("");
  const [status, setStatus] = useState<ServerStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<ServerStatusTab>("overview");
  const [loadingLabel, setLoadingLabel] = useState("Szerverállapot lekérdezése");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [monitorData, setMonitorData] = useState<ServerMonitorResponse | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorEmailTestLoading, setMonitorEmailTestLoading] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState("");

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (storedAdminKey) setAdminKey(storedAdminKey);
  }, []);

  const loadStatus = useCallback(async (key = adminKey, mode: ServerStatusTab = "overview") => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    setLoading(true);
    setLoadingLabel(loadingLabelForTab(mode));
    setLoadingProgress(12);
    setMessage("");

    try {
      const query = new URLSearchParams({ mode });
      if (mode === "warnings") query.set("includeWarnings", "1");
      setLoadingProgress(mode === "overview" ? 45 : 28);
      const response = await fetch(`/api/license/server-status?${query.toString()}`, {
        headers: {
          "x-dimpro-license-admin-key": trimmedKey,
          "accept": "application/json",
        },
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") ?? "";
      setLoadingProgress(72);
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        setStatus(null);
        setMessage(
          response.redirected || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")
            ? "A szerverállapot API helyett HTML/login oldal érkezett. Frissítsd a licencadmin belépést, majd próbáld újra."
            : `Nem JSON válasz érkezett: ${text.slice(0, 120)}`,
        );
        return;
      }
      const data = (await response.json()) as ServerStatusResponse;

      if (!response.ok || !data.ok) {
        setStatus(null);
        setMessage(data.error ?? "Nem sikerült lekérni a szerverállapotot.");
        return;
      }

      setLoadingProgress(92);
      setStatus(data);
    } catch (error) {
      setStatus(null);
      setMessage(error instanceof Error ? error.message : "Ismeretlen szerverállapot lekérési hiba.");
    } finally {
      setLoadingProgress(100);
      window.setTimeout(() => setLoading(false), 260);
    }
  }, [adminKey]);

  const loadMonitor = useCallback(async (runCheck = false) => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setMonitorMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    setMonitorLoading(true);
    setMonitorMessage("");

    try {
      const response = await fetch("/api/license/server-monitor?limit=80", {
        method: runCheck ? "POST" : "GET",
        headers: {
          "x-dimpro-license-admin-key": trimmedKey,
          "accept": "application/json",
          ...(runCheck ? { "content-type": "application/json" } : {}),
        },
        body: runCheck ? JSON.stringify({ source: "manual" }) : undefined,
        cache: "no-store",
      });
      const data = (await response.json()) as ServerMonitorResponse;
      if (!response.ok || !data.ok) {
        setMonitorMessage(data.error ?? "Nem sikerült lekérni a szerverőr naplót.");
        return;
      }
      setMonitorData(data);
    } catch (error) {
      setMonitorMessage(error instanceof Error ? error.message : "Ismeretlen szerverőr hiba.");
    } finally {
      setMonitorLoading(false);
    }
  }, [adminKey]);

  const sendMonitorTestEmail = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setMonitorMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    setMonitorEmailTestLoading(true);
    setMonitorMessage("");

    try {
      const response = await fetch("/api/license/server-monitor?limit=80", {
        method: "POST",
        headers: {
          "x-dimpro-license-admin-key": trimmedKey,
          "accept": "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "testEmail" }),
        cache: "no-store",
      });
      const data = (await response.json()) as ServerMonitorResponse;
      if (!response.ok || !data.ok) {
        setMonitorMessage(data.error ?? "Nem sikerült elküldeni a teszt e-mailt.");
        return;
      }
      setMonitorData(data);
      if (data.emailTest) {
        setMonitorMessage(data.emailTest.sent ? "Teszt e-mail elküldve." : data.emailTest.friendlyError ?? data.emailTest.reason);
      }
    } catch (error) {
      setMonitorMessage(error instanceof Error ? error.message : "Ismeretlen teszt e-mail hiba.");
    } finally {
      setMonitorEmailTestLoading(false);
    }
  }, [adminKey]);


  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveTab("overview");
    void loadStatus(adminKey, "overview");
  }

  useEffect(() => {
    if (!status || !autoRefresh || !adminKey.trim() || activeTab !== "overview") return undefined;

    const interval = window.setInterval(() => {
      setActiveTab("overview");
    void loadStatus(adminKey, "overview");
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [activeTab, adminKey, autoRefresh, loadStatus, status]);

  const pm2OnlineCount = useMemo(
    () => status?.services.pm2.processes.filter((processItem) => processItem.status === "online").length ?? 0,
    [status],
  );

  const criticalDisk = status?.disk && status.disk.usePercent >= 95;

  return (
    <main className="benjadmin-server-detail min-h-screen">
      {loading && <LoadingOverlay label={loadingLabel} progress={loadingProgress} />}
      <div className="benjadmin-server-detail__grid" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1680px] px-5 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8 lg:px-10 lg:pb-6">
        <header className="benjadmin-server-detail__header mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/admin" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-white">
              <ArrowLeft size={18} /> Vissza a licencadmin felületre
            </Link>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300/80">DIMPRO belső rendszerfelügyelet</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">Szerver állapotfigyelő</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
              Részletes VPS-diagnosztika: memória, swap, tárhely, PM2 folyamatok, nagy mappák, nagy fájlok és fejlesztési csomagok áttekintése.
            </p>
          </div>

          {status && (
            <div className={`rounded-3xl border px-5 py-4 ${statusColor(status.summary.level)}`}>
              <div className="flex items-center gap-3">
                {status.summary.level === "ok" ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">Összesített állapot</p>
                  <p className="text-2xl font-black">{status.summary.label}</p>
                </div>
              </div>
            </div>
          )}
        </header>

        <section className="benjadmin-server-detail__controls mb-4">
          <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                <KeyRound size={17} /> Admin kulcs
              </span>
              <input
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                type="password"
                placeholder="DIMPRO-LICENSE-ADMIN-..."
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-4 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !adminKey.trim()}
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={19} /> : <RefreshCcw size={19} />}
              Állapot frissítése
            </button>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <button
                type="button"
                onClick={() => setAutoRefresh((current) => !current)}
                className={`rounded-2xl border px-6 py-4 text-sm font-black transition ${
                  autoRefresh
                    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/[0.04] text-slate-300"
                }`}
              >
                Auto frissítés: {autoRefresh ? "be" : "ki"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("warnings");
                  void loadStatus(adminKey, "warnings");
                }}
                disabled={loading || !adminKey.trim()}
                className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-6 py-4 text-sm font-black text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Warning lista lekérése
              </button>
            </div>
          </form>
          {message && <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200">{message}</p>}
        </section>

        {status ? (
          <>
            <section className="benjadmin-server-detail__tabs sticky top-3 z-20 mb-4 hidden lg:block">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                <TabButton active={activeTab === "overview"} label="Áttekintés" onClick={() => setActiveTab("overview")} />
                <TabButton active={activeTab === "storage"} label="Tárhely" onClick={() => setActiveTab("storage")} />
                <TabButton active={activeTab === "processes"} label="Folyamatok" onClick={() => setActiveTab("processes")} />
                <TabButton active={activeTab === "operations"} label="Üzemeltetés" onClick={() => setActiveTab("operations")} />
                <TabButton active={activeTab === "warnings"} label="Warningok" onClick={() => setActiveTab("warnings")} />
                <TabButton active={activeTab === "monitor"} label="Szerverőr" onClick={() => { setActiveTab("monitor"); void loadMonitor(false); }} />
                <TabButton active={activeTab === "raw"} label="Részletes listák" onClick={() => setActiveTab("raw")} />
              </div>
              <div className="benjadmin-server-detail__tab-hint mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold leading-6 text-slate-300">
                  Az alap frissítés csak gyors szerveradatokat kér le. Az aktív fül részletes adatai külön gombbal futnak, hogy a felület ne lassuljon be.
                </p>
                <button
                  type="button"
                  onClick={() => { if (activeTab === "monitor") void loadMonitor(false); else void loadStatus(adminKey, activeTab); }}
                  disabled={loading || !adminKey.trim()}
                  className="shrink-0 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Aktív fül lekérdezése
                </button>
              </div>
            </section>


            <nav
              className="benjadmin-server-detail__mobile-nav fixed inset-x-[10px] bottom-[max(10px,env(safe-area-inset-bottom))] z-50 p-[7px] lg:hidden"
              aria-label="Szerverállapot mobil és tablet navigáció"
            >
              <div className="grid grid-flow-col auto-cols-[minmax(68px,1fr)] gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[
                  { id: "overview" as const, label: "Áttekintés", shortLabel: "Áttek.", icon: Activity },
                  { id: "storage" as const, label: "Tárhely", shortLabel: "Tárhely", icon: HardDrive },
                  { id: "processes" as const, label: "Folyamatok", shortLabel: "Folyam.", icon: MemoryStick },
                  { id: "operations" as const, label: "Üzemeltetés", shortLabel: "Üzem.", icon: Server },
                  { id: "warnings" as const, label: "Warningok", shortLabel: "Warn.", icon: AlertTriangle },
                  { id: "monitor" as const, label: "Szerverőr", shortLabel: "Őr", icon: RefreshCcw },
                  { id: "raw" as const, label: "Részletes listák", shortLabel: "Listák", icon: KeyRound },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setActiveTab(item.id);
                        if (item.id === "monitor") void loadMonitor(false);
                      }}
                      className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[9px] font-black transition ${
                        active
                          ? "border-cyan-300/45 bg-cyan-300 text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.2)]"
                          : "border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span className="whitespace-nowrap">{item.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {criticalDisk && activeTab === "overview" && (
              <section className="mb-7 rounded-[2rem] border border-red-400/35 bg-red-500/10 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-red-200">Kritikus tárhelyfigyelmeztetés</p>
                    <h2 className="mt-2 text-2xl font-black text-white">A szerver gyökérlemeze {status.disk?.usePercent}% telítettségű.</h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-red-100/85">A felület csak kimutatást készít, nem töröl automatikusan.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/40 px-5 py-4 text-sm font-black text-red-100">Szabad: {status.disk ? formatKilobytes(status.disk.availableKb) : "-"}</div>
                </div>
              </section>
            )}

            {activeTab === "overview" && (
              <div className="grid gap-7">
                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard title="Tárhely" value={status.disk ? `${status.disk.usePercent}%` : "-"} helper={status.disk ? `${formatKilobytes(status.disk.availableKb)} szabad / ${formatKilobytes(status.disk.sizeKb)} összesen` : "Nincs tárhelyadat"} icon={HardDrive} />
                  <StatCard title="Memória" value={`${status.memory.usagePercent}%`} helper={`${formatBytes(status.memory.availableBytes)} elérhető / ${formatBytes(status.memory.totalBytes)} összesen`} icon={MemoryStick} />
                  <StatCard title="PM2 folyamatok" value={`${pm2OnlineCount}/${status.services.pm2.processes.length} online`} helper={`PM2 ${status.server.pm2Version ?? "-"}`} icon={Activity} />
                  <StatCard title="Szerver uptime" value={formatDurationFromSeconds(status.server.uptimeSeconds)} helper={status.server.hostname} icon={Server} />
                </section>

                <CollapsiblePanel title="Teendők / javasolt műveletek" helper="A rendszeradatokból készített rövid döntéstámogató lista." defaultOpen>
                  <RecommendedActionList items={status.operations.recommendedActions} />
                </CollapsiblePanel>

                <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                  <CollapsiblePanel title="Erőforrások" helper="Memória, swap és tárhely rövid állapota." defaultOpen>
                    <div className="grid gap-4">
                      <UsageBar label="Effektív memóriahasználat" value={status.memory.usagePercent} detail={`${formatBytes(status.memory.availableBytes)} még elérhető, nyers használt RAM: ${formatBytes(status.memory.usedBytes)} (${status.memory.rawUsedPercent}%)`} />
                      <UsageBar label="Swap" value={status.memory.swapUsagePercent} detail={`${formatBytes(status.memory.swapUsedBytes)} / ${formatBytes(status.memory.swapTotalBytes)} használatban`} />
                      <UsageBar label="Tárhely" value={status.disk?.usePercent ?? 0} detail={status.disk ? `${formatKilobytes(status.disk.usedKb)} / ${formatKilobytes(status.disk.sizeKb)} használatban a ${status.disk.mountedOn} csatoláson` : "Nincs tárhelyadat"} />
                    </div>
                  </CollapsiblePanel>

                  <CollapsiblePanel title="Összesítés" defaultOpen>
                    <div className="grid gap-3 text-sm font-semibold text-slate-300">
                      <p>Utolsó lekérés: <span className="font-black text-white">{formatDateTime(status.collectedAt)}</span></p>
                      <p>Platform: <span className="font-black text-white">{status.server.platform} / {status.server.arch}</span></p>
                      <p>Node: <span className="font-black text-white">{status.server.nodeVersion}</span>, npm: <span className="font-black text-white">{status.server.npmVersion ?? "-"}</span></p>
                      <p>Nginx: <span className="font-black text-white">{status.services.nginx.message}</span></p>
                      <p>Load average: <span className="font-black text-white">{status.server.loadAverage.map((item) => item.toFixed(2)).join(" / ")}</span></p>
                      <p>Git változások: <span className="font-black text-white">{status.git.totalCount} elem</span> ({status.git.changedCount} módosított, {status.git.untrackedCount} új)</p>
                    </div>
                    {status.summary.warnings.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4">
                        <p className="mb-2 text-sm font-black text-amber-200">Figyelmeztetések</p>
                        <ul className="space-y-2 text-sm font-semibold text-amber-100/90">{status.summary.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
                      </div>
                    )}
                  </CollapsiblePanel>
                </div>
              </div>
            )}

            {activeTab === "storage" && (
              <div className="grid gap-7">
                <CollapsiblePanel title="Kördiagramok: tárhely és memória" helper="A tárhely kördiagram tartalmazza a szabad tárhelyet is." defaultOpen>
                  <div className="grid gap-5 xl:grid-cols-3">
                    <PieChartCard
                      title="Tárhely foglalt / szabad"
                      helper="A teljes szerverlemezen jelenleg foglalt és szabad tárhely. A szabad tárhely mindenhol zöld jelölést kap."
                      data={[
                        { label: "Foglalt tárhely", value: (status.disk?.usedKb ?? 0) * 1024, helper: "A teljes / lemezen jelenleg foglalt méret." },
                        { label: "Szabad tárhely", value: (status.disk?.availableKb ?? 0) * 1024, helper: "A teljes / lemezen még szabadon elérhető méret." },
                      ]}
                    />
                    <PieChartCard title="RAM megoszlás" helper="Linux memória bontás." data={[{ label: "Használt RAM", value: status.memory.usedBytes }, { label: "Cache / puffer", value: status.memory.buffCacheBytes }, { label: "Szabad RAM", value: status.memory.freeBytes }]} />
                    <PieChartCard title="Swap megoszlás" helper="Swap használat és szabad swap." data={[{ label: "Használt swap", value: status.memory.swapUsedBytes }, { label: "Szabad swap", value: status.memory.swapFreeBytes }]} />
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Mi foglal sok helyet?" defaultOpen>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {status.storage.categories.map((category) => (
                      <div key={category.label} className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{category.label}</p>
                        <p className="mt-3 text-2xl font-black text-white">{formatBytes(category.sizeBytes)}</p>
                        <p className="mt-3 font-mono text-[11px] font-semibold text-cyan-100/80">{category.path}</p>
                        <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">{category.note}</p>
                      </div>
                    ))}
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="DIMPRO / DIMPROVER mappaméret sávdiagramok" helper="Dinamikus lista: új mappa automatikusan megjelenik a következő frissítéskor." defaultOpen>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <FolderGroupColumn title="DIMPRO tárhelyterületek" helper="DIMPRO appok, privát release csomagok és Fájlműhely munkaanyagok bontása." groups={status.storage.folderGroups.dimpro} />
                    <FolderGroupColumn title="DIMPROVER tárhelyterületek" helper="Fő DIMPROVER app és fejlesztői dev példány almappáinak méretbontása." groups={status.storage.folderGroups.dimprover} />
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Release csomagok tárhelyfigyelő" helper="Privát release tárhely mérete, darabszáma és lejárt csomagok." defaultOpen>
                  <ReleaseStoragePanel data={status.operations.releaseStorage} />
                </CollapsiblePanel>
              </div>
            )}

            {activeTab === "processes" && (
              <div className="grid gap-7">
                <CollapsiblePanel title="Memóriafolyamatok" helper="RSS memória alapján rendezett lista." defaultOpen>
                  {status.processes.topMemory.length > 0 ? <MemoryProcessTable items={status.processes.topMemory} /> : <p className="text-sm font-semibold text-slate-400">Nincs folyamatlista adat.</p>}
                </CollapsiblePanel>
                <CollapsiblePanel title="Swap használat folyamatonként" helper="Megmutatja, mely háttérfolyamatoknál maradt swapban memória." defaultOpen>
                  {status.processes.topSwap.length > 0 ? <SwapProcessTable items={status.processes.topSwap} /> : <p className="text-sm font-semibold text-slate-400">Nincs swapot használó folyamat.</p>}
                </CollapsiblePanel>
                <CollapsiblePanel title="PM2 folyamatok" helper="A webes appok PM2 alatt futó folyamatai." defaultOpen>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] border-separate border-spacing-y-3 text-left">
                      <thead><tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400"><th className="px-4">Folyamat</th><th className="px-4">Állapot</th><th className="px-4">CPU</th><th className="px-4">Memória</th><th className="px-4">Uptime</th><th className="px-4">Restart</th></tr></thead>
                      <tbody>{status.services.pm2.processes.map((processItem) => (
                        <tr key={processItem.name} className="rounded-2xl bg-slate-950/35 text-sm font-semibold text-slate-200"><td className="rounded-l-2xl px-4 py-4 font-black text-white">{processItem.name}</td><td className="px-4 py-4"><span className={processItem.status === "online" ? "rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200" : "rounded-full bg-red-400/15 px-3 py-1 text-xs font-black text-red-200"}>{processItem.status}</span></td><td className="px-4 py-4">{processItem.cpuPercent}%</td><td className="px-4 py-4">{formatBytes(processItem.memoryBytes)}</td><td className="px-4 py-4">{formatDurationFromMs(processItem.uptimeMs)}</td><td className="rounded-r-2xl px-4 py-4">{processItem.restarts}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </CollapsiblePanel>
              </div>
            )}

            {activeTab === "operations" && (
              <div className="grid gap-7">
                <CollapsiblePanel title="Backup állapot panel" helper="Utolsó mentések, hibás backupok és gyanúsan nagy archívok." defaultOpen>
                  <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-slate-300">{status.operations.backup.message} Utolsó: {status.operations.backup.latestPath ?? "-"} · {formatBytes(status.operations.backup.latestSizeBytes)}</div>
                  <DiagnosticGrid items={status.operations.backup.items} />
                </CollapsiblePanel>
                <CollapsiblePanel title="Domain / port / PM2 térkép" helper="Nginx proxy_pass alapján kiolvasott domain és port kapcsolatok." defaultOpen><DomainRouteTable items={status.operations.domainRoutes} /></CollapsiblePanel>
                <CollapsiblePanel title="SSL tanúsítvány lejárati figyelő" helper="Let's Encrypt tanúsítványok lejárati állapota." defaultOpen><SslTable items={status.operations.sslCertificates} /></CollapsiblePanel>
                <CollapsiblePanel title="Log hibaösszesítő" helper="PM2, Nginx és backup logok rövid összesítése." defaultOpen><LogSummaryList items={status.operations.logs} /></CollapsiblePanel>
                <CollapsiblePanel title="Biztonsági checklist" helper="Alap szerver- és appvédelmi pontok." defaultOpen><SecurityChecklist items={status.operations.securityChecks} /></CollapsiblePanel>
                <CollapsiblePanel title="Takarítási javaslat" helper="Csak tervet mutat, automatikusan nem töröl semmit." defaultOpen><CleanupPlan items={status.operations.cleanupSuggestions} /></CollapsiblePanel>
              </div>
            )}

            {activeTab === "warnings" && (
              <CollapsiblePanel title="Fejlesztői warning lista" helper="ESLint alapján készült kódminőségi lista. A lista külön gombbal frissül." defaultOpen>
                <CodeWarningList data={status.codeQuality.warnings} />
              </CollapsiblePanel>
            )}

            {activeTab === "monitor" && (
              <ServerMonitorPanel
                data={monitorData}
                loading={monitorLoading}
                message={monitorMessage}
                testEmailLoading={monitorEmailTestLoading}
                onLoadHistory={() => void loadMonitor(false)}
                onRunCheck={() => void loadMonitor(true)}
                onSendTestEmail={() => void sendMonitorTestEmail()}
              />
            )}

            {activeTab === "raw" && (
              <section className="grid gap-5 xl:grid-cols-2">
                <StorageTable title="/root/dimprover mappabontás" items={status.storage.projectDirectories} emptyText="Nincs projektmappa adat." />
                <StorageTable title="/root fő mappák" items={status.storage.rootDirectories} emptyText="Nincs /root tárhelyadat." />
                <StorageTable title=".dimprover alatti nagy mappák" items={status.storage.dimproverDirectories} emptyText="Nincs .dimprover részletes adat." />
                <StorageTable title="Projektgyökér nagy fájljai" items={status.storage.topProjectFiles} emptyText="Nincs nagy fájl adat." />
              </section>
            )}
          </>
        ) : (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-10 text-center shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
            <HardDrive className="mx-auto text-cyan-200" size={54} />
            <h2 className="mt-5 text-2xl font-black text-white">Szerverállapot még nincs betöltve</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-400">
              Add meg a licencadmin kulcsot, majd indítsd el az állapotfrissítést. A lekérdezés részletes tárhely- és memória-diagnosztikát készít.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
