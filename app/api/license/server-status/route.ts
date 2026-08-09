import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

type DiskStatus = {
  filesystem: string;
  sizeKb: number;
  usedKb: number;
  availableKb: number;
  usePercent: number;
  mountedOn: string;
};

type MemoryStatus = {
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

type StatusLevel = "ok" | "warning" | "error" | "info";

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

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a szerverállapot API használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

async function runCommand(command: string, args: string[] = [], timeout = 5_000): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: process.cwd(),
      timeout,
      maxBuffer: 1024 * 1024,
    });

    return {
      ok: true,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (error) {
    const commandError = error as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      ok: false,
      stdout: commandError.stdout?.toString() ?? "",
      stderr: commandError.stderr?.toString() ?? commandError.message,
    };
  }
}

async function runShell(script: string, timeout = 8_000): Promise<CommandResult> {
  return runCommand("/bin/bash", ["-lc", script], timeout);
}

function emptyCommandResult(): Promise<CommandResult> {
  return Promise.resolve({ ok: true, stdout: "", stderr: "" });
}

function numberOrZero(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDiskStatus(output: string): DiskStatus | null {
  const line = output.trim().split("\n")[1];
  if (!line) return null;

  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;

  return {
    filesystem: parts[0],
    sizeKb: Number(parts[1]) || 0,
    usedKb: Number(parts[2]) || 0,
    availableKb: Number(parts[3]) || 0,
    usePercent: Number(parts[4].replace("%", "")) || 0,
    mountedOn: parts[5],
  };
}

function parseMemoryStatus(output: string): MemoryStatus {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const memLine = lines.find((line) => line.startsWith("Mem:"));
  const swapLine = lines.find((line) => line.startsWith("Swap:"));

  const fallbackTotal = os.totalmem();
  const fallbackFree = os.freemem();

  if (!memLine) {
    const fallbackUsed = fallbackTotal - fallbackFree;
    return {
      totalBytes: fallbackTotal,
      freeBytes: fallbackFree,
      usedBytes: fallbackUsed,
      availableBytes: fallbackFree,
      buffCacheBytes: 0,
      usagePercent: fallbackTotal ? Math.round((fallbackUsed / fallbackTotal) * 100) : 0,
      rawUsedPercent: fallbackTotal ? Math.round((fallbackUsed / fallbackTotal) * 100) : 0,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
      swapFreeBytes: 0,
      swapUsagePercent: 0,
    };
  }

  const memParts = memLine.split(/\s+/);
  const totalBytes = numberOrZero(memParts[1]) || fallbackTotal;
  const usedBytes = numberOrZero(memParts[2]);
  const freeBytes = numberOrZero(memParts[3]) || fallbackFree;
  const buffCacheBytes = numberOrZero(memParts[5]);
  const availableBytes = numberOrZero(memParts[6]) || freeBytes;
  const effectiveUsedBytes = Math.max(totalBytes - availableBytes, 0);

  const swapParts = swapLine?.split(/\s+/) ?? [];
  const swapTotalBytes = numberOrZero(swapParts[1]);
  const swapUsedBytes = numberOrZero(swapParts[2]);
  const swapFreeBytes = numberOrZero(swapParts[3]);

  return {
    totalBytes,
    freeBytes,
    usedBytes,
    availableBytes,
    buffCacheBytes,
    usagePercent: totalBytes ? Math.round((effectiveUsedBytes / totalBytes) * 100) : 0,
    rawUsedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
    swapTotalBytes,
    swapUsedBytes,
    swapFreeBytes,
    swapUsagePercent: swapTotalBytes ? Math.round((swapUsedBytes / swapTotalBytes) * 100) : 0,
  };
}

function parsePm2Processes(output: string): Pm2Process[] {
  try {
    const rawProcesses = JSON.parse(output) as Array<{
      name?: string;
      monit?: { cpu?: number; memory?: number };
      pm2_env?: {
        status?: string;
        restart_time?: number;
        pm_uptime?: number;
        watch?: boolean;
      };
    }>;

    return rawProcesses.map((processItem) => ({
      name: processItem.name ?? "ismeretlen",
      status: processItem.pm2_env?.status ?? "unknown",
      cpuPercent: Number(processItem.monit?.cpu ?? 0),
      memoryBytes: Number(processItem.monit?.memory ?? 0),
      restarts: Number(processItem.pm2_env?.restart_time ?? 0),
      uptimeMs: processItem.pm2_env?.pm_uptime ? Date.now() - processItem.pm2_env.pm_uptime : null,
      watching: Boolean(processItem.pm2_env?.watch),
    }));
  } catch {
    return [];
  }
}

function parseGitStatus(output: string) {
  const lines = output.split("\n").filter(Boolean);
  return {
    changedCount: lines.filter((line) => !line.startsWith("??")).length,
    untrackedCount: lines.filter((line) => line.startsWith("??")).length,
    totalCount: lines.length,
  };
}

function parseDuList(output: string, diskSizeKb?: number): StorageItem[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sizeRaw, ...pathParts] = line.split(/\s+/);
      const path = pathParts.join(" ");
      const sizeKb = Number(sizeRaw) || 0;
      const cleanPath = path || "-";
      return {
        name: cleanPath.split("/").filter(Boolean).at(-1) ?? cleanPath,
        path: cleanPath,
        sizeBytes: sizeKb * 1024,
        sizeKb,
        percentOfDisk: diskSizeKb ? Math.round((sizeKb / diskSizeKb) * 1000) / 10 : null,
      };
    });
}

function parseFileSizeList(output: string, diskSizeKb?: number): StorageItem[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sizeRaw, ...pathParts] = line.split(/\s+/);
      const path = pathParts.join(" ");
      const sizeBytes = Number(sizeRaw) || 0;
      const sizeKb = Math.round(sizeBytes / 1024);
      const cleanPath = path || "-";
      return {
        name: cleanPath.split("/").filter(Boolean).at(-1) ?? cleanPath,
        path: cleanPath,
        sizeBytes,
        sizeKb,
        percentOfDisk: diskSizeKb ? Math.round((sizeKb / diskSizeKb) * 1000) / 10 : null,
      };
    });
}

function createFolderSizeGroup(label: string, rootPath: string, output: string, diskSizeKb: number | undefined, note: string): FolderSizeGroup {
  const allItems = parseDuList(output, diskSizeKb);
  const rootItem = allItems.find((item) => item.path === rootPath);
  const items = allItems
    .filter((item) => item.path !== rootPath)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    label,
    path: rootPath,
    totalSizeBytes: rootItem?.sizeBytes ?? items.reduce((sum, item) => sum + item.sizeBytes, 0),
    items,
    note,
  };
}

function parseSwapProcesses(output: string): SwapProcess[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [swapKbRaw, pidRaw, nameRaw, ...commandParts] = line.split("\t");
      return {
        pid: Number(pidRaw) || 0,
        name: nameRaw || "-",
        swapBytes: (Number(swapKbRaw) || 0) * 1024,
        command: commandParts.join(" ") || nameRaw || "-",
      };
    })
    .filter((item) => item.pid > 0 && item.swapBytes > 0);
}

function parseMemoryProcesses(output: string): TopMemoryProcess[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const pid = Number(parts[0]) || 0;
      const memoryPercent = Number(parts[1]) || 0;
      const cpuPercent = Number(parts[2]) || 0;
      const rssKb = Number(parts[3]) || 0;
      const command = parts.slice(4).join(" ") || "-";

      return {
        pid,
        memoryPercent,
        cpuPercent,
        rssBytes: rssKb * 1024,
        command,
      };
    })
    .filter((item) => item.pid > 0);
}

function storageCategoryFromList(label: string, path: string, items: StorageItem[], note: string): StorageCategory {
  const found = items.find((item) => item.path === path);
  return {
    label,
    path,
    sizeBytes: found?.sizeBytes ?? 0,
    note,
  };
}

function zipCategory(totalOutput: string): StorageCategory {
  const sizeBytes = Number(totalOutput.trim()) || 0;
  return {
    label: "Projektgyökérben lévő ZIP csomagok",
    path: "/root/dimprover/*.zip",
    sizeBytes,
    note: "Verziócsomagok és átadási ZIP-ek. Sok kis-közepes ZIP együtt jelentős helyet foglalhat.",
  };
}

function explainLintCause(rule: string, message: string) {
  if (rule === "@typescript-eslint/no-unused-vars") return "Nem használt változó, import, függvény vagy paraméter maradt a kódban. Tisztítás vagy későbbi bekötés szükséges.";
  if (rule === "react-hooks/exhaustive-deps") return "React hook függőségi lista hiányos vagy felesleges elemet tartalmaz. Emiatt elavult állapot vagy felesleges újrafutás lehet.";
  if (rule === "@next/next/no-img-element") return "Sima <img> elem van használatban Next.js Image komponens helyett. Ez teljesítmény/LCP optimalizálási figyelmeztetés.";
  if (rule === "no-console") return "Console hívás maradt a kódban. Éles felületen zajt vagy adatvédelmi kockázatot okozhat.";
  if (rule === "prefer-const") return "Olyan változó lett let-ként deklarálva, amelyet nem írunk újra. Kódtisztasági figyelmeztetés.";
  if (message.toLowerCase().includes("defined but never used")) return "Deklarált elem nincs használatban. Általában félbehagyott fejlesztés, régi import vagy későbbre előkészített kódrészlet.";
  if (message.toLowerCase().includes("missing dependency")) return "React useEffect/useCallback/useMemo függőségi lista nincs összhangban a használt változókkal.";
  if (message.toLowerCase().includes("using `<img>`")) return "Next.js teljesítményfigyelmeztetés képek optimalizálása miatt.";
  return "ESLint által jelzett kódminőségi vagy karbantarthatósági figyelmeztetés. A pontos ok a rule és az üzenet alapján ellenőrizhető.";
}

function parseLintJson(output: string): CodeWarningsSummary {
  try {
    const reports = JSON.parse(output) as Array<{
      filePath?: string;
      messages?: Array<{
        ruleId?: string | null;
        severity?: number;
        message?: string;
        line?: number;
        column?: number;
      }>;
    }>;

    const items = reports.flatMap((report) => {
      const filePath = report.filePath ?? "-";
      const relativeFile = filePath.startsWith(process.cwd()) ? filePath.slice(process.cwd().length + 1) : filePath;
      return (report.messages ?? []).map((item) => {
        const rule = item.ruleId ?? "ismeretlen-rule";
        const message = item.message ?? "Nincs üzenet.";
        return {
          file: relativeFile,
          line: item.line ?? 0,
          column: item.column ?? 0,
          rule,
          message,
          cause: explainLintCause(rule, message),
          severity: item.severity === 2 ? "error" as const : "warning" as const,
        };
      });
    });

    const errorCount = items.filter((item) => item.severity === "error").length;
    const warningCount = items.filter((item) => item.severity === "warning").length;

    return {
      checked: true,
      ok: errorCount === 0,
      warningCount,
      errorCount,
      totalCount: items.length,
      collectedAt: new Date().toISOString(),
      message: items.length === 0 ? "Nincs ESLint warning vagy error." : `${items.length} ESLint jelzés található.`,
      items,
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      warningCount: 0,
      errorCount: 1,
      totalCount: 1,
      collectedAt: new Date().toISOString(),
      message: `Nem sikerült feldolgozni az ESLint JSON kimenetet: ${error instanceof Error ? error.message : "ismeretlen hiba"}`,
      items: [],
    };
  }
}

async function collectCodeWarnings(includeWarnings: boolean): Promise<CodeWarningsSummary> {
  if (!includeWarnings) {
    return {
      checked: false,
      ok: true,
      warningCount: 0,
      errorCount: 0,
      totalCount: 0,
      collectedAt: null,
      message: "A fejlesztői warning lista külön gombbal kérhető le, hogy az automatikus szerverfrissítés ne futtasson teljes lint ellenőrzést.",
      items: [],
    };
  }

  const result = await runCommand("npx", ["eslint", "--format", "json"], 60_000);
  const output = result.stdout || result.stderr;
  if (!output.trim()) {
    return {
      checked: true,
      ok: result.ok,
      warningCount: 0,
      errorCount: result.ok ? 0 : 1,
      totalCount: result.ok ? 0 : 1,
      collectedAt: new Date().toISOString(),
      message: result.ok ? "Nincs ESLint warning vagy error." : "Az ESLint nem adott feldolgozható kimenetet.",
      items: [],
    };
  }

  return parseLintJson(output);
}

function parseBackupStatus(output: string): BackupStatus {
  if (!output.trim()) {
    return {
      status: "info",
      message: "Backup állapot nincs lekérve. Az Üzemeltetés fülön külön frissíthető.",
      totalCount: 0,
      hourlyCount: 0,
      dailyCount: 0,
      weeklyCount: 0,
      zeroByteCount: 0,
      suspiciousLargeCount: 0,
      latestPath: null,
      latestSizeBytes: 0,
      items: [],
    };
  }

  const rows = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sizeRaw, dateRaw, ...pathParts] = line.split("\t");
      return {
        sizeBytes: Number(sizeRaw) || 0,
        dateRaw: dateRaw || "",
        path: pathParts.join("\t") || "-",
      };
    });

  const hourlyCount = rows.filter((item) => /\/backups\/[^/]+\.tar\.gz$/.test(item.path)).length;
  const dailyCount = rows.filter((item) => item.path.includes("/daily/")).length;
  const weeklyCount = rows.filter((item) => item.path.includes("/weekly/")).length;
  const zeroByteCount = rows.filter((item) => item.sizeBytes === 0).length;
  const suspiciousLargeCount = rows.filter((item) => item.sizeBytes > 700 * 1024 * 1024).length;
  const latest = [...rows].sort((a, b) => b.dateRaw.localeCompare(a.dateRaw))[0];

  const items: DiagnosticItem[] = [
    { label: "Összes backup archív", status: rows.length > 0 ? "ok" : "warning", value: `${rows.length} db`, detail: "Fő és dev backup archívok együtt." },
    { label: "Óránkénti mentések", status: hourlyCount <= 14 ? "ok" : "warning", value: `${hourlyCount} db`, detail: "A lokális retention miatt ez korlátozott számú kell legyen." },
    { label: "Napi mentések", status: dailyCount <= 14 ? "ok" : "warning", value: `${dailyCount} db`, detail: "Napi visszaállítási pontok." },
    { label: "Heti mentések", status: weeklyCount <= 8 ? "ok" : "warning", value: `${weeklyCount} db`, detail: "Heti visszaállítási pontok." },
    { label: "0 bájtos backup", status: zeroByteCount === 0 ? "ok" : "error", value: `${zeroByteCount} db`, detail: "Félbeszakadt vagy hibás mentésre utalhat." },
    { label: "700 MB feletti gyanús backup", status: suspiciousLargeCount === 0 ? "ok" : "warning", value: `${suspiciousLargeCount} db`, detail: "Korábban ilyenek okozták a tárhelytelítődést." },
  ];

  const status: StatusLevel = zeroByteCount > 0 ? "error" : suspiciousLargeCount > 0 || rows.length === 0 ? "warning" : "ok";
  return {
    status,
    message: status === "ok" ? "Backup állapot rendben." : "Backup figyelmet igényel.",
    totalCount: rows.length,
    hourlyCount,
    dailyCount,
    weeklyCount,
    zeroByteCount,
    suspiciousLargeCount,
    latestPath: latest?.path ?? null,
    latestSizeBytes: latest?.sizeBytes ?? 0,
    items,
  };
}

function parseDomainRoutes(output: string): DomainRoute[] {
  const routes: DomainRoute[] = [];
  let currentServerName = "-";
  let currentFile = "-";

  output.split("\n").forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine) return;
    const [filePart, , ...rest] = cleanLine.split(":");
    const content = rest.join(":").trim();
    if (filePart) currentFile = filePart.replace("/etc/nginx/sites-enabled/", "");
    if (content.includes("server_name")) {
      currentServerName = content.replace(/server_name\s+/, "").replace(/;/g, "").trim();
    }
    if (content.includes("proxy_pass")) {
      const proxyPass = content.replace(/proxy_pass\s+/, "").replace(/;/g, "").trim();
      routes.push({
        file: currentFile,
        serverName: currentServerName,
        proxyPass,
        note: proxyPass.includes("3000") ? "Fő DIMPROVER app" : proxyPass.includes("3001") ? "DIMPROVER dev app" : proxyPass.includes("3002") ? "DIMPRO Árutér app" : "Egyéb proxy cél",
      });
    }
  });

  return routes;
}

function parseSslCertificates(output: string): SslCertificate[] {
  const now = Date.now();
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, endDateRaw, sanRaw = ""] = line.split("\t");
      const expiresTime = Date.parse(endDateRaw || "");
      const daysRemaining = Number.isFinite(expiresTime) ? Math.ceil((expiresTime - now) / 86_400_000) : null;
      const domains = sanRaw
        .split(/DNS:/)
        .slice(1)
        .map((item) => item.split(/[,\s]/)[0]?.trim())
        .filter(Boolean);
      const status: StatusLevel = daysRemaining === null ? "warning" : daysRemaining < 14 ? "error" : daysRemaining < 30 ? "warning" : "ok";
      return {
        name: name || "-",
        domains,
        expiresAt: Number.isFinite(expiresTime) ? new Date(expiresTime).toISOString() : null,
        daysRemaining,
        status,
      };
    });
}

function parseLogSummaries(output: string): LogSummaryItem[] {
  const blocks = output.split("__FILE__").map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const path = lines.shift()?.trim() || "-";
    const relevantLines = lines.filter(Boolean).slice(-80);
    const errorLines = relevantLines.filter((line) => /error|exception|failed|fatal/i.test(line));
    const warningLines = relevantLines.filter((line) => /warn|warning/i.test(line));
    const label = path.includes("nginx") ? "Nginx error log" : path.includes("backup") ? "Backup log" : path.includes(".pm2") ? "PM2 error log" : "Rendszer log";
    const status: StatusLevel = errorLines.length > 0 ? "warning" : "ok";
    return {
      label,
      path,
      errorCount: errorLines.length,
      warningCount: warningLines.length,
      lastMessages: [...errorLines, ...warningLines].slice(-5),
      status,
    };
  });
}

function parseReleaseStorage(output: string, diskSizeKb?: number): ReleaseStorage {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const totalLine = lines.find((line) => line.startsWith("TOTAL\t"));
  const countLine = lines.find((line) => line.startsWith("COUNT\t"));
  const expiredLine = lines.find((line) => line.startsWith("EXPIRED\t"));
  const fileLines = lines.filter((line) => line.startsWith("FILE\t"));
  const largestFiles = fileLines.map((line) => {
    const [, sizeRaw, filePath] = line.split("\t");
    const sizeBytes = Number(sizeRaw) || 0;
    const sizeKb = Math.round(sizeBytes / 1024);
    return {
      name: filePath?.split("/").filter(Boolean).at(-1) ?? "-",
      path: filePath ?? "-",
      sizeBytes,
      sizeKb,
      percentOfDisk: diskSizeKb ? Math.round((sizeKb / diskSizeKb) * 1000) / 10 : null,
    };
  });
  const totalBytes = Number(totalLine?.split("\t")[1] ?? 0) || 0;
  const fileCount = Number(countLine?.split("\t")[1] ?? 0) || 0;
  const expiredCount = Number(expiredLine?.split("\t")[1] ?? 0) || 0;
  return {
    totalBytes,
    fileCount,
    expiredCount,
    largestFiles,
    status: expiredCount > 0 || totalBytes > 2 * 1024 * 1024 * 1024 ? "warning" : "ok",
  };
}

function parseSecurityChecks(output: string): SecurityCheck[] {
  const values = new Map(output.split("\n").map((line) => {
    const [key, ...rest] = line.trim().split("\t");
    return [key, rest.join("\t")];
  }));
  const adminPerm = values.get("adminPerm") || "missing";
  const publicEnv = values.get("publicEnv") === "yes";
  const publicGit = values.get("publicGit") === "yes";
  const hiddenDeny = values.get("hiddenDeny") === "yes";
  const releasePublic = values.get("releasePublic") === "yes";
  const devBasicAuth = values.get("devBasicAuth") === "yes";

  return [
    { label: "Admin kulcs jogosultság", status: adminPerm === "600" ? "ok" : "warning", detail: `Aktuális jogosultság: ${adminPerm}. Javasolt: 600.` },
    { label: "Public .env ellenőrzés", status: publicEnv ? "error" : "ok", detail: publicEnv ? "Public mappában .env jellegű fájl található." : "Nem látható public .env fájl." },
    { label: "Public .git ellenőrzés", status: publicGit ? "error" : "ok", detail: publicGit ? "Public mappában .git található." : "Nem látható public .git mappa." },
    { label: "Rejtett fájlok Nginx tiltása", status: hiddenDeny ? "ok" : "warning", detail: hiddenDeny ? "Nginx configban található rejtett fájl tiltás." : "Nem látszik egyértelmű rejtett fájl tiltás az aktív Nginx site-okban." },
    { label: "Release csomagok public helyen", status: releasePublic ? "warning" : "ok", detail: releasePublic ? "Van ZIP/7Z a public mappa alatt." : "A release csomagok nem public mappában vannak." },
    { label: "Dev domain extra védelem", status: devBasicAuth ? "ok" : "warning", detail: devBasicAuth ? "A dev site basic auth védelemmel is rendelkezik." : "A dev domain jelenleg app-login védelemre támaszkodik; később Nginx basic auth / IP védelem javasolt." },
  ];
}

function createCleanupSuggestions(params: {
  backup: BackupStatus;
  rootDirectories: StorageItem[];
  projectFiles: StorageItem[];
  release: ReleaseStorage;
}): CleanupSuggestion[] {
  const npmCache = params.rootDirectories.find((item) => item.path === "/root/.npm");
  const vscodeServer = params.rootDirectories.find((item) => item.path === "/root/.vscode-server");
  const rootZipBytes = params.projectFiles.filter((item) => item.name.endsWith(".zip")).reduce((sum, item) => sum + item.sizeBytes, 0);

  return [
    { label: "Hibás backup archívok", status: params.backup.zeroByteCount > 0 || params.backup.suspiciousLargeCount > 0 ? "warning" : "ok", potentialBytes: 0, reason: `${params.backup.zeroByteCount} db 0 bájtos és ${params.backup.suspiciousLargeCount} db 700 MB feletti backup.`, action: "Csak ellenőrzés után törölhető. A retention már védi az új mentéseket." },
    { label: "Projektgyökér ZIP csomagok", status: rootZipBytes > 500 * 1024 * 1024 ? "warning" : "info", potentialBytes: rootZipBytes, reason: "A régi ZIP fejlesztési csomagok idővel újra megtölthetik a VPS-t.", action: "Régi csomagok áthelyezése privát release tárhelyre vagy külső backupra." },
    { label: "NPM cache", status: npmCache && npmCache.sizeBytes > 1024 * 1024 * 1024 ? "warning" : "info", potentialBytes: npmCache?.sizeBytes ?? 0, reason: "Az npm cache regenerálható, de törlés után az npm telepítések lassabbak lehetnek.", action: "Szükség esetén npm cache clean --force, csak külön jóváhagyással." },
    { label: "VS Code server cache", status: vscodeServer && vscodeServer.sizeBytes > 2 * 1024 * 1024 * 1024 ? "warning" : "info", potentialBytes: vscodeServer?.sizeBytes ?? 0, reason: "Régi VS Code remote server verziók foglalhatnak helyet.", action: "Régi VS Code server almappák kézi ellenőrzése." },
    { label: "Lejárt release csomagok", status: params.release.expiredCount > 0 ? "warning" : "ok", potentialBytes: params.release.totalBytes, reason: `${params.release.expiredCount} db lejárt release rekord/csomag lehet.`, action: "Admin release oldalon ellenőrzés, majd csak fizikai fájl törlése, verziórekord megtartásával." },
  ];
}

function createRecommendedActions(params: {
  disk: DiskStatus | null;
  memory: MemoryStatus;
  backup: BackupStatus;
  ssl: SslCertificate[];
  security: SecurityCheck[];
  release: ReleaseStorage;
  codeWarnings: CodeWarningsSummary;
}): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  if (params.disk && params.disk.usePercent >= 85) actions.push({ priority: "magas", status: "warning", title: "Tárhely takarítás", detail: `A lemezhasználat ${params.disk.usePercent}%. Takarítási terv javasolt.` });
  else actions.push({ priority: "alacsony", status: "ok", title: "Tárhely rendben", detail: params.disk ? `A lemezhasználat ${params.disk.usePercent}%, nincs sürgős teendő.` : "Nincs tárhelyadat." });

  if (params.memory.swapUsagePercent >= 40) actions.push({ priority: "közepes", status: "warning", title: "Swap figyelés", detail: params.memory.availableBytes > 1024 * 1024 * 1024 ? "Magas swaparány, de van elérhető RAM. Figyelés elegendő." : "Magas swap és kevés elérhető RAM. Folyamatellenőrzés szükséges." });
  if (params.backup.status !== "ok") actions.push({ priority: "magas", status: params.backup.status, title: "Backup ellenőrzés", detail: params.backup.message });
  const expiringSsl = params.ssl.filter((item) => item.status !== "ok");
  if (expiringSsl.length > 0) actions.push({ priority: "magas", status: "warning", title: "SSL tanúsítvány ellenőrzés", detail: `${expiringSsl.length} tanúsítvány lejárata figyelmet igényel.` });
  const securityWarnings = params.security.filter((item) => item.status !== "ok");
  if (securityWarnings.length > 0) actions.push({ priority: "közepes", status: "warning", title: "Biztonsági checklist", detail: `${securityWarnings.length} biztonsági pont figyelmet igényel.` });
  if (params.release.status !== "ok") actions.push({ priority: "közepes", status: "warning", title: "Release csomagok", detail: "Lejárt vagy nagy méretű release csomagokat érdemes ellenőrizni." });
  if (params.codeWarnings.checked && params.codeWarnings.warningCount > 0) actions.push({ priority: "közepes", status: "warning", title: "Kódtisztítás", detail: `${params.codeWarnings.warningCount} ESLint warning vár rendezésre.` });

  return actions;
}

function createSummary(params: {
  disk: DiskStatus | null;
  memory: MemoryStatus;
  pm2Processes: Pm2Process[];
  nginxOk: boolean;
  projectDirectories: StorageItem[];
}) {
  const pm2OfflineCount = params.pm2Processes.filter((item) => item.status !== "online").length;
  const warnings: string[] = [];

  if (!params.nginxOk) warnings.push("Nginx konfiguráció ellenőrzése hibát jelzett.");
  if (pm2OfflineCount > 0) warnings.push(`${pm2OfflineCount} PM2 folyamat nem online.`);
  if (params.disk && params.disk.usePercent >= 95) warnings.push("Kritikus tárhelyhasználat: a lemez 95% felett van.");
  else if (params.disk && params.disk.usePercent >= 85) warnings.push("A lemezhasználat 85% felett van.");
  if (params.memory.usagePercent >= 85) warnings.push("Az effektív memóriahasználat 85% felett van.");
  if (params.memory.swapUsagePercent >= 40) {
    warnings.push(
      params.memory.availableBytes > 1024 * 1024 * 1024
        ? "A swap használat magas, de van elegendő elérhető RAM; valószínűleg régebben swapba került folyamatoldalak maradtak bent."
        : "A swap használat magas, és kevés az elérhető RAM; érdemes ellenőrizni a háttérfolyamatokat.",
    );
  }

  const biggestProjectDirectory = params.projectDirectories[1] ?? params.projectDirectories[0];
  if (biggestProjectDirectory && biggestProjectDirectory.sizeBytes > 10 * 1024 * 1024 * 1024) {
    warnings.push(`Nagy projektmappa: ${biggestProjectDirectory.name} jelentős tárhelyet foglal.`);
  }

  return {
    level: warnings.length === 0 ? "ok" : warnings.some((warning) => warning.includes("Kritikus") || warning.includes("hibát") || warning.includes("nem online")) ? "error" : "warning",
    label: warnings.length === 0 ? "Rendben" : warnings.length === 1 ? "Figyelmeztetés" : "Több figyelmeztetés",
    warnings,
  };
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const mode = request.nextUrl.searchParams.get("mode") ?? "overview";
  const includeWarnings = request.nextUrl.searchParams.get("includeWarnings") === "1" || mode === "warnings";
  const wantsOverview = mode === "overview";
  const wantsStorage = mode === "storage" || mode === "raw";
  const wantsProcesses = mode === "processes" || wantsOverview;
  const wantsOperations = mode === "operations";
  const wantsRaw = mode === "raw";

  const [diskResult, memoryResult, pm2Result, nginxResult, gitResult, npmResult, pm2VersionResult] = await Promise.all([
    runCommand("df", ["-k", "/"]),
    runCommand("free", ["-b"]),
    runCommand("pm2", ["jlist"], 8_000),
    runCommand("nginx", ["-t"], 8_000),
    runCommand("git", ["status", "--short"], 8_000),
    runCommand("npm", ["-v"]),
    runCommand("pm2", ["-v"]),
  ]);

  const disk = diskResult.ok ? parseDiskStatus(diskResult.stdout) : null;
  const diskSizeKb = disk?.sizeKb;

  const [
    topMemoryResult,
    topSwapResult,
    rootDirectoryResult,
    projectDirectoryResult,
    dimproverDirectoryResult,
    topProjectFilesResult,
    rootZipTotalResult,
    dimproAppsResult,
    dimproReleaseResult,
    dimproFajlmuhelyWorkResult,
    dimproverMainResult,
    dimproverDevResult,
    backupFilesResult,
    domainRoutesResult,
    sslResult,
    logSummaryResult,
    releaseStorageResult,
    securityResult,
  ] = await Promise.all([
    (wantsProcesses ? runShell("ps -eo pid=,%mem=,%cpu=,rss=,args= --sort=-rss | head -18", 8_000) : emptyCommandResult()),
    (wantsProcesses ? runShell("for p in /proc/[0-9]*; do pid=${p##*/}; name=$(awk '/^Name:/ {print $2}' \"$p/status\" 2>/dev/null); swap=$(awk '/^VmSwap:/ {print $2}' \"$p/status\" 2>/dev/null); if [ -n \"$swap\" ] && [ \"$swap\" -gt 0 ]; then cmd=$(tr '\\0' ' ' < \"$p/cmdline\" 2>/dev/null | sed 's/[[:space:]]\\+/ /g'); printf '%s\\t%s\\t%s\\t%s\\n' \"$swap\" \"$pid\" \"${name:-ismeretlen}\" \"${cmd:-$name}\"; fi; done | sort -nr | head -20", 8_000) : emptyCommandResult()),
    ((wantsStorage || wantsOperations || wantsRaw) ? runShell("du -k -d 1 /root 2>/dev/null | sort -nr | head -25", 12_000) : emptyCommandResult()),
    ((wantsStorage || wantsRaw) ? runShell("du -k -d 1 /root/dimprover 2>/dev/null | sort -nr | head -35", 12_000) : emptyCommandResult()),
    (wantsRaw ? runShell("du -k -d 2 /root/dimprover/.dimprover 2>/dev/null | sort -nr | head -35", 12_000) : emptyCommandResult()),
    (wantsRaw ? runShell("find /root/dimprover -maxdepth 1 -type f -printf '%s %p\\n' 2>/dev/null | sort -nr | head -35", 12_000) : emptyCommandResult()),
    ((wantsStorage || wantsRaw) ? runShell("find /root/dimprover -maxdepth 1 -type f -name '*.zip' -printf '%s\\n' 2>/dev/null | awk '{s+=$1} END {print s+0}'", 12_000) : emptyCommandResult()),
    (wantsStorage ? runShell("du -k -d 1 /root/apps 2>/dev/null | sort -nr | head -40", 12_000) : emptyCommandResult()),
    (wantsStorage ? runShell("du -k -d 1 /root/dimprover_release_packages 2>/dev/null | sort -nr | head -40", 12_000) : emptyCommandResult()),
    (wantsStorage ? runShell("du -k -d 1 /root/dimprover_fajlmuhely_work 2>/dev/null | sort -nr | head -40", 12_000) : emptyCommandResult()),
    (wantsStorage ? runShell("du -k -d 1 /root/dimprover 2>/dev/null | sort -nr | head -50", 12_000) : emptyCommandResult()),
    (wantsStorage ? runShell("du -k -d 1 /root/dimprover_dev 2>/dev/null | sort -nr | head -50", 12_000) : emptyCommandResult()),
    (wantsOperations ? runShell("find /root/dimprover/.dimprover/backups /root/dimprover_dev/.dimprover/backups -maxdepth 2 -type f -name '*.tar.gz' -printf '%s\t%TY-%Tm-%TdT%TH:%TM:%TS\t%p\n' 2>/dev/null | sort -r", 12_000) : emptyCommandResult()),
    (wantsOperations ? runShell("grep -RInE 'server_name|proxy_pass' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | sed -E 's/[[:space:]]+/ /g'", 12_000) : emptyCommandResult()),
    (wantsOperations ? runShell("for f in /etc/letsencrypt/live/*/fullchain.pem; do [ -f \"$f\" ] || continue; name=$(basename $(dirname \"$f\")); end=$(openssl x509 -enddate -noout -in \"$f\" 2>/dev/null | cut -d= -f2-); san=$(openssl x509 -noout -ext subjectAltName -in \"$f\" 2>/dev/null | tr '\n' ' '); printf '%s\t%s\t%s\n' \"$name\" \"$end\" \"$san\"; done", 12_000) : emptyCommandResult()),
    (wantsOperations ? runShell("for f in /root/.pm2/logs/*-error.log /var/log/nginx/error.log /root/dimprover/.dimprover/logs/backup.log; do [ -f \"$f\" ] || continue; echo __FILE__\"$f\"; tail -200 \"$f\" 2>/dev/null; done", 12_000) : emptyCommandResult()),
    (wantsOperations ? runShell("TOTAL=$(find /root/dimprover_release_packages/files -maxdepth 1 -type f -printf '%s\n' 2>/dev/null | awk '{s+=\$1} END {print s+0}'); COUNT=$(find /root/dimprover_release_packages/files -maxdepth 1 -type f 2>/dev/null | wc -l); EXPIRED=$(node -e \"const fs=require('fs');const p='/root/dimprover_release_packages/release-registry.json';let n=0;try{const a=JSON.parse(fs.readFileSync(p,'utf8'));const now=Date.now();n=(Array.isArray(a)?a:[]).filter(x=>x.expiresAt&&Date.parse(x.expiresAt)<now).length}catch(e){} console.log(n)\"); printf 'TOTAL\t%s\nCOUNT\t%s\nEXPIRED\t%s\n' \"$TOTAL\" \"$COUNT\" \"$EXPIRED\"; find /root/dimprover_release_packages/files -maxdepth 1 -type f -printf 'FILE\t%s\t%p\n' 2>/dev/null | sort -k2,2nr | head -15", 12_000) : emptyCommandResult()),
    (wantsOperations ? runShell("printf 'adminPerm\t'; if [ -f /root/dimprover/.dimprover/license/admin-key.txt ]; then stat -c '%a' /root/dimprover/.dimprover/license/admin-key.txt; else echo missing; fi; printf 'publicEnv\t'; find /root/dimprover/public -maxdepth 2 -iname '.env*' 2>/dev/null | grep -q . && echo yes || echo no; printf 'publicGit\t'; [ -e /root/dimprover/public/.git ] && echo yes || echo no; printf 'hiddenDeny\t'; grep -RiqE '(\\.env|\\.git|deny all|return 404)' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null && echo yes || echo no; printf 'releasePublic\t'; find /root/dimprover/public -type f \\( -name '*.zip' -o -name '*.7z' \\) 2>/dev/null | grep -q . && echo yes || echo no; printf 'devBasicAuth\t'; grep -RIl 'dev.dimprover.hu' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | xargs -r grep -qi 'auth_basic' && echo yes || echo no", 12_000) : emptyCommandResult()),
  ]);

  const memory = parseMemoryStatus(memoryResult.stdout);
  const pm2Processes = pm2Result.ok ? parsePm2Processes(pm2Result.stdout) : [];
  const nginxOk = nginxResult.ok;
  const rootDirectories = rootDirectoryResult.ok ? parseDuList(rootDirectoryResult.stdout, diskSizeKb) : [];
  const projectDirectories = projectDirectoryResult.ok ? parseDuList(projectDirectoryResult.stdout, diskSizeKb) : [];
  const dimproverDirectories = dimproverDirectoryResult.ok ? parseDuList(dimproverDirectoryResult.stdout, diskSizeKb) : [];
  const topProjectFiles = topProjectFilesResult.ok ? parseFileSizeList(topProjectFilesResult.stdout, diskSizeKb) : [];
  const topMemoryProcesses = topMemoryResult.ok ? parseMemoryProcesses(topMemoryResult.stdout) : [];
  const topSwapProcesses = topSwapResult.ok ? parseSwapProcesses(topSwapResult.stdout) : [];
  const dimproFolderGroups = [
    createFolderSizeGroup("DIMPRO appok", "/root/apps", dimproAppsResult.ok ? dimproAppsResult.stdout : "", diskSizeKb, "DIMPRO aldomain appok és különálló kiszolgáló mappák."),
    createFolderSizeGroup("DIMPRO release csomagok", "/root/dimprover_release_packages", dimproReleaseResult.ok ? dimproReleaseResult.stdout : "", diskSizeKb, "Privát, tokenes letöltésű DIMPRO Fájlműhely / Drive Desktop csomagok."),
    createFolderSizeGroup("DIMPRO Fájlműhely munkaanyag", "/root/dimprover_fajlmuhely_work", dimproFajlmuhelyWorkResult.ok ? dimproFajlmuhelyWorkResult.stdout : "", diskSizeKb, "Asztali DIMPRO Fájlműhely fejlesztési / csomagolási munkaterület."),
  ];
  const dimproverFolderGroups = [
    createFolderSizeGroup("DIMPROVER fő app", "/root/dimprover", dimproverMainResult.ok ? dimproverMainResult.stdout : "", diskSizeKb, "Éles / bemutatható webes DIMPROVER példány és license/admin felület."),
    createFolderSizeGroup("DIMPROVER dev app", "/root/dimprover_dev", dimproverDevResult.ok ? dimproverDevResult.stdout : "", diskSizeKb, "Fejlesztői DIMPROVER példány a dev.dimprover.hu alatt."),
  ];

  const backupStatus = parseBackupStatus(backupFilesResult.ok ? backupFilesResult.stdout : "");
  const domainRoutes = parseDomainRoutes(domainRoutesResult.ok ? domainRoutesResult.stdout : "");
  const sslCertificates = parseSslCertificates(sslResult.ok ? sslResult.stdout : "");
  const logSummaries = parseLogSummaries(logSummaryResult.ok ? logSummaryResult.stdout : "");
  const releaseStorage = parseReleaseStorage(releaseStorageResult.ok ? releaseStorageResult.stdout : "", diskSizeKb);
  const securityChecks = parseSecurityChecks(securityResult.ok ? securityResult.stdout : "");

  const storageCategories = [
    storageCategoryFromList(
      ".dimprover belső munkamappa",
      "/root/dimprover/.dimprover",
      projectDirectories,
      "A legnagyobb DIMPROVER-projekt alatti belső mappa. Itt érdemes először ellenőrizni a build-, release-, cache- vagy csomagmaradványokat.",
    ),
    storageCategoryFromList(
      "DIMPROVER backups",
      "/root/dimprover/backups",
      projectDirectories,
      "Fejlesztési mentések. Hasznos, de idővel archiválni vagy ritkítani kell.",
    ),
    storageCategoryFromList(
      "Next.js build kimenet",
      "/root/dimprover/.next",
      projectDirectories,
      "Éles build és standalone kimenet. Új build után részben újragenerálható, de óvatosan kezelendő.",
    ),
    storageCategoryFromList(
      "Node függőségek",
      "/root/dimprover/node_modules",
      projectDirectories,
      "Telepített npm csomagok. Újratelepíthető, de törlés előtt package-lock és build működés ellenőrzendő.",
    ),
    zipCategory(rootZipTotalResult.ok ? rootZipTotalResult.stdout : "0"),
  ].sort((a, b) => b.sizeBytes - a.sizeBytes);

  const codeWarnings = await collectCodeWarnings(includeWarnings);
  const cleanupSuggestions = createCleanupSuggestions({ backup: backupStatus, rootDirectories, projectFiles: topProjectFiles, release: releaseStorage });
  const recommendedActions = createRecommendedActions({ disk, memory, backup: backupStatus, ssl: sslCertificates, security: securityChecks, release: releaseStorage, codeWarnings });
  const summary = createSummary({ disk, memory, pm2Processes, nginxOk, projectDirectories });

  return NextResponse.json(
    {
      ok: true,
      collectedAt: new Date().toISOString(),
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeSeconds: os.uptime(),
        loadAverage: os.loadavg(),
        nodeVersion: process.version,
        npmVersion: npmResult.ok ? npmResult.stdout.trim() : null,
        pm2Version: pm2VersionResult.ok ? pm2VersionResult.stdout.trim() : null,
      },
      memory,
      disk,
      services: {
        nginx: {
          ok: nginxOk,
          message: nginxResult.ok ? "Nginx konfiguráció rendben." : nginxResult.stderr || "Nginx ellenőrzési hiba.",
        },
        pm2: {
          ok: pm2Result.ok,
          processes: pm2Processes,
          rawError: pm2Result.ok ? null : pm2Result.stderr,
        },
      },
      storage: {
        rootDirectories,
        projectDirectories,
        dimproverDirectories,
        topProjectFiles,
        categories: storageCategories,
        folderGroups: {
          dimpro: dimproFolderGroups,
          dimprover: dimproverFolderGroups,
        },
        commandErrors: {
          topMemory: topMemoryResult.ok ? null : topMemoryResult.stderr,
          topSwap: topSwapResult.ok ? null : topSwapResult.stderr,
          rootDirectories: rootDirectoryResult.ok ? null : rootDirectoryResult.stderr,
          projectDirectories: projectDirectoryResult.ok ? null : projectDirectoryResult.stderr,
          dimproverDirectories: dimproverDirectoryResult.ok ? null : dimproverDirectoryResult.stderr,
          topProjectFiles: topProjectFilesResult.ok ? null : topProjectFilesResult.stderr,
          dimproApps: dimproAppsResult.ok ? null : dimproAppsResult.stderr,
          dimproRelease: dimproReleaseResult.ok ? null : dimproReleaseResult.stderr,
          dimproFajlmuhelyWork: dimproFajlmuhelyWorkResult.ok ? null : dimproFajlmuhelyWorkResult.stderr,
          dimproverMain: dimproverMainResult.ok ? null : dimproverMainResult.stderr,
          dimproverDev: dimproverDevResult.ok ? null : dimproverDevResult.stderr,
        },
      },
      processes: {
        topMemory: topMemoryProcesses,
        topSwap: topSwapProcesses,
      },
      codeQuality: {
        warnings: codeWarnings,
      },
      operations: {
        recommendedActions,
        backup: backupStatus,
        domainRoutes,
        sslCertificates,
        logs: logSummaries,
        releaseStorage,
        securityChecks,
        cleanupSuggestions,
        commandErrors: {
          backup: backupFilesResult.ok ? null : backupFilesResult.stderr,
          domains: domainRoutesResult.ok ? null : domainRoutesResult.stderr,
          ssl: sslResult.ok ? null : sslResult.stderr,
          logs: logSummaryResult.ok ? null : logSummaryResult.stderr,
          release: releaseStorageResult.ok ? null : releaseStorageResult.stderr,
          security: securityResult.ok ? null : securityResult.stderr,
        },
      },
      git: gitResult.ok ? parseGitStatus(gitResult.stdout) : { changedCount: 0, untrackedCount: 0, totalCount: 0 },
      summary,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
