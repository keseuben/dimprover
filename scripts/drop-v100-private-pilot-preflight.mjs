#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const expectedRelease = ".next-v099-release-final";
const expectedBuildId = "C1O7K6FBn329lzLVSvrjA";
const reportDir = path.join(root, ".dimprover", "validation");
const reportFile = path.join(reportDir, "drop-v100-preflight.json");
const checks = [];

function command(commandName, args = []) {
  return execFileSync(commandName, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function add(id, title, status, detail, durationMs) {
  checks.push({ id, title, status, detail: String(detail).slice(0, 1200), ...(Number.isFinite(durationMs) ? { durationMs } : {}) });
}

async function runCheck(id, title, callback) {
  const started = Date.now();
  try {
    const result = await callback();
    const normalized = typeof result === "string" ? { status: "passed", detail: result } : result;
    add(id, title, normalized.status || "passed", normalized.detail || "Megfelelt.", Date.now() - started);
  } catch (error) {
    add(id, title, "failed", error instanceof Error ? error.message : String(error), Date.now() - started);
  }
}

async function fetchResponse(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "manual", cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Nem érvényes PNG állomány.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

await runCheck("active_release", "Aktív release pointer", async () => {
  const active = (await text(".dimprover/active-next-release")).trim();
  if (active !== expectedRelease) throw new Error(`Várt: ${expectedRelease}; aktív: ${active || "nincs"}.`);
  return `Aktív release: ${active}.`;
});

await runCheck("active_build", "Aktív BUILD_ID", async () => {
  const buildId = (await text(`${expectedRelease}/BUILD_ID`)).trim();
  if (buildId !== expectedBuildId) throw new Error(`Várt BUILD_ID: ${expectedBuildId}; tényleges: ${buildId || "nincs"}.`);
  return `BUILD_ID: ${buildId}.`;
});

await runCheck("candidate_build", "DROP 1.0.0 candidate build", async () => {
  const candidateRoot = path.join(root, ".next-v100-candidate");
  const buildIdPath = path.join(candidateRoot, "BUILD_ID");
  const serverPath = path.join(candidateRoot, "standalone", "server.js");
  if (!(await exists(buildIdPath)) || !(await exists(serverPath))) throw new Error("A DROP 1.0.0 candidate build vagy standalone szerver hiányzik.");
  const buildId = (await readFile(buildIdPath, "utf8")).trim();
  if (!buildId) throw new Error("A candidate BUILD_ID üres.");
  return `Candidate BUILD_ID: ${buildId}; standalone szerver elérhető.`;
});

await runCheck("rollback", "Közvetlen rollback", async () => {
  const releaseExists = await exists(path.join(root, ".next-v098-release-final", "BUILD_ID"));
  const scriptExists = await exists(path.join(root, "scripts", "rollback-drop-v099-release.sh"));
  if (!releaseExists || !scriptExists) throw new Error(`Rollback release: ${releaseExists}; rollback script: ${scriptExists}.`);
  return "A DROP 0.9.8 release és a DROP 0.9.9 rollback script elérhető.";
});

await runCheck("pm2", "PM2 production folyamat", async () => {
  const list = JSON.parse(command("pm2", ["jlist"]));
  const app = list.find((item) => item.name === "dimprover");
  if (!app || app.pm2_env?.status !== "online") throw new Error("A dimprover PM2 folyamat nem online.");
  return `dimprover online; PID ${app.pid}; restart ${app.pm2_env?.restart_time ?? "?"}.`;
});

await runCheck("nginx", "Nginx konfiguráció", async () => {
  command("nginx", ["-t"]);
  return "Az Nginx konfiguráció szintaktikailag érvényes.";
});

await runCheck("clamav", "ClamAV szolgáltatások", async () => {
  const daemon = command("systemctl", ["is-active", "clamav-daemon"]);
  const freshclam = command("systemctl", ["is-active", "clamav-freshclam"]);
  if (daemon !== "active" || freshclam !== "active") throw new Error(`clamav-daemon=${daemon}; clamav-freshclam=${freshclam}.`);
  return "clamav-daemon és clamav-freshclam aktív.";
});

await runCheck("worker_timer", "Drop worker timer", async () => {
  const active = command("systemctl", ["is-active", "dimpro-drop-worker-v050.timer"]);
  if (active !== "active") throw new Error(`Worker timer állapot: ${active}.`);
  return "A kétpercenkénti Drop worker timer aktív.";
});

await runCheck("scan_trigger", "Azonnali scanner trigger", async () => {
  const active = command("systemctl", ["is-active", "dimpro-drop-scan-trigger-v096.path"]);
  if (active !== "active") throw new Error(`Scanner path állapot: ${active}.`);
  return "Az azonnali scan path-trigger aktív.";
});

await runCheck("https_health", "Éles HTTPS health és readiness", async () => {
  const response = await fetchResponse("https://drop.dimpro.hu/api/drop/health");
  if (!response.ok) throw new Error(`Health HTTP ${response.status}.`);
  const payload = await response.json();
  const required = ["coreReady", "uploadEnabled"];
  for (const key of required) if (payload[key] !== true) throw new Error(`Hiányzó readiness: ${key}.`);
  const readiness = payload.readiness || {};
  for (const key of ["databaseSchema", "objectStorage", "virusScanner", "worker", "publicDownload", "mobilePwa", "offlineQueue", "packageZipDownload", "packageZipStreaming"]) {
    if (readiness[key] !== true) throw new Error(`Readiness nem teljes: ${key}.`);
  }
  if (payload.version !== "DROP 0.9.9" || payload.stage !== "private-pilot") throw new Error(`Váratlan runtime: ${payload.version} / ${payload.stage}.`);
  return `DROP 0.9.9 private-pilot; core, storage, scanner, worker, PWA és ZIP READY.`;
});

await runCheck("manifest", "PWA manifest szerződés", async () => {
  const response = await fetchResponse("https://drop.dimpro.hu/drop.webmanifest");
  if (!response.ok) throw new Error(`Manifest HTTP ${response.status}.`);
  const manifest = await response.json();
  const sources = new Set((manifest.icons || []).map((icon) => icon.src));
  for (const required of ["/drop-app-icon-v099-192.png", "/drop-app-icon-v099-512.png", "/drop-app-icon-maskable-v099-512.png"]) {
    if (!sources.has(required)) throw new Error(`Hiányzó manifest ikon: ${required}.`);
  }
  return `${manifest.icons.length} ikon; verziózott 192/512/maskable források jelen vannak.`;
});

await runCheck("icon_dimensions", "Favicon és PWA ikonméretek", async () => {
  const targets = [
    ["/drop-favicon-v099-32.png", 32],
    ["/drop-apple-touch-v099-180.png", 180],
    ["/drop-app-icon-v099-192.png", 192],
    ["/drop-app-icon-v099-512.png", 512],
    ["/drop-app-icon-maskable-v099-512.png", 512],
  ];
  const results = [];
  for (const [url, expected] of targets) {
    const response = await fetchResponse(`https://drop.dimpro.hu${url}`);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}.`);
    const dimensions = pngDimensions(Buffer.from(await response.arrayBuffer()));
    if (dimensions.width !== expected || dimensions.height !== expected) throw new Error(`${url}: ${dimensions.width}×${dimensions.height}, várt ${expected}×${expected}.`);
    results.push(`${expected}×${expected}`);
  }
  return `Ikonméretek: ${results.join(", ")}.`;
});

await runCheck("service_worker", "PWA service worker cache", async () => {
  const response = await fetchResponse("https://drop.dimpro.hu/drop-sw.js");
  if (!response.ok) throw new Error(`Service worker HTTP ${response.status}.`);
  const source = await response.text();
  if (!source.includes("dimpro-drop-static-v099-icons")) throw new Error("A v099 ikoncache neve nem található.");
  if (!source.includes("drop-app-icon-maskable-v099-512.png")) throw new Error("A maskable ikon nincs a service worker forrásában.");
  return "A v099 ikoncache és a maskable ikon szerepel a service workerben.";
});

await runCheck("disk", "VPS tárhely release gate", async () => {
  const output = command("df", ["-P", "/"]);
  const line = output.trim().split("\n").at(-1) || "";
  const match = line.match(/\s(\d+)%\s+\/$/);
  const used = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(used)) throw new Error("A tárhelyhasználat nem olvasható.");
  if (used >= 90) return { status: "failed", detail: `A rendszerlemez ${used}%-os; release előtt kötelező takarítás.` };
  if (used >= 80) return { status: "warning", detail: `A rendszerlemez ${used}%-os; új nagy build előtt tárhelytakarítás javasolt.` };
  return { status: "passed", detail: `A rendszerlemez ${used}%-os.` };
});

await runCheck("backup", "Fejlesztés előtti backup", async () => {
  const pointer = (await text(".work_drop_v100_backup_path")).trim();
  const target = path.join(root, pointer);
  if (!pointer || !(await exists(target))) throw new Error("A DROP 1.0.0 backup pointer vagy könyvtár hiányzik.");
  const sourceHash = path.join(target, "source-sha256.txt");
  const pm2Dump = path.join(target, "state", "pm2-dump.pm2");
  if (!(await exists(sourceHash)) || !(await exists(pm2Dump))) throw new Error("A backup integritási lista vagy PM2 dump hiányzik.");
  return `Backup: ${pointer}; forráshash és PM2 dump elérhető.`;
});

await runCheck("backup_timers", "Automatikus backup timerek", async () => {
  const daily = command("systemctl", ["is-active", "dimpro-backup.timer"]);
  const watchdog = command("systemctl", ["is-active", "dimpro-backup-watchdog.timer"]);
  const check = command("systemctl", ["is-active", "dimpro-backup-check.timer"]);
  if ([daily, watchdog, check].some((item) => item !== "active")) throw new Error(`backup=${daily}; watchdog=${watchdog}; check=${check}.`);
  return "Napi backup, watchdog és ellenőrző timer aktív.";
});

await runCheck("validation_center", "Private-pilot validációs központ forrásszerződés", async () => {
  const moduleSource = await text("app/lib/drop/validation/dropPrivatePilotValidation.ts");
  const routeSource = await text("app/api/drop/admin/private-pilot-validation/route.ts");
  const panelSource = await text("components/drop/DropPrivatePilotValidationPanel.tsx");
  const caseCount = (moduleSource.match(/categoryId:/g) || []).length;
  if (caseCount < 40) throw new Error(`Csak ${caseCount} validációs tétel található.`);
  if (!routeSource.includes("isLicenseAdminAuthorized")) throw new Error("Az admin jogosultságkapu hiányzik.");
  if (!panelSource.includes("release gate") || !moduleSource.includes("200%-os zoom")) throw new Error("A release gate vagy zoom tétel hiányzik a validációs központból.");
  return `${caseCount} validációs tétel; admin-only API és release-gate UI elérhető.`;
});

await runCheck("email_dark_mode", "E-mail világos/sötét mód szerződés", async () => {
  const source = await text("app/lib/drop/public/dropPublicEmailTemplate.ts");
  if (!source.includes("prefers-color-scheme: dark") || !source.includes("supported-color-schemes\" content=\"light dark")) {
    return { status: "warning", detail: "A production e-mail sablon explicit sötét módú CSS-e még nincs teljesen bekötve." };
  }
  return "A production e-mail sablon világos és sötét színsémát deklarál.";
});

await runCheck("zip_state", "Nagy ZIP állapotjelzés szerződés", async () => {
  const panelSource = await text("components/drop/DropSecureDownloadPanel.tsx");
  const routeSource = await text("app/api/drop/downloads/package/zip/route.ts");
  if (!panelSource.includes("zipRequestId") || !panelSource.includes("eltelt")) {
    return { status: "warning", detail: "A ZIP felület még nem használ szerver-visszajelzéses kérésazonosítót és eltelt időt." };
  }
  if (!routeSource.includes("dimpro_drop_zip_ready")) return { status: "warning", detail: "A ZIP route még nem állít be biztonságos elkészültségi jelzőcookie-t." };
  return "A nagy ZIP kliensoldali időmérés és szerveroldali stream-indulás jelzés elérhető.";
});

await runCheck("accessibility_browser", "Böngészős hozzáférhetőségi mátrix", async () => {
  const reportPath = path.join(root, ".dimprover", "validation", "drop-v100-accessibility.json");
  if (!(await exists(reportPath))) return { status: "warning", detail: "A böngészős hozzáférhetőségi riport még nem készült el." };
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  if (report.overallStatus === "failed") return { status: "failed", detail: `${report.summary?.failed || 0}/${report.summary?.total || 0} szcenárió hibás.` };
  if (report.overallStatus === "warning") return { status: "warning", detail: `${report.summary?.passed || 0}/${report.summary?.total || 0} szcenárió megfelelt; ${report.summary?.warning || 0} kontrasztfigyelmeztetés maradt.` };
  return { status: "passed", detail: `${report.summary?.passed || 0}/${report.summary?.total || 0} böngészős szcenárió megfelelt.` };
});

await runCheck("documentation", "DROP dokumentáció és készültségi százalékok", async () => {
  for (const file of [
    "DIMPROVER_PRODUCT_DOCS/74_dimpro_drop_fejlesztesi_allapot.md",
    "DIMPROVER_PRODUCT_DOCS/105_dimpro_drop_email_validation_zip_pwa_icons_v099.md",
    "DIMPROVER_PRODUCT_DOCS/106_dimpro_drop_new_chat_handoff_after_v099.md",
    "DIMPROVER_PRODUCT_DOCS/107_dimpro_drop_v100_private_pilot_quick_image_code_hardening.md",
    "DIMPROVER_PRODUCT_DOCS/108_dimpro_drop_new_chat_handoff_after_v100_candidate.md",
    "DIMPROVER_PRODUCT_DOCS/README.md",
  ]) if (!(await exists(path.join(root, file)))) throw new Error(`Hiányzó dokumentum: ${file}.`);
  const handoff = await text("DIMPROVER_PRODUCT_DOCS/106_dimpro_drop_new_chat_handoff_after_v099.md");
  for (const marker of ["DIMPRO Drop | 94%", "DIMPRO Drive backend | 72%", "Teljes Drop + Drive termékcsomag | 68%"] ) {
    if (!handoff.includes(marker)) throw new Error(`Hiányzó készültségi marker: ${marker}.`);
  }
  return "A kiadási, átadási és összesített dokumentumok, valamint a frissített százalékok elérhetők.";
});

const summary = {
  passed: checks.filter((item) => item.status === "passed").length,
  warning: checks.filter((item) => item.status === "warning").length,
  failed: checks.filter((item) => item.status === "failed").length,
  total: checks.length,
};
const overallStatus = summary.failed > 0 ? "failed" : summary.warning > 0 ? "warning" : "passed";
const report = {
  version: 1,
  targetVersion: "DROP 1.0.0",
  generatedAt: new Date().toISOString(),
  overallStatus,
  summary,
  checks,
};
await mkdir(reportDir, { recursive: true, mode: 0o700 });
const temporary = `${reportFile}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await rename(temporary, reportFile);

console.log(JSON.stringify(report, null, 2));
if (overallStatus === "failed") process.exitCode = 1;
