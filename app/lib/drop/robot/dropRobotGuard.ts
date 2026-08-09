import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDropSecurityFingerprint } from "../dropCrypto";
import { writeDropEvent } from "../dropRepository";

const TOKEN_PREFIX = "dgi_";
const DEFAULT_HARD_BLOCK_MS = 400;
const DEFAULT_MINIMUM_HUMAN_MS = 1_500;
const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_BATCH_MAX = 100;
const DEFAULT_BATCHES_PER_MINUTE = 10;
const DEFAULT_ACTIVE_INTENTS = 200;
const CONSUMED_RETENTION_MS = 24 * 60 * 60_000;

export type DropRobotAuthorizationMode = "space_session" | "capability_token";

type IntentStatus = "issued" | "consumed" | "blocked_too_fast" | "blocked_honeypot" | "blocked_context" | "expired";

type IntentRecord = {
  version: 1;
  id: string;
  batchId: string;
  tokenHash: string;
  packageId: string;
  authorizationMode: DropRobotAuthorizationMode;
  authFingerprint: string;
  ipHash: string;
  userAgentSummary: string;
  issuedAt: string;
  issuedAtMs: number;
  notBeforeAt: string;
  notBeforeAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
  status: IntentStatus;
  consumedAt?: string;
  elapsedMs?: number;
  reason?: string;
};

export type DropUploadIntentPublic = {
  token: string;
  issuedAt: string;
  notBeforeAt: string;
  expiresAt: string;
};

export class DropRobotGuardError extends Error {
  code: string;
  status: number;
  retryAfterMs?: number;

  constructor(message: string, code: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "DropRobotGuardError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function getDropRobotGuardConfig() {
  return {
    hardBlockMs: integerEnv("DROP_BOT_HARD_BLOCK_MS", DEFAULT_HARD_BLOCK_MS, 100, 2_000),
    minimumHumanMs: integerEnv("DROP_BOT_MIN_HUMAN_MS", DEFAULT_MINIMUM_HUMAN_MS, 500, 10_000),
    ttlMs: integerEnv("DROP_BOT_INTENT_TTL_MS", DEFAULT_TTL_MS, 30_000, 15 * 60_000),
    batchMax: integerEnv("DROP_BOT_INTENT_BATCH_MAX", DEFAULT_BATCH_MAX, 1, 250),
    batchesPerMinute: integerEnv("DROP_BOT_BATCHES_PER_MINUTE", DEFAULT_BATCHES_PER_MINUTE, 1, 60),
    activeIntentLimit: integerEnv("DROP_BOT_ACTIVE_INTENTS", DEFAULT_ACTIVE_INTENTS, 5, 500),
    activeUploadSessionLimit: integerEnv("DROP_BOT_ACTIVE_UPLOAD_SESSIONS", 5, 1, 25),
  };
}

function storeRoot() {
  const configured = process.env.DROP_BOT_GUARD_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".data", "dimpro-drop-guard");
}

function activeDir() { return path.join(storeRoot(), "active"); }
function consumedDir() { return path.join(storeRoot(), "consumed"); }
function tokenHash(rawToken: string) { return createHash("sha256").update(rawToken, "utf8").digest("hex"); }
function recordPath(directory: string, hash: string) { return path.join(directory, `${hash}.json`); }

function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

function userAgent(headers: Headers) {
  return (headers.get("user-agent") || "unknown").replace(/[\r\n]/g, " ").slice(0, 240);
}

export function createDropRobotAuthFingerprint(mode: DropRobotAuthorizationMode, rawCredential: string) {
  if (!rawCredential || rawCredential.length < 20) {
    throw new DropRobotGuardError("A robotvédelmi munkamenet hitelesítése hiányzik.", "DROP_BOT_AUTH_MISSING", 401);
  }
  return createDropSecurityFingerprint(`robot-auth-${mode}`, rawCredential);
}

export function getDropRobotRequestContext(headers: Headers) {
  const ip = clientIp(headers);
  return {
    ipHash: createDropSecurityFingerprint("robot-ip", ip),
    userAgentSummary: userAgent(headers),
  };
}

async function ensureDirs() {
  await Promise.all([mkdir(activeDir(), { recursive: true, mode: 0o700 }), mkdir(consumedDir(), { recursive: true, mode: 0o700 })]);
}

async function readRecord(filePath: string): Promise<IntentRecord | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as IntentRecord;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function writeRecord(filePath: string, record: IntentRecord, exclusive = false) {
  await writeFile(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600, flag: exclusive ? "wx" : "w" });
}

async function listRecords(directory: string) {
  await ensureDirs();
  const names = await readdir(directory).catch(() => [] as string[]);
  const records: IntentRecord[] = [];
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const row = await readRecord(path.join(directory, name));
    if (row) records.push(row);
  }
  return records;
}

export async function cleanupDropRobotGuard(nowMs = Date.now()) {
  await ensureDirs();
  let removedActive = 0;
  let removedConsumed = 0;
  for (const record of await listRecords(activeDir())) {
    if (record.expiresAtMs >= nowMs) continue;
    await rm(recordPath(activeDir(), record.tokenHash), { force: true });
    removedActive += 1;
  }
  for (const record of await listRecords(consumedDir())) {
    const reference = Date.parse(record.consumedAt || record.expiresAt);
    if (!Number.isFinite(reference) || reference + CONSUMED_RETENTION_MS >= nowMs) continue;
    await rm(recordPath(consumedDir(), record.tokenHash), { force: true });
    removedConsumed += 1;
  }
  return { removedActive, removedConsumed };
}

async function safeAudit(input: {
  packageId: string;
  eventType: string;
  severity?: "info" | "warning" | "error" | "critical";
  context: { ipHash: string; userAgentSummary: string };
  payload: Record<string, unknown>;
}) {
  if (process.env.DROP_BOT_GUARD_DISABLE_AUDIT === "true") return;
  await writeDropEvent({
    packageId: input.packageId,
    eventType: input.eventType,
    severity: input.severity || "info",
    ipHash: input.context.ipHash,
    userAgentSummary: input.context.userAgentSummary,
    payload: input.payload,
  }).catch((error) => {
    console.error("DROP robot guard audit failed:", error instanceof Error ? error.message : "unknown error");
  });
}

export async function issueDropUploadIntents(input: {
  packageId: string;
  authorizationMode: DropRobotAuthorizationMode;
  authFingerprint: string;
  headers: Headers;
  count: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const config = getDropRobotGuardConfig();
  const count = Math.min(config.batchMax, Math.max(1, Math.trunc(input.count || 1)));
  const context = getDropRobotRequestContext(input.headers);
  await cleanupDropRobotGuard(nowMs);
  const active = (await listRecords(activeDir())).filter((row) => row.packageId === input.packageId && row.authFingerprint === input.authFingerprint && row.expiresAtMs > nowMs);
  if (active.length + count > config.activeIntentLimit) {
    await safeAudit({ packageId: input.packageId, eventType: "security.bot_intent_rate_limited", severity: "warning", context, payload: { reason: "active_intent_limit", active: active.length, requested: count } });
    throw new DropRobotGuardError("Túl sok előkészített feltöltés várakozik. Próbálja meg rövidesen újra.", "DROP_BOT_ACTIVE_INTENT_LIMIT", 429, 10_000);
  }
  const issuedSince = nowMs - 60_000;
  const recentBatches = [...await listRecords(activeDir()), ...await listRecords(consumedDir())]
    .filter((row) => row.packageId === input.packageId && row.authFingerprint === input.authFingerprint && row.issuedAtMs >= issuedSince)
    .reduce((set, row) => set.add(row.batchId || row.issuedAt), new Set<string>()).size;
  if (recentBatches >= config.batchesPerMinute) {
    await safeAudit({ packageId: input.packageId, eventType: "security.bot_intent_rate_limited", severity: "warning", context, payload: { reason: "batch_rate_limit", recentBatches } });
    throw new DropRobotGuardError("Túl sok feltöltési előkészítés indult. Várjon egy percet.", "DROP_BOT_INTENT_RATE_LIMIT", 429, 60_000);
  }
  const issuedAt = new Date(nowMs).toISOString();
  const batchId = `batch_${randomBytes(12).toString("hex")}`;
  const notBeforeAtMs = nowMs + config.minimumHumanMs;
  const expiresAtMs = nowMs + config.ttlMs;
  const intents: DropUploadIntentPublic[] = [];
  for (let index = 0; index < count; index += 1) {
    const rawToken = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const hash = tokenHash(rawToken);
    const record: IntentRecord = {
      version: 1,
      id: `intent_${randomBytes(12).toString("hex")}`,
      batchId,
      tokenHash: hash,
      packageId: input.packageId,
      authorizationMode: input.authorizationMode,
      authFingerprint: input.authFingerprint,
      ipHash: context.ipHash,
      userAgentSummary: context.userAgentSummary,
      issuedAt,
      issuedAtMs: nowMs,
      notBeforeAt: new Date(notBeforeAtMs).toISOString(),
      notBeforeAtMs,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      status: "issued",
    };
    await writeRecord(recordPath(activeDir(), hash), record, true);
    intents.push({ token: rawToken, issuedAt: record.issuedAt, notBeforeAt: record.notBeforeAt, expiresAt: record.expiresAt });
  }
  await safeAudit({ packageId: input.packageId, eventType: "security.bot_intents_issued", context, payload: { count, authorizationMode: input.authorizationMode, minimumHumanMs: config.minimumHumanMs, expiresAt: new Date(expiresAtMs).toISOString() } });
  return { intents, guard: { hardBlockMs: config.hardBlockMs, minimumHumanMs: config.minimumHumanMs, expiresAt: new Date(expiresAtMs).toISOString() } };
}

async function moveToConsumed(record: IntentRecord, status: IntentStatus, nowMs: number, reason?: string) {
  const source = recordPath(activeDir(), record.tokenHash);
  const target = recordPath(consumedDir(), record.tokenHash);
  const consumed = { ...record, status, reason, consumedAt: new Date(nowMs).toISOString(), elapsedMs: Math.max(0, nowMs - record.issuedAtMs) };
  try {
    await rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new DropRobotGuardError("A feltöltési engedély már fel lett használva.", "DROP_BOT_INTENT_REPLAY", 409);
    }
    throw error;
  }
  await writeRecord(target, consumed);
  return consumed;
}

export async function consumeDropUploadIntent(input: {
  rawToken: unknown;
  packageId: string;
  authorizationMode: DropRobotAuthorizationMode;
  authFingerprint: string;
  honeypot: unknown;
  headers: Headers;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const config = getDropRobotGuardConfig();
  const context = getDropRobotRequestContext(input.headers);
  const rawToken = typeof input.rawToken === "string" ? input.rawToken.trim() : "";
  if (!rawToken.startsWith(TOKEN_PREFIX) || rawToken.length < 40 || rawToken.length > 200) {
    throw new DropRobotGuardError("Hiányzó vagy érvénytelen feltöltési biztonsági engedély.", "DROP_BOT_INTENT_INVALID", 403);
  }
  await ensureDirs();
  const hash = tokenHash(rawToken);
  const activePath = recordPath(activeDir(), hash);
  const consumedPath = recordPath(consumedDir(), hash);
  const record = await readRecord(activePath);
  if (!record) {
    if (await readRecord(consumedPath)) {
      await safeAudit({ packageId: input.packageId, eventType: "security.bot_intent_replay_blocked", severity: "warning", context, payload: { authorizationMode: input.authorizationMode } });
      throw new DropRobotGuardError("A feltöltési engedély már fel lett használva.", "DROP_BOT_INTENT_REPLAY", 409);
    }
    throw new DropRobotGuardError("A feltöltési engedély nem található vagy lejárt.", "DROP_BOT_INTENT_NOT_FOUND", 403);
  }
  const contextMatches = record.packageId === input.packageId && record.authorizationMode === input.authorizationMode && record.authFingerprint === input.authFingerprint;
  if (!contextMatches) {
    await moveToConsumed(record, "blocked_context", nowMs, "context_mismatch");
    await safeAudit({ packageId: record.packageId, eventType: "security.bot_intent_context_blocked", severity: "error", context, payload: { requestedPackageId: input.packageId, requestedMode: input.authorizationMode } });
    throw new DropRobotGuardError("A feltöltési engedély nem ehhez a csomaghoz vagy munkamenethez tartozik.", "DROP_BOT_INTENT_CONTEXT_MISMATCH", 403);
  }
  if (record.expiresAtMs <= nowMs) {
    await moveToConsumed(record, "expired", nowMs, "expired");
    throw new DropRobotGuardError("A feltöltési biztonsági engedély lejárt. Indítsa újra a feltöltést.", "DROP_BOT_INTENT_EXPIRED", 410);
  }
  const honeypot = typeof input.honeypot === "string" ? input.honeypot.trim() : "";
  if (honeypot) {
    await moveToConsumed(record, "blocked_honeypot", nowMs, "honeypot_filled");
    await safeAudit({ packageId: input.packageId, eventType: "security.bot_honeypot_blocked", severity: "critical", context, payload: { authorizationMode: input.authorizationMode } });
    throw new DropRobotGuardError("A feltöltési kérés automatikus műveletként blokkolva lett.", "DROP_BOT_HONEYPOT_BLOCKED", 403);
  }
  const elapsedMs = nowMs - record.issuedAtMs;
  if (elapsedMs < config.hardBlockMs) {
    await moveToConsumed(record, "blocked_too_fast", nowMs, "hard_timing_threshold");
    await safeAudit({ packageId: input.packageId, eventType: "security.bot_timing_blocked", severity: "critical", context, payload: { elapsedMs, thresholdMs: config.hardBlockMs, authorizationMode: input.authorizationMode } });
    throw new DropRobotGuardError("A feltöltési művelet emberileg nem lehetséges sebességgel indult, ezért blokkolva lett.", "DROP_BOT_TIMING_BLOCKED", 429, config.minimumHumanMs - elapsedMs);
  }
  if (elapsedMs < config.minimumHumanMs) {
    const retryAfterMs = config.minimumHumanMs - elapsedMs;
    await safeAudit({ packageId: input.packageId, eventType: "security.bot_timing_delayed", severity: "warning", context, payload: { elapsedMs, minimumHumanMs: config.minimumHumanMs, retryAfterMs } });
    throw new DropRobotGuardError("A feltöltési biztonsági ellenőrzés még tart. Próbálja újra rövid várakozás után.", "DROP_BOT_TIMING_TOO_EARLY", 425, retryAfterMs);
  }
  const consumed = await moveToConsumed(record, "consumed", nowMs);
  await safeAudit({ packageId: input.packageId, eventType: "security.bot_intent_consumed", context, payload: { elapsedMs: consumed.elapsedMs, authorizationMode: input.authorizationMode, ipChanged: record.ipHash !== context.ipHash } });
  return { ok: true, elapsedMs: consumed.elapsedMs || elapsedMs, intentId: record.id };
}

export function getDropRobotGuardSafeStatus() {
  const config = getDropRobotGuardConfig();
  return { enabled: true, serverTimed: true, oneTimeIntent: true, honeypot: true, hardBlockMs: config.hardBlockMs, minimumHumanMs: config.minimumHumanMs, intentTtlSeconds: Math.round(config.ttlMs / 1000), batchMax: config.batchMax, activeUploadSessionLimit: config.activeUploadSessionLimit };
}
