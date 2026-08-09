import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export type MonitorLevel = "ok" | "warning" | "error";

export type MonitorCheckItem = {
  id: string;
  label: string;
  status: MonitorLevel;
  value: string;
  detail: string;
  checkedAt: string;
};

export type MonitorNotification = {
  attempted: boolean;
  sent: boolean;
  reason: string;
  to: string[];
  error?: string;
  friendlyError?: string;
};

export type MonitorHttpTarget = {
  id: string;
  label: string;
  url: string;
  method: "GET" | "HEAD";
  expected: string;
  checkCss: boolean;
};

export type ServerMonitorAlertRule = {
  id: string;
  label: string;
  level: MonitorLevel;
  condition: string;
  emailSubject: string;
};

export type ServerMonitorRun = {
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
    httpStatuses: Record<string, number | null>;
  };
  notification: MonitorNotification;
};

export type ServerMonitorConfig = {
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
  monitoredHttpTargets: MonitorHttpTarget[];
  alertRules: ServerMonitorAlertRule[];
  duplicateThrottleHours: number;
  envFileHint: string;
  requiredEnvVars: string[];
  recommendedCron: string;
};

export type ServerMonitorEmailTestResult = {
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

export type ServerMonitorResponse = {
  ok: true;
  config: ServerMonitorConfig;
  latest: ServerMonitorRun | null;
  history: ServerMonitorRun[];
  emailTests: ServerMonitorEmailTestResult[];
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

type Pm2Process = {
  name?: string;
  pm2_env?: {
    status?: string;
  };
};

type DiskInfo = {
  usePercent: number;
  availableBytes: number;
  sizeBytes: number;
  usedBytes: number;
};

type MemoryInfo = {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usagePercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapUsagePercent: number;
};


type MailProfileConfigFile = {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  sharedPassword?: string;
  testRecipients?: string[];
  profiles?: Array<{
    id?: string;
    address?: string;
    enabled?: boolean;
    password?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
  }>;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
};

type NodemailerModule = {
  createTransport: (options: Record<string, unknown>) => {
    sendMail: (options: { from: string; to: string; subject: string; text: string; html: string }) => Promise<unknown>;
  };
};

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;
  if (cwd.endsWith(standaloneSuffix)) return cwd.slice(0, -standaloneSuffix.length);
  return cwd;
}

const projectRoot = process.env.DIMPRO_PROJECT_ROOT ?? resolveProjectRoot();
const monitorDir = path.join(projectRoot, ".dimprover", "monitor");
const mailProfilesFile = path.join(projectRoot, ".dimprover", "mail", "mail-profiles.json");
const historyFile = path.join(monitorDir, "server-health-history.jsonl");
const lastAlertFile = path.join(monitorDir, "last-alert.json");
const emailTestLogFile = path.join(monitorDir, "email-test-history.jsonl");
const cronLogFile = path.join(monitorDir, "cron.log");
const maxHistoryLines = 500;
const duplicateThrottleHours = 6;

function envUrl(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function getMonitorHttpTargets(): MonitorHttpTarget[] {
  return [
    {
      id: "dimpro-homepage",
      label: "DIMPRO.hu főoldal",
      url: envUrl("DIMPRO_MONITOR_HOMEPAGE_URL", "https://dimpro.hu/"),
      method: "GET",
      expected: "HTTP 2xx/3xx válasz és Next.js CSS/static hivatkozás",
      checkCss: true,
    },
    {
      id: "dimprover-homepage",
      label: "DIMPROVER.hu főoldal",
      url: envUrl("DIMPROVER_MONITOR_HOMEPAGE_URL", "https://dimprover.hu/"),
      method: "GET",
      expected: "HTTP 2xx/3xx válasz",
      checkCss: false,
    },
    {
      id: "license-admin",
      label: "license.dimpro.hu admin felület",
      url: envUrl("DIMPRO_MONITOR_LICENSE_URL", "https://license.dimpro.hu/admin/szerver"),
      method: "GET",
      expected: "HTTP 2xx/3xx válasz",
      checkCss: false,
    },
    {
      id: "app-dimpro",
      label: "app.dimpro.hu webes alkalmazás",
      url: envUrl("DIMPRO_MONITOR_APP_URL", "https://app.dimpro.hu/"),
      method: "GET",
      expected: "HTTP 2xx/3xx válasz vagy bejelentkezési átirányítás",
      checkCss: false,
    },
    {
      id: "app-dimprover",
      label: "app.dimprover.hu webes alkalmazás",
      url: envUrl("DIMPROVER_MONITOR_APP_URL", "https://app.dimprover.hu/"),
      method: "GET",
      expected: "HTTP 2xx/3xx válasz vagy bejelentkezési átirányítás",
      checkCss: false,
    },
    {
      id: "local-next-app",
      label: "Helyi Next.js app válasz",
      url: envUrl("DIMPRO_MONITOR_LOCAL_URL", "http://127.0.0.1:3000/"),
      method: "HEAD",
      expected: "HTTP 2xx/3xx válasz a helyi app példánytól",
      checkCss: false,
    },
  ];
}

function getServerMonitorAlertRules(): ServerMonitorAlertRule[] {
  return [
    { id: "disk-warning", label: "Tárhely 85% fölé megy", level: "warning", condition: "/ lemezhasználat >= 85%", emailSubject: "[DIMPRO Szerverőr] Tárhely figyelmeztetés" },
    { id: "disk-error", label: "Tárhely 95% fölé megy", level: "error", condition: "/ lemezhasználat >= 95%", emailSubject: "[DIMPRO Szerverőr] Kritikus tárhelyhiba" },
    { id: "backup", label: "Backup hibás vagy túl nagy", level: "warning", condition: "backup diagnosztika warning/error állapotot jelez", emailSubject: "[DIMPRO Szerverőr] Backup figyelmeztetés" },
    { id: "ssl", label: "SSL tanúsítvány 14 napon belül lejár", level: "warning", condition: "tanúsítvány lejárata <= 14 nap", emailSubject: "[DIMPRO Szerverőr] SSL lejárati figyelmeztetés" },
    { id: "pm2", label: "PM2 folyamat offline", level: "error", condition: "bármely PM2 folyamat nem online", emailSubject: "[DIMPRO Szerverőr] PM2 folyamat offline" },
    { id: "nginx", label: "Nginx config hibát jelez", level: "error", condition: "nginx -t hibával tér vissza", emailSubject: "[DIMPRO Szerverőr] Nginx konfigurációs hiba" },
    { id: "swap", label: "Swap tartósan magas", level: "warning", condition: "swap használat >= 75%", emailSubject: "[DIMPRO Szerverőr] Magas swap használat" },
    { id: "static", label: "Build vagy static asset hiba", level: "error", condition: ".next/standalone static vagy manifest hiányzik", emailSubject: "[DIMPRO Szerverőr] Build/static asset hiba" },
    { id: "dimpro-homepage", label: "DIMPRO.hu főoldal nem válaszol", level: "error", condition: "https://dimpro.hu/ nem ad HTTP 2xx/3xx választ", emailSubject: "[DIMPRO Szerverőr] DIMPRO.hu főoldal nem válaszol" },
    { id: "dimprover-homepage", label: "DIMPROVER.hu főoldal nem válaszol", level: "error", condition: "https://dimprover.hu/ nem ad HTTP 2xx/3xx választ", emailSubject: "[DIMPRO Szerverőr] DIMPROVER.hu főoldal nem válaszol" },
    { id: "license-admin", label: "license.dimpro.hu nem válaszol", level: "error", condition: "https://license.dimpro.hu/admin/szerver nem ad HTTP 2xx/3xx választ", emailSubject: "[DIMPRO Szerverőr] license.dimpro.hu nem válaszol" },
    { id: "app-dimpro", label: "app.dimpro.hu nem válaszol", level: "error", condition: "https://app.dimpro.hu/ nem ad HTTP 2xx/3xx választ", emailSubject: "[DIMPRO Szerverőr] app.dimpro.hu nem válaszol" },
    { id: "app-dimprover", label: "app.dimprover.hu nem válaszol", level: "error", condition: "https://app.dimprover.hu/ nem ad HTTP 2xx/3xx választ", emailSubject: "[DIMPRO Szerverőr] app.dimprover.hu nem válaszol" },
  ];
}

function loadMailProfilesConfigFromFile(): MailProfileConfigFile | null {
  try {
    if (!existsSync(mailProfilesFile)) return null;
    const raw = readFileSync(mailProfilesFile, "utf8");
    return JSON.parse(raw) as MailProfileConfigFile;
  } catch {
    return null;
  }
}

function loadSystemMailProfileFromFile(): SmtpConfig | null {
  try {
    const parsed = loadMailProfilesConfigFromFile();
    if (!parsed) return null;
    const systemProfile = parsed.profiles?.find((profile) => profile.id === "system" && profile.enabled !== false);
    const host = systemProfile?.smtpHost ?? parsed.smtpHost;
    const port = Number(systemProfile?.smtpPort ?? parsed.smtpPort ?? 465);
    const user = systemProfile?.address ?? "system@dimpro.hu";
    const pass = systemProfile?.password ?? parsed.sharedPassword;
    const secure = typeof systemProfile?.smtpSecure === "boolean" ? systemProfile.smtpSecure : (typeof parsed.smtpSecure === "boolean" ? parsed.smtpSecure : port === 465);
    if (!host || !user || !pass) return null;
    return {
      host,
      port: Number.isFinite(port) ? port : 465,
      secure,
      auth: { user, pass },
      from: user,
    };
  } catch {
    return null;
  }
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.DIMPRO_SMTP_HOST ?? process.env.SMTP_HOST;
  const port = Number(process.env.DIMPRO_SMTP_PORT ?? process.env.SMTP_PORT ?? 587);
  const user = process.env.DIMPRO_SMTP_USER ?? process.env.SMTP_USER;
  const pass = process.env.DIMPRO_SMTP_PASS ?? process.env.SMTP_PASS;
  const from = process.env.DIMPRO_SMTP_FROM ?? process.env.SMTP_FROM ?? user;

  if (host && user && pass && from) {
    return {
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      auth: { user, pass },
      from,
    };
  }

  return loadSystemMailProfileFromFile();
}

function cleanEmailList(raw: string[] | string | undefined) {
  const values = Array.isArray(raw) ? raw : (raw ?? "").split(",");
  return values.map((item) => item.trim()).filter((item) => item.includes("@"));
}

function getMonitorRecipients() {
  const envRecipients = cleanEmailList(process.env.DIMPRO_SERVER_MONITOR_EMAIL_TO ?? process.env.DIMPRO_ADMIN_EMAIL ?? process.env.DIMPRO_MONITOR_EMAIL_TO ?? "");
  if (envRecipients.length > 0) return envRecipients;
  const parsed = loadMailProfilesConfigFromFile();
  return cleanEmailList(parsed?.testRecipients);
}

export function getServerMonitorConfig(): ServerMonitorConfig {
  const smtp = getSmtpConfig();
  const recipients = getMonitorRecipients();

  return {
    historyFile,
    cronLogFile,
    lastAlertFile,
    emailTestLogFile,
    emailEnabled: Boolean(smtp && recipients.length > 0),
    emailRecipients: recipients,
    smtpConfigured: Boolean(smtp),
    smtpHost: smtp?.host ?? process.env.DIMPRO_SMTP_HOST ?? process.env.SMTP_HOST ?? null,
    smtpPort: smtp?.port ?? null,
    smtpFromConfigured: Boolean(smtp?.from ?? process.env.DIMPRO_SMTP_FROM ?? process.env.SMTP_FROM ?? process.env.DIMPRO_SMTP_USER ?? process.env.SMTP_USER),
    monitoredHttpTargets: getMonitorHttpTargets(),
    alertRules: getServerMonitorAlertRules(),
    duplicateThrottleHours,
    envFileHint: "/root/dimprover/.env.local, PM2 ecosystem/env beállítás vagy /admin/email mentett mail-profil",
    requiredEnvVars: [
      "DIMPRO_SMTP_HOST",
      "DIMPRO_SMTP_PORT",
      "DIMPRO_SMTP_USER",
      "DIMPRO_SMTP_PASS",
      "DIMPRO_SMTP_FROM",
      "DIMPRO_SERVER_MONITOR_EMAIL_TO",
    ],
    recommendedCron: "7 */6 * * * /bin/bash /root/dimprover/scripts/run-server-monitor.sh",
  };
}

async function runCommand(command: string, args: string[] = [], timeout = 8_000): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: projectRoot,
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      ok: false,
      stdout: commandError.stdout?.toString() ?? "",
      stderr: commandError.stderr?.toString() ?? commandError.message,
    };
  }
}

async function runShell(script: string, timeout = 8_000) {
  return runCommand("/bin/bash", ["-lc", script], timeout);
}

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function levelRank(level: MonitorLevel) {
  if (level === "error") return 3;
  if (level === "warning") return 2;
  return 1;
}

function aggregateStatus(checks: MonitorCheckItem[]): MonitorLevel {
  if (checks.some((item) => item.status === "error")) return "error";
  if (checks.some((item) => item.status === "warning")) return "warning";
  return "ok";
}

function createCheck(id: string, label: string, status: MonitorLevel, value: string, detail: string): MonitorCheckItem {
  return {
    id,
    label,
    status,
    value,
    detail,
    checkedAt: new Date().toISOString(),
  };
}

function parseDisk(output: string): DiskInfo | null {
  const line = output.trim().split("\n")[1];
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const sizeKb = Number(parts[1]) || 0;
  const usedKb = Number(parts[2]) || 0;
  const availableKb = Number(parts[3]) || 0;
  const usePercent = Number(parts[4].replace("%", "")) || 0;
  return {
    usePercent,
    availableBytes: availableKb * 1024,
    sizeBytes: sizeKb * 1024,
    usedBytes: usedKb * 1024,
  };
}

function parseMemory(output: string): MemoryInfo | null {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const memLine = lines.find((line) => line.startsWith("Mem:"));
  const swapLine = lines.find((line) => line.startsWith("Swap:"));
  if (!memLine) return null;

  const memParts = memLine.split(/\s+/);
  const totalBytes = Number(memParts[1]) || os.totalmem();
  const rawUsedBytes = Number(memParts[2]) || Math.max(totalBytes - os.freemem(), 0);
  const availableBytes = Number(memParts[6]) || os.freemem();
  const effectiveUsedBytes = Math.max(totalBytes - availableBytes, 0);

  const swapParts = swapLine?.split(/\s+/) ?? [];
  const swapTotalBytes = Number(swapParts[1]) || 0;
  const swapUsedBytes = Number(swapParts[2]) || 0;

  return {
    totalBytes,
    availableBytes,
    usedBytes: rawUsedBytes,
    usagePercent: totalBytes ? Math.round((effectiveUsedBytes / totalBytes) * 100) : 0,
    swapTotalBytes,
    swapUsedBytes,
    swapUsagePercent: swapTotalBytes ? Math.round((swapUsedBytes / swapTotalBytes) * 100) : 0,
  };
}

function parsePm2(output: string) {
  try {
    const processes = JSON.parse(output) as Pm2Process[];
    const total = processes.length;
    const online = processes.filter((item) => item.pm2_env?.status === "online").length;
    const offlineNames = processes.filter((item) => item.pm2_env?.status !== "online").map((item) => item.name ?? "ismeretlen");
    return { total, online, offlineNames };
  } catch {
    return { total: 0, online: 0, offlineNames: ["PM2 JSON feldolgozási hiba"] };
  }
}

async function fetchStatus(url: string, method: "GET" | "HEAD" = "GET") {
  try {
    const response = await fetch(url, {
      method,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const text = method === "GET" ? await response.text() : "";
    return { ok: response.status >= 200 && response.status < 400, status: response.status, text, error: null as string | null };
  } catch (error) {
    return { ok: false, status: null, text: "", error: error instanceof Error ? error.message : "Ismeretlen HTTP hiba" };
  }
}

async function collectHttpChecks() {
  const checks: MonitorCheckItem[] = [];
  const httpStatuses: Record<string, number | null> = {};
  let homepageStatus: number | null = null;
  let cssStatus: number | null = null;

  for (const target of getMonitorHttpTargets()) {
    const result = await fetchStatus(target.url, target.method);
    httpStatuses[target.id] = result.status;
    if (target.id === "dimpro-homepage") homepageStatus = result.status;

    checks.push(createCheck(
      `${target.id}-http`,
      target.label,
      result.ok ? "ok" : "error",
      result.status === null ? "nincs válasz" : `HTTP ${result.status}`,
      result.error ?? `${target.url} · elvárt: ${target.expected}`,
    ));

    if (target.checkCss && result.ok) {
      const cssPath = result.text.match(/\/_next\/static\/[^"'\s>]+\.css/)?.[0] ?? null;
      if (!cssPath) {
        checks.push(createCheck(`${target.id}-css-link`, `${target.label} CSS hivatkozás`, "error", "nincs CSS link", "A HTML nem tartalmaz Next.js CSS hivatkozást."));
      } else {
        checks.push(createCheck(`${target.id}-css-link`, `${target.label} CSS hivatkozás`, "ok", cssPath, "A HTML tartalmaz Next.js CSS/static hivatkozást."));
        const cssUrl = new URL(cssPath, target.url).toString();
        const css = await fetchStatus(cssUrl, "HEAD");
        if (target.id === "dimpro-homepage") cssStatus = css.status;
        checks.push(createCheck(
          `${target.id}-css-asset`,
          `${target.label} CSS/static fájl`,
          css.ok ? "ok" : "error",
          css.status === null ? "nincs válasz" : `HTTP ${css.status}`,
          css.error ?? cssUrl,
        ));
      }
    }
  }

  return {
    checks,
    homepageStatus,
    cssStatus,
    httpStatuses,
  };
}

async function collectSystemChecks() {
  const checks: MonitorCheckItem[] = [];

  const [diskResult, memoryResult, pm2Result, nginxResult, staticResult] = await Promise.all([
    runCommand("df", ["-k", "/"]),
    runCommand("free", ["-b"]),
    runCommand("pm2", ["jlist"], 8_000),
    runCommand("nginx", ["-t"], 8_000),
    runShell("test -d .next/static && test -d .next/standalone/.next/static && test -f .next/standalone/.next/server/middleware-manifest.json && echo OK || echo MISSING; printf 'cssRoot='; find .next/static -type f -name '*.css' 2>/dev/null | wc -l; printf 'cssStandalone='; find .next/standalone/.next/static -type f -name '*.css' 2>/dev/null | wc -l", 8_000),
  ]);

  const disk = diskResult.ok ? parseDisk(diskResult.stdout) : null;
  if (!disk) {
    checks.push(createCheck("disk", "Tárhely állapot", "error", "nincs adat", diskResult.stderr || "df kimenet nem feldolgozható"));
  } else {
    const diskStatus: MonitorLevel = disk.usePercent >= 95 ? "error" : disk.usePercent >= 85 ? "warning" : "ok";
    checks.push(createCheck("disk", "Tárhely állapot", diskStatus, `${disk.usePercent}%`, `${formatBytes(disk.availableBytes)} szabad / ${formatBytes(disk.sizeBytes)} összesen.`));
  }

  const memory = memoryResult.ok ? parseMemory(memoryResult.stdout) : null;
  if (!memory) {
    checks.push(createCheck("memory", "Memória állapot", "error", "nincs adat", memoryResult.stderr || "free kimenet nem feldolgozható"));
  } else {
    const memoryStatus: MonitorLevel = memory.usagePercent >= 90 ? "error" : memory.usagePercent >= 80 ? "warning" : "ok";
    checks.push(createCheck("memory", "Memória állapot", memoryStatus, `${memory.usagePercent}%`, `${formatBytes(memory.availableBytes)} elérhető / ${formatBytes(memory.totalBytes)} összesen.`));
    const swapStatus: MonitorLevel = memory.swapUsagePercent >= 75 ? "warning" : "ok";
    checks.push(createCheck("swap", "Swap állapot", swapStatus, `${memory.swapUsagePercent}%`, `${formatBytes(memory.swapUsedBytes)} használatban / ${formatBytes(memory.swapTotalBytes)} összesen.`));
  }

  const pm2 = pm2Result.ok ? parsePm2(pm2Result.stdout) : { total: 0, online: 0, offlineNames: [pm2Result.stderr || "PM2 lekérési hiba"] };
  const pm2Status: MonitorLevel = pm2.total > 0 && pm2.online === pm2.total ? "ok" : "error";
  checks.push(createCheck("pm2", "PM2 folyamatok", pm2Status, `${pm2.online}/${pm2.total} online`, pm2.offlineNames.length ? `Nem online: ${pm2.offlineNames.join(", ")}` : "Minden PM2 folyamat online."));

  checks.push(createCheck(
    "nginx-config",
    "Nginx konfiguráció",
    nginxResult.ok ? "ok" : "error",
    nginxResult.ok ? "rendben" : "hiba",
    nginxResult.ok ? "nginx -t sikeresen lefutott." : nginxResult.stderr || "nginx -t hibát jelzett.",
  ));

  const staticOutput = staticResult.stdout.trim();
  const staticMissing = !staticOutput.startsWith("OK");
  const rootCssCount = Number(staticOutput.match(/cssRoot=(\d+)/)?.[1] ?? 0);
  const standaloneCssCount = Number(staticOutput.match(/cssStandalone=(\d+)/)?.[1] ?? 0);
  const staticStatus: MonitorLevel = staticMissing || rootCssCount === 0 || standaloneCssCount === 0 ? "error" : "ok";
  checks.push(createCheck(
    "next-static-integrity",
    "Next.js standalone/static integritás",
    staticStatus,
    staticStatus === "ok" ? "rendben" : "hiányos",
    `Root CSS: ${rootCssCount} db, standalone CSS: ${standaloneCssCount} db. ${staticMissing ? "Hiányzik valamelyik kritikus .next/standalone fájl vagy mappa." : "A kritikus static/manifest elemek megvannak."}`,
  ));

  return {
    checks,
    disk,
    memory,
    pm2,
  };
}

async function ensureMonitorDir() {
  await fs.mkdir(monitorDir, { recursive: true });
}

async function appendHistory(run: ServerMonitorRun) {
  await ensureMonitorDir();
  await fs.appendFile(historyFile, `${JSON.stringify(run)}\n`, "utf8");
  try {
    const content = await fs.readFile(historyFile, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > maxHistoryLines) {
      await fs.writeFile(historyFile, `${lines.slice(-maxHistoryLines).join("\n")}\n`, "utf8");
    }
  } catch {
    // A history fájl ritkítása nem kritikus.
  }
}

function getSmtpFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("not on the whitelist") || lower.includes("recipient rejected")) {
    return [
      "A DotRoll SMTP szerver elutasította a küldést. Valószínűleg a VPS IP-címet külön SMTP whitelist / relay engedélyezési listára kell felvenni.",
      "Ellenőrizendő VPS IP: 213.160.68.24.",
      "A Thunderbirdes sikeres küldés csak azt igazolja, hogy a postafiók és a jelszó jó; a VPS-ről történő szerveres küldéshez külön DotRoll engedélyezés kellhet.",
    ].join(" ");
  }

  if (lower.includes("authentication") || lower.includes("invalid login") || lower.includes("auth")) {
    return "SMTP hitelesítési hiba. Ellenőrizd a teljes e-mail címet, a postafiók jelszavát és hogy a jelszó mentve lett-e a DIMPRO e-mail beállításoknál.";
  }

  if (lower.includes("econnrefused") || lower.includes("etimedout") || lower.includes("timeout") || lower.includes("enotfound")) {
    return "SMTP kapcsolódási hiba. Ellenőrizd az SMTP hostot, portot, SSL/TLS beállítást és hogy a VPS eléri-e a levelezőszervert.";
  }

  if (lower.includes("self signed") || lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
    return "SSL/TLS kapcsolati hiba. Ellenőrizd, hogy 465 portnál be van-e kapcsolva az SSL/TLS, illetve 587 portnál a szolgáltató milyen titkosítást vár.";
  }

  return "Ismeretlen SMTP küldési hiba. A részletes technikai hibaüzenet alapján kell tovább vizsgálni a levelezőszerver vagy a DIMPRO SMTP beállítását.";
}

async function sendMailWithSmtp(options: { to: string[]; subject: string; text: string; html: string }) {
  const smtp = getSmtpConfig();
  if (!smtp) throw new Error("Nincs teljes SMTP beállítás.");
  if (options.to.length === 0) throw new Error("Nincs e-mail címzett beállítva.");

  const nodemailer = require("nodemailer") as NodemailerModule;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });
  await transporter.sendMail({
    from: smtp.from,
    to: options.to.join(","),
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

async function appendEmailTestHistory(result: ServerMonitorEmailTestResult) {
  await ensureMonitorDir();
  await fs.appendFile(emailTestLogFile, `${JSON.stringify(result)}\n`, "utf8");
  try {
    const content = await fs.readFile(emailTestLogFile, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > 200) {
      await fs.writeFile(emailTestLogFile, `${lines.slice(-200).join("\n")}\n`, "utf8");
    }
  } catch {
    // A teszt e-mail napló ritkítása nem kritikus.
  }
}

export async function loadServerMonitorEmailTestHistory(limit = 30): Promise<ServerMonitorEmailTestResult[]> {
  try {
    const content = await fs.readFile(emailTestLogFile, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as ServerMonitorEmailTestResult)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function sendServerMonitorTestEmail(): Promise<ServerMonitorEmailTestResult> {
  const createdAt = new Date().toISOString();
  const smtp = getSmtpConfig();
  const to = getMonitorRecipients();
  const base: ServerMonitorEmailTestResult = {
    id: `mailtest_${createdAt.replaceAll("-", "").replaceAll(":", "").replaceAll(".", "").replaceAll("T", "").replaceAll("Z", "")}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    attempted: false,
    sent: false,
    reason: "",
    to,
    smtpConfigured: Boolean(smtp),
  };

  if (!smtp) {
    const result = { ...base, reason: "Nincs teljes SMTP beállítás, ezért a teszt e-mail nem indult el." };
    await appendEmailTestHistory(result);
    return result;
  }
  if (to.length === 0) {
    const result = { ...base, reason: "Nincs monitor e-mail címzett beállítva." };
    await appendEmailTestHistory(result);
    return result;
  }

  const subject = "DIMPRO Szerverőr teszt e-mail";
  const text = [
    "DIMPRO Szerverőr teszt e-mail",
    "",
    "Ez egy kézi tesztüzenet a DIMPROVER Szerverőr felületéről.",
    `Időpont: ${createdAt}`,
    `Szerver: ${os.hostname()}`,
    "",
    "Ha ezt megkaptad, az SMTP küldés működik.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 12px;color:#0891b2">DIMPRO Szerverőr teszt e-mail</h2>
      <p>Ez egy kézi tesztüzenet a DIMPROVER Szerverőr felületéről.</p>
      <p><strong>Időpont:</strong> ${createdAt}</p>
      <p><strong>Szerver:</strong> ${os.hostname()}</p>
      <p style="color:#64748b">Ha ezt megkaptad, az SMTP küldés működik.</p>
    </div>
  `;

  try {
    await sendMailWithSmtp({ to, subject, text, html });
    const result = { ...base, attempted: true, sent: true, reason: "Teszt e-mail sikeresen elküldve." };
    await appendEmailTestHistory(result);
    return result;
  } catch (error) {
    const result = {
      ...base,
      attempted: true,
      sent: false,
      reason: "Teszt e-mail küldési hiba.",
      error: error instanceof Error ? error.message : "Ismeretlen SMTP hiba",
      friendlyError: getSmtpFriendlyError(error),
    };
    await appendEmailTestHistory(result);
    return result;
  }
}

export async function loadServerMonitorHistory(limit = 80): Promise<ServerMonitorRun[]> {
  try {
    const content = await fs.readFile(historyFile, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as ServerMonitorRun)
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  } catch {
    return [];
  }
}

function createFingerprint(run: Omit<ServerMonitorRun, "notification">) {
  return run.checks
    .filter((item) => item.status !== "ok")
    .map((item) => `${item.id}:${item.status}:${item.value}`)
    .sort()
    .join("|");
}

async function sendMonitorAlert(run: Omit<ServerMonitorRun, "notification">): Promise<MonitorNotification> {
  const smtp = getSmtpConfig();
  const to = getMonitorRecipients();

  if (run.status === "ok") return { attempted: false, sent: false, reason: "Nincs hiba, ezért nem kell e-mail.", to };
  if (!smtp) return { attempted: false, sent: false, reason: "Nincs SMTP beállítva.", to };
  if (to.length === 0) return { attempted: false, sent: false, reason: "Nincs monitor címzett beállítva.", to };

  const fingerprint = createFingerprint(run);
  try {
    const lastRaw = await fs.readFile(lastAlertFile, "utf8");
    const last = JSON.parse(lastRaw) as { fingerprint?: string; sentAt?: string };
    const lastSentAt = last.sentAt ? Date.parse(last.sentAt) : 0;
    if (last.fingerprint === fingerprint && Date.now() - lastSentAt < duplicateThrottleHours * 60 * 60 * 1000) {
      return { attempted: false, sent: false, reason: `Ugyanez a hiba már ki lett küldve az elmúlt ${duplicateThrottleHours} órában.`, to };
    }
  } catch {
    // Nincs korábbi alert állapot.
  }

  const failing = run.checks.filter((item) => item.status !== "ok");
  const subject = run.status === "error" ? "DIMPRO szerverhiba figyelmeztetés" : "DIMPRO szerver warning figyelmeztetés";
  const text = [
    `${subject}`,
    "",
    `Állapot: ${run.label}`,
    `Időpont: ${run.collectedAt}`,
    `Szerver: ${run.hostname}`,
    "",
    ...failing.map((item) => `- ${item.label}: ${item.value} (${item.detail})`),
    "",
    "DIMPRO automatikus szerverállapot figyelő",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a">
      <h2 style="margin:0 0 12px;color:${run.status === "error" ? "#dc2626" : "#d97706"}">${subject}</h2>
      <p><strong>Állapot:</strong> ${run.label}</p>
      <p><strong>Időpont:</strong> ${run.collectedAt}</p>
      <p><strong>Szerver:</strong> ${run.hostname}</p>
      <ul>${failing.map((item) => `<li><strong>${item.label}:</strong> ${item.value}<br><span style="color:#475569">${item.detail}</span></li>`).join("")}</ul>
      <p style="color:#64748b">DIMPRO automatikus szerverállapot figyelő</p>
    </div>
  `;

  try {
    await sendMailWithSmtp({ to, subject, text, html });
    await ensureMonitorDir();
    await fs.writeFile(lastAlertFile, JSON.stringify({ fingerprint, sentAt: new Date().toISOString() }, null, 2), "utf8");
    return { attempted: true, sent: true, reason: "Figyelmeztető e-mail elküldve.", to };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      reason: "E-mail küldési hiba.",
      to,
      error: error instanceof Error ? error.message : "Ismeretlen SMTP hiba",
      friendlyError: getSmtpFriendlyError(error),
    };
  }
}

export async function runServerMonitor(source: ServerMonitorRun["source"] = "manual"): Promise<ServerMonitorRun> {
  const startedAt = Date.now();
  const [httpChecks, systemChecks] = await Promise.all([collectHttpChecks(), collectSystemChecks()]);
  const checks = [...httpChecks.checks, ...systemChecks.checks].sort((a, b) => levelRank(b.status) - levelRank(a.status));
  const status = aggregateStatus(checks);
  const label = status === "ok" ? "Minden ellenőrzés rendben" : status === "warning" ? "Figyelmeztetés van a szerveren" : "Kritikus szerverhiba vagy elérési hiba";

  const runWithoutNotification = {
    id: `mon_${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "").replaceAll("T", "").replaceAll("Z", "")}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    status,
    label,
    collectedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    hostname: os.hostname(),
    checks,
    metrics: {
      diskUsePercent: systemChecks.disk?.usePercent ?? null,
      diskAvailableBytes: systemChecks.disk?.availableBytes ?? null,
      memoryUsagePercent: systemChecks.memory?.usagePercent ?? null,
      memoryAvailableBytes: systemChecks.memory?.availableBytes ?? null,
      swapUsagePercent: systemChecks.memory?.swapUsagePercent ?? null,
      loadAverage1m: os.loadavg()[0] ?? 0,
      pm2OnlineCount: systemChecks.pm2.online,
      pm2TotalCount: systemChecks.pm2.total,
      homepageStatus: httpChecks.homepageStatus,
      cssStatus: httpChecks.cssStatus,
      httpStatuses: httpChecks.httpStatuses,
    },
  } satisfies Omit<ServerMonitorRun, "notification">;

  const notification = await sendMonitorAlert(runWithoutNotification);
  const run: ServerMonitorRun = { ...runWithoutNotification, durationMs: Date.now() - startedAt, notification };
  await appendHistory(run);
  return run;
}

export async function getServerMonitorResponse(limit = 80): Promise<ServerMonitorResponse> {
  const [history, emailTests] = await Promise.all([
    loadServerMonitorHistory(limit),
    loadServerMonitorEmailTestHistory(30),
  ]);
  return {
    ok: true,
    config: getServerMonitorConfig(),
    latest: history[0] ?? null,
    history,
    emailTests,
  };
}
