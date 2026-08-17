import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMailProfilesSafeConfig, sendDimproMail } from "@/app/lib/license/mail-profiles";
import { createNotification } from "@/app/lib/notifications/notificationStore";
import { getDefaultProjectRecipientUserIds } from "@/app/lib/notifications/notificationAccess";
import { collectDropOperationsSnapshot } from "./dropOperationsRepository";
import type { DropOperationsHistoryItem, DropOperationsSnapshot } from "./dropOperationsTypes";

function projectRoot() {
  const cwd = process.cwd();
  const suffix = path.join(".next", "standalone");
  return cwd.endsWith(suffix) ? path.resolve(cwd, "..", "..") : cwd;
}
const dataRoot = process.env.DROP_OPERATIONS_DATA_DIR?.trim()
  ? path.resolve(process.env.DROP_OPERATIONS_DATA_DIR.trim())
  : path.join(projectRoot(), ".data", "dimpro-drop-operations");
const historyPath = path.join(dataRoot, "history.jsonl");
const alertStatePath = path.join(dataRoot, "last-alert.json");
const scheduledLockPath = path.join(dataRoot, "scheduled.lock");
const duplicateThrottleMs = 6 * 60 * 60_000;
function alertsEnabled() { return process.env.DROP_OPERATIONS_ALERTS_ENABLED?.trim().toLowerCase() !== "false"; }

async function ensureRoot() {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await chmod(dataRoot, 0o700).catch(() => undefined);
}
async function appendHistory(snapshot: DropOperationsHistoryItem) {
  await ensureRoot();
  let previous = "";
  try { previous = await readFile(historyPath, "utf8"); } catch { previous = ""; }
  const lines = [...previous.split("\n").filter(Boolean), JSON.stringify(snapshot)].slice(-240);
  await writeFile(historyPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  await chmod(historyPath, 0o600).catch(() => undefined);
}
export async function loadDropOperationsHistory(limit = 60): Promise<DropOperationsHistoryItem[]> {
  await ensureRoot();
  try {
    return (await readFile(historyPath, "utf8"))
      .split("\n")
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(240, limit)))
      .map((line) => JSON.parse(line) as DropOperationsHistoryItem)
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  } catch { return []; }
}
function alertFingerprint(snapshot: Omit<DropOperationsSnapshot, "alert">) {
  const failing = snapshot.checks
    .filter((item) => item.status !== "ok")
    .map((item) => `${item.id}:${item.status}:${item.value}`)
    .sort()
    .join("|");
  return createHash("sha256").update(failing || "healthy").digest("hex");
}
async function readLastAlert() {
  try { return JSON.parse(await readFile(alertStatePath, "utf8")) as { fingerprint?: string; status?: string; sentAt?: string }; }
  catch { return {}; }
}
async function saveLastAlert(input: { fingerprint: string; status: string; sentAt: string }) {
  await ensureRoot();
  await writeFile(alertStatePath, `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
  await chmod(alertStatePath, 0o600).catch(() => undefined);
}
function emailHtml(snapshot: Omit<DropOperationsSnapshot, "alert">) {
  const failing = snapshot.checks.filter((item) => item.status !== "ok");
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55"><h2 style="color:${snapshot.status === "error" ? "#dc2626" : "#d97706"}">DIMPRO Drop üzemeltetési riasztás</h2><p><strong>Állapot:</strong> ${snapshot.label}</p><p><strong>Időpont:</strong> ${snapshot.collectedAt}</p><ul>${failing.map((item) => `<li><strong>${item.label}:</strong> ${item.value}<br><span style="color:#475569">${item.detail}</span></li>`).join("")}</ul><p><a href="https://license.dimpro.hu/drive/drop/operations">Drop üzemeltetési központ megnyitása</a></p></div>`;
}
async function createAlert(snapshot: Omit<DropOperationsSnapshot, "alert">, fingerprint: string) {
  const last = await readLastAlert();
  const lastSent = last.sentAt ? Date.parse(last.sentAt) : 0;
  const isRecovery = snapshot.status === "ok" && last.status && last.status !== "ok";
  const duplicate = last.fingerprint === fingerprint && Date.now() - lastSent < duplicateThrottleMs;
  if ((snapshot.status === "ok" && !isRecovery) || duplicate) {
    return { fingerprint, required: false, notificationCreated: false, emailAttempted: false, emailSent: false, emailReason: duplicate ? "Azonos riasztás hat órán belül már létrejött." : "Nincs riasztási esemény." };
  }

  const failing = snapshot.checks.filter((item) => item.status !== "ok");
  const title = isRecovery ? "DIMPRO Drop állapota helyreállt" : snapshot.status === "error" ? "DIMPRO Drop beavatkozást igényel" : "DIMPRO Drop figyelmeztetés";
  const message = isRecovery ? "A korábbi Drop üzemeltetési hiba már nem áll fenn." : failing.slice(0, 4).map((item) => `${item.label}: ${item.value}`).join(" · ");
  const recipientUserIds = getDefaultProjectRecipientUserIds({ extraUserIds: [process.env.DIMPRO_DROP_ALERT_USER_ID, process.env.DIMPRO_DEV_NOTIFICATION_USER_ID].filter(Boolean) as string[] });
  await createNotification({
    type: "SYSTEM_INFO",
    title,
    message,
    recipientUserIds,
    source: "server",
    sourceClient: "dimpro-drop-operations",
    priority: snapshot.status === "error" ? "high" : "normal",
    actionUrl: "/drive/drop/operations",
    metadata: { version: snapshot.version, status: snapshot.status, collectedAt: snapshot.collectedAt, fingerprint },
  });

  let emailAttempted = false;
  let emailSent = false;
  let emailReason = "Nincs monitor e-mail címzett beállítva.";
  try {
    const mail = await getMailProfilesSafeConfig();
    const to = mail.testRecipients;
    if (to.length) {
      emailAttempted = true;
      await sendDimproMail({
        profileId: "notifications",
        to,
        subject: title,
        text: [title, "", `Állapot: ${snapshot.label}`, `Időpont: ${snapshot.collectedAt}`, "", ...failing.map((item) => `- ${item.label}: ${item.value} (${item.detail})`), "", "https://license.dimpro.hu/drive/drop/operations"].join("\n"),
        html: emailHtml(snapshot),
      });
      emailSent = true;
      emailReason = "Üzemeltetési e-mail elküldve.";
    }
  } catch (error) {
    emailReason = error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen e-mail küldési hiba.";
  }
  await saveLastAlert({ fingerprint, status: snapshot.status, sentAt: new Date().toISOString() });
  return { fingerprint, required: true, notificationCreated: true, emailAttempted, emailSent, emailReason };
}

export async function runDropOperationsMonitor(input: {
  source?: DropOperationsSnapshot["source"];
  deepStorageAudit?: boolean;
  notify?: boolean;
} = {}): Promise<DropOperationsSnapshot> {
  const snapshot = await collectDropOperationsSnapshot({ source: input.source, deepStorageAudit: input.deepStorageAudit });
  const fingerprint = alertFingerprint(snapshot);
  const alert = input.notify === false
    ? { fingerprint, required: snapshot.status !== "ok", notificationCreated: false, emailAttempted: false, emailSent: false, emailReason: "A riasztásküldés ennél a futásnál ki volt kapcsolva." }
    : await createAlert(snapshot, fingerprint);
  const result: DropOperationsSnapshot = { ...snapshot, alert };
  const history: DropOperationsHistoryItem = {
    version: result.version,
    source: result.source,
    collectedAt: result.collectedAt,
    durationMs: result.durationMs,
    status: result.status,
    label: result.label,
    deepStorageAudit: result.deepStorageAudit,
    metrics: result.metrics,
    storageAudit: result.storageAudit,
    checks: result.checks,
  };
  await appendHistory(history);
  return result;
}

export async function getDropOperationsResponse(limit = 60) {
  const history = await loadDropOperationsHistory(limit);
  return { ok: true, version: "DROP 1.2.13" as const, latest: history[0] || null, history };
}


export async function runScheduledDropOperationsMonitor() {
  await ensureRoot();
  const history = await loadDropOperationsHistory(30);
  const latestWorker = history.find((item) => item.source === "worker");
  if (latestWorker && Date.now() - Date.parse(latestWorker.collectedAt) < 15 * 60_000) {
    return { executed: false as const, reason: "scheduled-throttle", latestAt: latestWorker.collectedAt };
  }
  try {
    const current = await stat(scheduledLockPath).catch(() => null);
    if (current && Date.now() - current.mtimeMs > 5 * 60_000) await unlink(scheduledLockPath).catch(() => undefined);
    await writeFile(scheduledLockPath, `${process.pid} ${new Date().toISOString()}
`, { flag: "wx", mode: 0o600 });
  } catch {
    return { executed: false as const, reason: "scheduled-lock-held", latestAt: latestWorker?.collectedAt || null };
  }
  try {
    const snapshot = await runDropOperationsMonitor({ source: "worker", deepStorageAudit: false, notify: alertsEnabled() });
    return { executed: true as const, reason: "scheduled-run", snapshot };
  } finally {
    await unlink(scheduledLockPath).catch(() => undefined);
  }
}
