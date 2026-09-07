import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProtectedTelemetryNodeId } from "./protected-telemetry-ingress";

const SECRET_DIR = process.env.BENJADMIN_PROTECTED_TELEMETRY_SECRET_DIR?.trim() || "/root/.dimpro-secrets/protected-telemetry";
const ENROLLMENT_TTL_MS = 10 * 60_000;
const EXPECTED_SOURCE_IP: Record<ProtectedTelemetryNodeId, string> = {
  "prod-vps": "213.160.68.24",
  "db-vps": "213.160.68.33",
};

type EnrollmentState = { schemaVersion: 2; nodeId: ProtectedTelemetryNodeId; codeDigest: string; issuedAt: string; expiresAt: string; consumedAt: string | null };
function fail(code: string, message: string, status = 400): never { throw Object.assign(new Error(message), { code, status }); }
function validNode(value: unknown): value is ProtectedTelemetryNodeId { return value === "prod-vps" || value === "db-vps"; }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function digest(code: string) { return createHash("sha256").update(code, "utf8").digest("hex"); }
export function nodeTelemetryKeyFile(nodeId: ProtectedTelemetryNodeId) { return path.join(SECRET_DIR, `${nodeId}.key`); }
function enrollmentStateFile(nodeId: ProtectedTelemetryNodeId) { return path.join(SECRET_DIR, `${nodeId}.enrollment.json`); }
function lockFile(nodeId: ProtectedTelemetryNodeId) { return path.join(SECRET_DIR, `${nodeId}.enrollment.lock`); }
function cleanIp(value: string | null) { const raw = String(value || "").trim(); return raw.startsWith("::ffff:") ? raw.slice(7) : raw; }
// x-real-ip must be overwritten by the trusted DEV nginx proxy; forwarded headers are never used as authorization.
export function requestSourceIp(headers: Headers) { return cleanIp(headers.get("x-real-ip")); }
export function sourceIpAllowed(nodeId: ProtectedTelemetryNodeId, headers: Headers) { return safeEqual(requestSourceIp(headers), EXPECTED_SOURCE_IP[nodeId]); }
function validCode(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_-]{40,128}$/.test(value); }
function validNonce(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value); }
async function ensureDir() { await mkdir(SECRET_DIR, { recursive: true, mode: 0o700 }); await chmod(SECRET_DIR, 0o700); }
async function atomicState(nodeId: ProtectedTelemetryNodeId, state: EnrollmentState) {
  const file = enrollmentStateFile(nodeId); const temp = path.join(SECRET_DIR, `.${nodeId}.${randomBytes(8).toString("hex")}.tmp`);
  try { await writeFile(temp, JSON.stringify(state) + "\n", { mode: 0o600, flag: "wx" }); await rename(temp, file); await chmod(file, 0o600); }
  finally { await unlink(temp).catch(() => undefined); }
}
async function withNodeLock<T>(nodeId: ProtectedTelemetryNodeId, action: () => Promise<T>): Promise<T> {
  await ensureDir();
  let handle;
  try { handle = await open(lockFile(nodeId), "wx", 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("PROTECTED_TELEMETRY_ENROLL_BUSY", "A regisztráció már folyamatban van; ismétlés előtt ellenőrizd az állapotát.", 409); throw error; }
  try { return await action(); }
  finally { await handle.close(); await unlink(lockFile(nodeId)).catch(() => undefined); }
}
async function readState(nodeId: ProtectedTelemetryNodeId): Promise<EnrollmentState | null> {
  try { const value = JSON.parse(await readFile(enrollmentStateFile(nodeId), "utf8")); return value?.schemaVersion === 2 && value.nodeId === nodeId && /^[0-9a-f]{64}$/.test(value.codeDigest) && Number.isFinite(Date.parse(value.expiresAt)) ? value as EnrollmentState : null; }
  catch { return null; }
}
async function keyExists(nodeId: ProtectedTelemetryNodeId) { try { const s = await stat(nodeTelemetryKeyFile(nodeId)); return s.isFile() && s.size >= 32; } catch { return false; } }
export async function readNodeTelemetryKey(nodeId: ProtectedTelemetryNodeId) { try { return (await readFile(nodeTelemetryKeyFile(nodeId), "utf8")).trim(); } catch { return ""; } }
export async function getProtectedTelemetryEnrollmentStatus() {
  const now = Date.now();
  return Promise.all((["prod-vps", "db-vps"] as const).map(async nodeId => {
    const [registered, state] = await Promise.all([keyExists(nodeId), readState(nodeId)]);
    return { nodeId, registered, enrollmentPending: !registered && Boolean(state && !state.consumedAt && Date.parse(state.expiresAt) > now), expiresAt: !registered && state && !state.consumedAt && Date.parse(state.expiresAt) > now ? state.expiresAt : null };
  }));
}
export async function prepareProtectedTelemetryEnrollment(nodeId: ProtectedTelemetryNodeId) {
  if (!validNode(nodeId)) fail("PROTECTED_TELEMETRY_NODE_INVALID", "Ismeretlen telemetria-node.");
  return withNodeLock(nodeId, async () => {
    if (await keyExists(nodeId)) fail("PROTECTED_TELEMETRY_ALREADY_ENROLLED", "A node már regisztrálva van; a meglévő kulcsot nem írjuk felül.", 409);
    const code = randomBytes(32).toString("base64url"); const issuedAt = new Date().toISOString(); const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString();
    await atomicState(nodeId, { schemaVersion: 2, nodeId, codeDigest: digest(code), issuedAt, expiresAt, consumedAt: null });
    return { nodeId, code, expiresAt };
  });
}
export async function enrollProtectedTelemetryNode(input: { nodeId: ProtectedTelemetryNodeId; nonce: unknown; enrollmentCode?: unknown }, headers: Headers) {
  if (!validNode(input.nodeId)) fail("PROTECTED_TELEMETRY_NODE_INVALID", "Ismeretlen telemetria-node.");
  if (!sourceIpAllowed(input.nodeId, headers)) fail("PROTECTED_TELEMETRY_ENROLL_SOURCE_DENIED", "A regisztráció csak a jóváhagyott VPS forráscíméről engedélyezett.", 403);
  if (!validNonce(input.nonce) || !validCode(input.enrollmentCode)) fail("PROTECTED_TELEMETRY_ENROLL_CODE_INVALID", "Érvénytelen regisztrációs kérelem.", 400);
  return withNodeLock(input.nodeId, async () => {
    if (await keyExists(input.nodeId)) fail("PROTECTED_TELEMETRY_ALREADY_ENROLLED", "A node már regisztrálva van.", 409);
    const state = await readState(input.nodeId);
    if (!state || state.consumedAt || Date.now() >= Date.parse(state.expiresAt) || !safeEqual(state.codeDigest, digest(input.enrollmentCode as string))) fail("PROTECTED_TELEMETRY_ENROLL_NOT_APPROVED", "Nincs érvényes admin-jóváhagyás ehhez a node-hoz.", 403);
    const key = randomBytes(48).toString("base64url");
    await writeFile(nodeTelemetryKeyFile(input.nodeId), key + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    await atomicState(input.nodeId, { ...state, consumedAt: new Date().toISOString() });
    return { nodeId: input.nodeId, key, issuedAt: state.issuedAt, replayWindow: false };
  });
}
