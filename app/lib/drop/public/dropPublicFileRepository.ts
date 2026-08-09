import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDropSecurityFingerprint, hashDropToken } from "../dropCrypto";
import type {
  DropDownloadProtection,
  DropPackageWorkflowRecord,
  DropPublicLimits,
  DropPublicRecipient,
  DropPublicSessionRecord,
  DropPublicState,
  DropPublicWorkflowType,
  DropSendCodeRecord,
  DropSendCodeSafeRecord,
  DropSubmissionGateRecord,
  DropSubmissionGateType,
} from "./dropPublicTypes";
import {
  formatDropSendCode,
  isCompleteDropSendCode,
  normalizeDropSendCode,
} from "./dropSendCodeFormat";

const STATE_VERSION = "DROP_PUBLIC_V094" as const;
const DEFAULT_PUBLIC_LIMITS: DropPublicLimits = {
  maxFileCount: 50,
  maxFileSizeBytes: 250 * 1024 * 1024,
  maxTotalSizeBytes: 250 * 1024 * 1024,
};
const SESSION_TTL_MS = 30 * 60_000;
const SESSION_PREFIX = "dps_";

export class DropPublicRepositoryError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "DropPublicRepositoryError";
    this.code = code;
    this.status = status;
  }
}

function projectRoot() {
  const configured = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  const suffix = path.join(".next", "standalone");
  return cwd.endsWith(suffix) ? path.resolve(cwd, "..", "..") : cwd;
}

const dataRoot = process.env.DROP_PUBLIC_STATE_DATA_DIR?.trim()
  ? path.resolve(process.env.DROP_PUBLIC_STATE_DATA_DIR.trim())
  : path.join(projectRoot(), ".data", "dimpro-drop-public-v094");
const statePath = path.join(dataRoot, "state.json");
let mutationQueue: Promise<unknown> = Promise.resolve();

function nowIso() { return new Date().toISOString(); }
function normalizeText(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";
}
function normalizeLongText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}
function normalizeEmail(value: unknown) {
  const email = normalizeText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function normalizeDate(value: unknown, fallback: string) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}
function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function createSeed(): DropPublicState {
  return { version: STATE_VERSION, sendCodes: [], gates: [], sessions: [], packageWorkflows: [], usage: [], updatedAt: nowIso() };
}
async function ensureRoot() {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await chmod(dataRoot, 0o700).catch(() => undefined);
}
async function readState(): Promise<DropPublicState> {
  await ensureRoot();
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<DropPublicState>;
    if (parsed.version !== STATE_VERSION) throw new Error("state version mismatch");
    return {
      version: STATE_VERSION,
      sendCodes: Array.isArray(parsed.sendCodes) ? parsed.sendCodes : [],
      gates: Array.isArray(parsed.gates) ? parsed.gates : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      packageWorkflows: Array.isArray(parsed.packageWorkflows) ? parsed.packageWorkflows : [],
      usage: Array.isArray(parsed.usage) ? parsed.usage : [],
      updatedAt: parsed.updatedAt || nowIso(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new DropPublicRepositoryError(
        "A DIMPRO Drop publikus jogosultsági állapottára sérült vagy nem olvasható. A biztonságos működés leállt; kézi helyreállítás szükséges.",
        "DROP_PUBLIC_STATE_CORRUPT",
        503,
      );
    }
    const seed = createSeed();
    await writeState(seed);
    return seed;
  }
}
async function writeState(state: DropPublicState) {
  await ensureRoot();
  state.updatedAt = nowIso();
  const temporary = `${statePath}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, statePath);
  await chmod(statePath, 0o600).catch(() => undefined);
}
async function mutate<T>(work: (state: DropPublicState) => Promise<T> | T): Promise<T> {
  const next = mutationQueue.then(async () => {
    const state = await readState();
    cleanupState(state);
    const result = await work(state);
    await writeState(state);
    return result;
  });
  mutationQueue = next.catch(() => undefined);
  return next;
}
function cleanupState(state: DropPublicState, now = Date.now()) {
  state.sessions = state.sessions.filter((row) => Date.parse(row.expiresAt) > now);
  state.usage = state.usage.filter((row) => Date.parse(row.createdAt) > now - 8 * 86_400_000);
  for (const code of state.sendCodes) if (code.status === "active" && Date.parse(code.expiresAt) <= now) code.status = "expired";
  for (const gate of state.gates) if (gate.status === "active" && Date.parse(gate.expiresAt) <= now) gate.status = "expired";
}

export const normalizeDropPublicCode = normalizeDropSendCode;
export const formatDropPublicCode = formatDropSendCode;
function codeMaterial(code: string) {
  return createDropSecurityFingerprint("drop-public-send-code", code);
}
function hashCode(code: string, salt = randomBytes(16).toString("hex")) {
  const normalized = normalizeDropPublicCode(code);
  if (!isCompleteDropSendCode(normalized)) throw new DropPublicRepositoryError("A küldési jogosultságkód formátuma érvénytelen.", "DROP_SEND_CODE_INVALID", 400);
  const hash = scryptSync(codeMaterial(normalized), salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  return { hash, salt };
}
function verifyCode(code: string, expectedHash: string, salt: string) {
  try {
    const actual = Buffer.from(hashCode(code, salt).hash, "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
function generateCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const letters = Array.from(randomBytes(4), (value) => alphabet[value % alphabet.length]).join("");
  const digits = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `${letters}${digits}`;
}
function safeCode(row: DropSendCodeRecord): DropSendCodeSafeRecord {
  const { codeHash: _codeHash, codeSalt: _codeSalt, ...safe } = row;
  void _codeHash; void _codeSalt;
  return safe;
}
function activeStatus(status: string, expiresAt: string) {
  return status === "active" && Date.parse(expiresAt) > Date.now();
}
function normalizeRecipients(value: unknown, maxRecipients: number): DropPublicRecipient[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, DropPublicRecipient>();
  for (const raw of value.slice(0, maxRecipients * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const email = normalizeEmail(item.email);
    const name = normalizeText(item.name, 160);
    if (!email || !name || unique.has(email)) continue;
    unique.set(email, {
      id: normalizeText(item.id, 100) || `recipient_${randomUUID().slice(0, 12)}`,
      name,
      email,
      label: normalizeText(item.label, 160) || undefined,
      company: normalizeText(item.company, 160) || undefined,
      projectRole: normalizeText(item.projectRole, 160) || undefined,
    });
    if (unique.size >= maxRecipients) break;
  }
  return [...unique.values()];
}

export async function getDropPublicStateSafe() {
  const state = await readState();
  cleanupState(state);
  return {
    version: state.version,
    sendCodes: state.sendCodes.map(safeCode),
    gates: state.gates,
    activeSessions: state.sessions.length,
    packageWorkflowCount: state.packageWorkflows.length,
    updatedAt: state.updatedAt,
  };
}

export async function createDropSendCode(input: Record<string, unknown>, actor: string) {
  const rawCode = normalizeDropPublicCode(input.code) || generateCode();
  const label = normalizeText(input.label, 160);
  if (label.length < 2) throw new DropPublicRepositoryError("A küldési kód megnevezése legalább két karakter legyen.", "DROP_SEND_CODE_LABEL_REQUIRED", 400);
  const expiresAt = normalizeDate(input.expiresAt, new Date(Date.now() + 180 * 86_400_000).toISOString());
  if (Date.parse(expiresAt) <= Date.now()) throw new DropPublicRepositoryError("A küldési kód lejárata csak jövőbeli lehet.", "DROP_SEND_CODE_EXPIRY_INVALID", 400);
  const hashed = hashCode(rawCode);
  const created = await mutate((state) => {
    if (state.sendCodes.some((row) => row.status === "active" && verifyCode(rawCode, row.codeHash, row.codeSalt))) {
      throw new DropPublicRepositoryError("Ez a küldési kód már aktív.", "DROP_SEND_CODE_DUPLICATE", 409);
    }
    const now = nowIso();
    const row: DropSendCodeRecord = {
      id: `sendcode_${randomUUID().slice(0, 12)}`,
      label,
      codeHash: hashed.hash,
      codeSalt: hashed.salt,
      codeHint: `***-${rawCode.slice(-3)}`,
      status: "active",
      expiresAt,
      maxPackagesPerDay: integer(input.maxPackagesPerDay, 10, 1, 100),
      maxBytesPerDay: integer(input.maxBytesPerDay, 2 * 1024 * 1024 * 1024, DEFAULT_PUBLIC_LIMITS.maxTotalSizeBytes, 50 * 1024 * 1024 * 1024),
      maxRecipients: integer(input.maxRecipients, 10, 1, 20),
      defaultRetentionDays: integer(input.defaultRetentionDays, 5, 1, 7),
      createdBy: normalizeText(actor, 160) || "DIMPRO admin",
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    };
    state.sendCodes.unshift(row);
    return row;
  });
  return { record: safeCode(created), rawCode, formattedCode: formatDropPublicCode(rawCode) };
}

export async function listDropSendCodes() {
  const state = await readState(); cleanupState(state);
  return state.sendCodes.map(safeCode);
}
export async function getDropSendCodeById(id: string) {
  const state = await readState(); cleanupState(state);
  const row = state.sendCodes.find((item) => item.id === id && activeStatus(item.status, item.expiresAt));
  if (!row) throw new DropPublicRepositoryError("A küldési jogosultság lejárt vagy vissza lett vonva.", "DROP_SEND_CODE_NOT_AVAILABLE", 403);
  return safeCode(row);
}

export async function setDropSendCodeStatus(id: string, status: "active" | "revoked") {
  return mutate((state) => {
    const row = state.sendCodes.find((item) => item.id === id);
    if (!row) throw new DropPublicRepositoryError("A küldési kód nem található.", "DROP_SEND_CODE_NOT_FOUND", 404);
    row.status = status;
    row.updatedAt = nowIso();
    row.revokedAt = status === "revoked" ? row.updatedAt : null;
    return safeCode(row);
  });
}

export async function verifyDropSendCode(rawCode: unknown) {
  const code = normalizeDropPublicCode(rawCode);
  if (!isCompleteDropSendCode(code)) throw new DropPublicRepositoryError("A DIMPRO Send küldési jogosultságkód megadása kötelező.", "DROP_SEND_CODE_REQUIRED", 400);
  const state = await readState(); cleanupState(state);
  const row = state.sendCodes.find((item) => activeStatus(item.status, item.expiresAt) && verifyCode(code, item.codeHash, item.codeSalt));
  if (!row) throw new DropPublicRepositoryError("A küldési kód hibás, lejárt vagy vissza lett vonva.", "DROP_SEND_CODE_DENIED", 403);
  const today = new Date().toISOString().slice(0, 10);
  const usage = state.usage.filter((item) => item.sendCodeId === row.id && item.createdAt.slice(0, 10) === today);
  if (usage.length >= row.maxPackagesPerDay) throw new DropPublicRepositoryError("A küldési kód elérte a napi küldeménylimitet.", "DROP_SEND_CODE_DAILY_PACKAGE_LIMIT", 429);
  const usedBytes = usage.reduce((sum, item) => sum + item.reservedBytes, 0);
  if (usedBytes + DEFAULT_PUBLIC_LIMITS.maxTotalSizeBytes > row.maxBytesPerDay) {
    throw new DropPublicRepositoryError("A küldési kód elérte a napi adatkeretet.", "DROP_SEND_CODE_DAILY_BYTES_LIMIT", 429);
  }
  return safeCode(row);
}

export async function createDropSubmissionGate(input: Record<string, unknown>, actor: string) {
  const type = (["personal", "project", "organization"] as const).includes(input.type as DropSubmissionGateType)
    ? input.type as DropSubmissionGateType : "personal";
  const title = normalizeText(input.title, 200);
  if (title.length < 3) throw new DropPublicRepositoryError("A Beküldőkapu címe legalább három karakter legyen.", "DROP_GATE_TITLE_REQUIRED", 400);
  const recipients = normalizeRecipients(input.recipients, 30);
  if (!recipients.length) throw new DropPublicRepositoryError("A Beküldőkapuhoz legalább egy címzett szükséges.", "DROP_GATE_RECIPIENT_REQUIRED", 400);
  if (type !== "organization" && recipients.length !== 1) {
    throw new DropPublicRepositoryError("Személyes vagy projektkapunál pontosan egy előre rögzített címzett szükséges.", "DROP_GATE_SINGLE_RECIPIENT_REQUIRED", 400);
  }
  const expiresAt = normalizeDate(input.expiresAt, new Date(Date.now() + 90 * 86_400_000).toISOString());
  if (Date.parse(expiresAt) <= Date.now()) throw new DropPublicRepositoryError("A Beküldőkapu lejárata csak jövőbeli lehet.", "DROP_GATE_EXPIRY_INVALID", 400);
  const requestedSlug = normalizeText(input.slug, 100).toLowerCase().replace(/[^a-z0-9áéíóöőúüű-]+/gi, "-").replace(/^-+|-+$/g, "");
  return mutate((state) => {
    let slug = requestedSlug || `${type}-${randomBytes(5).toString("hex")}`;
    if (state.gates.some((row) => row.slug === slug)) slug = `${slug}-${randomBytes(3).toString("hex")}`;
    const now = nowIso();
    const row: DropSubmissionGateRecord = {
      id: `gate_${randomUUID().slice(0, 12)}`,
      slug,
      type,
      title,
      description: normalizeLongText(input.description, 2_000),
      status: "active",
      recipients,
      projectId: normalizeText(input.projectId, 160) || null,
      projectName: normalizeText(input.projectName, 240) || null,
      targetFolder: normalizeText(input.targetFolder, 500) || null,
      limits: { ...DEFAULT_PUBLIC_LIMITS },
      retentionDays: integer(input.retentionDays, 5, 1, 7),
      requireSenderEmail: true,
      allowPackageComment: input.allowPackageComment !== false,
      allowFileComments: input.allowFileComments !== false,
      downloadProtection: input.downloadProtection === "link" ? "link" : "link_pin",
      expiresAt,
      createdBy: normalizeText(actor, 160) || "DIMPRO admin",
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    };
    state.gates.unshift(row);
    return row;
  });
}

export async function listDropSubmissionGates() {
  const state = await readState(); cleanupState(state); return state.gates;
}
export async function getDropSubmissionGateBySlug(slug: string) {
  const state = await readState(); cleanupState(state);
  const row = state.gates.find((item) => item.slug === slug && activeStatus(item.status, item.expiresAt));
  if (!row) throw new DropPublicRepositoryError("A Beküldőkapu nem található, lejárt vagy lezárt.", "DROP_GATE_NOT_AVAILABLE", 404);
  return row;
}
export async function getDropSubmissionGateById(id: string) {
  const state = await readState(); cleanupState(state);
  const row = state.gates.find((item) => item.id === id && activeStatus(item.status, item.expiresAt));
  if (!row) throw new DropPublicRepositoryError("A Beküldőkapu lejárt vagy lezárt.", "DROP_GATE_NOT_AVAILABLE", 404);
  return row;
}
export async function setDropSubmissionGateStatus(id: string, status: "active" | "revoked") {
  return mutate((state) => {
    const row = state.gates.find((item) => item.id === id);
    if (!row) throw new DropPublicRepositoryError("A Beküldőkapu nem található.", "DROP_GATE_NOT_FOUND", 404);
    row.status = status; row.updatedAt = nowIso(); row.revokedAt = status === "revoked" ? row.updatedAt : null; return row;
  });
}

export function getDropPublicRequestContext(headers: Headers) {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
  return {
    ipHash: createDropSecurityFingerprint("drop-public-ip", ip),
    userAgentSummary: (headers.get("user-agent") || "unknown").replace(/[\r\n]/g, " ").slice(0, 240),
  };
}

export async function createDropPublicSession(input: {
  workflowType: DropPublicWorkflowType;
  sendCodeId?: string | null;
  dimproSendEntitlementId?: string | null;
  gateId?: string | null;
  headers: Headers;
}) {
  const rawToken = `${SESSION_PREFIX}${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashDropToken(rawToken);
  const context = getDropPublicRequestContext(input.headers);
  const record = await mutate((state) => {
    const now = nowIso();
    const row: DropPublicSessionRecord = {
      id: `publicsession_${randomUUID().slice(0, 12)}`,
      tokenHash,
      workflowType: input.workflowType,
      sendCodeId: input.sendCodeId || null,
      dimproSendEntitlementId: input.dimproSendEntitlementId || null,
      gateId: input.gateId || null,
      ipHash: context.ipHash,
      userAgentSummary: context.userAgentSummary,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      packageId: null,
      createdAt: now,
      updatedAt: now,
      usedAt: null,
    };
    state.sessions.push(row); return row;
  });
  return { rawToken, record };
}

export async function resolveDropPublicSession(rawToken: string, headers: Headers, expected?: DropPublicWorkflowType, allowBoundContextRebind = false) {
  if (!rawToken.startsWith(SESSION_PREFIX) || rawToken.length < 30) throw new DropPublicRepositoryError("A publikus Drop munkamenet hiányzik.", "DROP_PUBLIC_SESSION_REQUIRED", 401);
  const hash = hashDropToken(rawToken);
  const context = getDropPublicRequestContext(headers);
  return mutate((state) => {
    const session = state.sessions.find((row) => row.tokenHash === hash && Date.parse(row.expiresAt) > Date.now());
    if (!session) throw new DropPublicRepositoryError("A publikus Drop munkamenet lejárt vagy nem érvényes.", "DROP_PUBLIC_SESSION_INVALID", 401);
    if (expected && session.workflowType !== expected) throw new DropPublicRepositoryError("A munkamenet nem ehhez a művelethez tartozik.", "DROP_PUBLIC_SESSION_PURPOSE_MISMATCH", 403);
    if (session.ipHash !== context.ipHash) {
      if (!allowBoundContextRebind || !session.packageId || session.userAgentSummary !== context.userAgentSummary) {
        throw new DropPublicRepositoryError("A publikus Drop munkamenet hálózati környezete megváltozott.", "DROP_PUBLIC_SESSION_CONTEXT_CHANGED", 401);
      }
      session.ipHash = context.ipHash;
      session.updatedAt = nowIso();
    }
    return session;
  });
}

export async function bindDropPublicSessionPackage(rawToken: string, packageId: string, reservedBytes: number) {
  const hash = hashDropToken(rawToken);
  return mutate((state) => {
    const session = state.sessions.find((row) => row.tokenHash === hash && Date.parse(row.expiresAt) > Date.now());
    if (!session) throw new DropPublicRepositoryError("A publikus Drop munkamenet lejárt.", "DROP_PUBLIC_SESSION_INVALID", 401);
    if (session.packageId && session.packageId !== packageId) throw new DropPublicRepositoryError("Ezzel a munkamenettel már létrejött egy küldemény.", "DROP_PUBLIC_SESSION_ALREADY_BOUND", 409);
    session.packageId = packageId; session.usedAt = session.usedAt || nowIso(); session.updatedAt = nowIso();
    if (session.sendCodeId && !state.usage.some((row) => row.packageId === packageId)) {
      state.usage.push({ id: `usage_${randomUUID().slice(0, 12)}`, sendCodeId: session.sendCodeId, packageId, reservedBytes: Math.max(0, reservedBytes), createdAt: nowIso() });
    }
    return session;
  });
}

export async function saveDropPackageWorkflow(input: Omit<DropPackageWorkflowRecord, "createdAt" | "updatedAt">) {
  return mutate((state) => {
    const existing = state.packageWorkflows.find((row) => row.packageId === input.packageId);
    const now = nowIso();
    if (existing) { Object.assign(existing, input, { updatedAt: now }); return existing; }
    const row: DropPackageWorkflowRecord = { ...input, createdAt: now, updatedAt: now };
    state.packageWorkflows.push(row); return row;
  });
}
export async function getDropPackageWorkflow(packageId: string) {
  const state = await readState(); return state.packageWorkflows.find((row) => row.packageId === packageId) || null;
}
export async function updateDropPackageWorkflow(packageId: string, patch: Partial<DropPackageWorkflowRecord>) {
  return mutate((state) => {
    const row = state.packageWorkflows.find((item) => item.packageId === packageId);
    if (!row) throw new DropPublicRepositoryError("A küldemény workflow-adata nem található.", "DROP_PUBLIC_WORKFLOW_NOT_FOUND", 404);
    Object.assign(row, patch, { packageId, updatedAt: nowIso() }); return row;
  });
}
export async function claimDropPackageFinalization(packageId: string) {
  return mutate((state) => {
    const row = state.packageWorkflows.find((item) => item.packageId === packageId);
    if (!row) throw new DropPublicRepositoryError("A küldemény workflow-adata nem található.", "DROP_PUBLIC_WORKFLOW_NOT_FOUND", 404);
    if (row.finalizedAt) return { state: "finalized" as const, workflow: row };
    if (row.notificationStatus === "pending" && Date.parse(row.updatedAt) > Date.now() - 5 * 60_000) {
      throw new DropPublicRepositoryError("A küldemény véglegesítése már folyamatban van.", "DROP_PUBLIC_FINALIZE_IN_PROGRESS", 409);
    }
    row.notificationStatus = "pending";
    row.notificationDetail = "A vírusellenőrzött küldemény kézbesítése folyamatban van.";
    row.updatedAt = nowIso();
    return { state: "claimed" as const, workflow: row };
  });
}

export function getDropPublicDefaults() {
  return { limits: { ...DEFAULT_PUBLIC_LIMITS }, sessionTtlSeconds: SESSION_TTL_MS / 1000 };
}
export function normalizeDropDownloadProtection(value: unknown): DropDownloadProtection {
  return value === "link" ? "link" : "link_pin";
}

export async function getDropPublicFileStateForMigration(): Promise<DropPublicState> {
  const state = await readState();
  cleanupState(state);
  return structuredClone(state);
}

export async function getDropPublicFileStoreSummary() {
  const state = await readState();
  cleanupState(state);
  const activeSessions = state.sessions.filter((row) => Date.parse(row.expiresAt) > Date.now()).length;
  const counts = {
    sendCodes: state.sendCodes.length,
    gates: state.gates.length,
    sessions: activeSessions,
    workflows: state.packageWorkflows.length,
    usage: state.usage.length,
  };
  return {
    version: state.version,
    counts,
    migratableRecordCount: Object.values(counts).reduce((sum, value) => sum + value, 0),
    updatedAt: state.updatedAt,
    dataRoot,
    statePath,
  };
}
