import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProtectedTelemetryNodeId } from "./protected-telemetry-ingress";

const SECRET_DIR = "/root/.dimpro-secrets/protected-telemetry";
const ENROLLMENT_TTL_MS = 10 * 60_000;
const EXPECTED_SOURCE_IP: Record<ProtectedTelemetryNodeId, string> = {
  "prod-vps": "213.160.68.24",
  "db-vps": "213.160.68.33",
};

type EnrollmentState = { schemaVersion: 1; nodeId: ProtectedTelemetryNodeId; nonce: string; issuedAt: string };

export function nodeTelemetryKeyFile(nodeId: ProtectedTelemetryNodeId) {
  return path.join(SECRET_DIR, `${nodeId}.key`);
}
function enrollmentStateFile(nodeId: ProtectedTelemetryNodeId) {
  return path.join(SECRET_DIR, `${nodeId}.enrollment.json`);
}
function cleanIp(value: string | null) {
  const raw = String(value || "").trim();
  if (raw.startsWith("::ffff:")) return raw.slice("::ffff:".length);
  return raw;
}
export function requestSourceIp(headers: Headers) {
  return cleanIp(headers.get("x-real-ip"));
}
export function sourceIpAllowed(nodeId: ProtectedTelemetryNodeId, headers: Headers) {
  const actual = requestSourceIp(headers);
  const expected = EXPECTED_SOURCE_IP[nodeId];
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function validNonce(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value);
}
async function readState(nodeId: ProtectedTelemetryNodeId): Promise<EnrollmentState | null> {
  try {
    const parsed = JSON.parse(await readFile(enrollmentStateFile(nodeId), "utf8")) as EnrollmentState;
    if (parsed?.schemaVersion === 1 && parsed.nodeId === nodeId && validNonce(parsed.nonce) && Number.isFinite(Date.parse(parsed.issuedAt))) return parsed;
  } catch {}
  return null;
}
async function keyExists(nodeId: ProtectedTelemetryNodeId) {
  try { const s = await stat(nodeTelemetryKeyFile(nodeId)); return s.isFile() && s.size >= 32; } catch { return false; }
}
export async function readNodeTelemetryKey(nodeId: ProtectedTelemetryNodeId) {
  try { return (await readFile(nodeTelemetryKeyFile(nodeId), "utf8")).trim(); } catch { return ""; }
}
export async function enrollProtectedTelemetryNode(input: { nodeId: ProtectedTelemetryNodeId; nonce: unknown }, headers: Headers) {
  if (!sourceIpAllowed(input.nodeId, headers)) throw Object.assign(new Error("A protected telemetry enrollment csak a regisztrált VPS forráscíméről engedélyezett."), { code: "PROTECTED_TELEMETRY_ENROLL_SOURCE_DENIED", status: 403 });
  if (!validNonce(input.nonce)) throw Object.assign(new Error("Érvénytelen enrollment nonce."), { code: "PROTECTED_TELEMETRY_ENROLL_NONCE_INVALID", status: 400 });
  await mkdir(SECRET_DIR, { recursive: true, mode: 0o700 });
  const now = Date.now();
  const state = await readState(input.nodeId);
  const hasKey = await keyExists(input.nodeId);
  if (hasKey && state && state.nonce === input.nonce && now - Date.parse(state.issuedAt) <= ENROLLMENT_TTL_MS) {
    const key = await readNodeTelemetryKey(input.nodeId);
    if (key.length >= 32) return { nodeId: input.nodeId, key, issuedAt: state.issuedAt, replayWindow: true };
  }
  if (hasKey) throw Object.assign(new Error("A protected telemetry node már regisztrálva van; újraregisztráláshoz admin reset szükséges."), { code: "PROTECTED_TELEMETRY_ALREADY_ENROLLED", status: 409 });
  const key = randomBytes(48).toString("base64url");
  const issuedAt = new Date(now).toISOString();
  await writeFile(nodeTelemetryKeyFile(input.nodeId), `${key}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await writeFile(enrollmentStateFile(input.nodeId), `${JSON.stringify({ schemaVersion: 1, nodeId: input.nodeId, nonce: input.nonce, issuedAt }, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "w" });
  return { nodeId: input.nodeId, key, issuedAt, replayWindow: false };
}
