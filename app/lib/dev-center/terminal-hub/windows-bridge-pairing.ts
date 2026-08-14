import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTerminalHubFeatureFlags } from "./config";
import { WINDOWS_BRIDGE_PAIRING_MAX_AGE_SECONDS, WINDOWS_BRIDGE_PROTOCOL_VERSION, type WindowsBridgeAgentHello, type WindowsBridgeCapability, type WindowsBridgeHeartbeat } from "./windows-bridge";
import { createWindowsBridgePairingCode, createWindowsBridgeToken, hashWindowsBridgePairingCode, hashWindowsBridgeToken, safeWindowsBridgeHashEqual, WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT } from "./windows-bridge-pairing-core";

const MAX_DEVICE_LABEL = 160;
const MAX_VERSION = 120;

export class WindowsBridgePairingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

type Row = Record<string, unknown>;

export type WindowsBridgeDeviceSummary = {
  id: string;
  agentId: string;
  deviceLabel: string;
  osVersion: string;
  powershellVersion: string;
  capabilities: WindowsBridgeCapability[];
  status: "pending" | "approved" | "active" | "revoked" | "blocked";
  approvedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new WindowsBridgePairingError("BRIDGE_DATABASE_NOT_CONFIGURED", "A Windows Bridge DEV adatbázis-kapcsolata nincs konfigurálva.", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "benjadmin-windows-bridge/0.1.0" } } });
}

function pairingSecret() {
  const secret = process.env.BENJADMIN_WINDOWS_BRIDGE_PAIRING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new WindowsBridgePairingError("PAIRING_SECRET_NOT_CONFIGURED", "A Windows Bridge pairing secret nincs biztonságosan konfigurálva.", 503);
  return secret;
}

export function isWindowsBridgePairingSecretConfigured() {
  return Boolean(process.env.BENJADMIN_WINDOWS_BRIDGE_PAIRING_SECRET?.trim()?.length && process.env.BENJADMIN_WINDOWS_BRIDGE_PAIRING_SECRET!.trim().length >= 32);
}

function assertBridgeEnabled() {
  const flags = getTerminalHubFeatureFlags();
  if (!flags.windowsBridgeEnabled) throw new WindowsBridgePairingError("WINDOWS_BRIDGE_DISABLED", "A Windows Bridge feature flag OFF.", 403);
}

function assertPairingEnabled() {
  const flags = getTerminalHubFeatureFlags();
  if (!flags.windowsBridgeEnabled || !flags.windowsBridgePairingEnabled) throw new WindowsBridgePairingError("WINDOWS_BRIDGE_PAIRING_DISABLED", "A Windows Bridge pairing gate OFF.", 403);
  pairingSecret();
}

function clean(value: unknown, max: number, fallback = "") { return typeof value === "string" ? value.trim().slice(0, max) : fallback; }
function validAgentId(value: string) { return /^[A-Za-z0-9._:-]{8,128}$/.test(value); }
function capabilities(value: unknown): WindowsBridgeCapability[] {
  const allowed = new Set<WindowsBridgeCapability>(["powershell", "terminal-resize", "terminal-reconnect", "raw-sanitized-audit"]);
  return Array.isArray(value) ? [...new Set(value.filter((item): item is WindowsBridgeCapability => typeof item === "string" && allowed.has(item as WindowsBridgeCapability)))].slice(0, 8) : [];
}
function mapDevice(row: Row): WindowsBridgeDeviceSummary {
  return {
    id: String(row.id), agentId: String(row.agent_id), deviceLabel: String(row.device_label), osVersion: String(row.os_version || ""), powershellVersion: String(row.powershell_version || ""),
    capabilities: capabilities(row.capabilities), status: row.status as WindowsBridgeDeviceSummary["status"], approvedAt: row.approved_at ? String(row.approved_at) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
async function audit(client: SupabaseClient, input: { action: string; entityType: string; entityId?: string | null; summary: string; metadata?: Row; actor?: string }) {
  const result = await client.from("dev_center_audit_events").insert({ id: `dev-audit-${randomUUID().slice(0, 12)}`, actor_type: "system", actor_id: input.actor || "BENJADMIN", action: input.action, entity_type: input.entityType, entity_id: input.entityId || null, summary: input.summary.slice(0, 500), metadata: input.metadata || {} });
  if (result.error) throw new WindowsBridgePairingError("BRIDGE_AUDIT_WRITE_FAILED", result.error.message, 500);
}

export async function listWindowsBridgeDevices() {
  assertBridgeEnabled();
  const client = db();
  const result = await client.from("dev_center_windows_bridge_devices").select("id,agent_id,device_label,os_version,powershell_version,capabilities,status,approved_at,last_seen_at,created_at,updated_at").order("updated_at", { ascending: false }).limit(100);
  if (result.error) throw new WindowsBridgePairingError("BRIDGE_DEVICE_LIST_FAILED", result.error.message, 500);
  return (result.data || []).map((row) => mapDevice(row as Row));
}

export async function createWindowsBridgePairing(actor = "BENJADMIN") {
  assertPairingEnabled();
  const client = db(); const pairingId = randomUUID(); const code = createWindowsBridgePairingCode();
  const expiresAt = new Date(Date.now() + WINDOWS_BRIDGE_PAIRING_MAX_AGE_SECONDS * 1000).toISOString();
  const result = await client.from("dev_center_windows_bridge_pairings").insert({ id: pairingId, code_hash: hashWindowsBridgePairingCode(pairingSecret(), pairingId, code), status: "pending", expires_at: expiresAt, attempt_count: 0, max_attempts: WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT, created_by: actor, metadata: { protocolVersion: WINDOWS_BRIDGE_PROTOCOL_VERSION } }).select("id,expires_at,max_attempts").single();
  if (result.error) throw new WindowsBridgePairingError("PAIRING_CREATE_FAILED", result.error.message, 500);
  await audit(client, { action: "WINDOWS_BRIDGE_PAIRING_CREATED", entityType: "windows_bridge_pairing", entityId: pairingId, actor, summary: "Windows Bridge egyszer használatos pairing létrehozva.", metadata: { expiresAt, maxAttempts: WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT } });
  return { pairingId, code, expiresAt, maxAttempts: WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT, protocolVersion: WINDOWS_BRIDGE_PROTOCOL_VERSION };
}

export async function claimWindowsBridgePairing(input: { pairingId: string; code: string; hello: WindowsBridgeAgentHello }) {
  assertPairingEnabled();
  const client = db(); const pairingId = clean(input.pairingId, 64); const hello = input.hello;
  const agentId = clean(hello?.agentId, 128); const deviceLabel = clean(hello?.deviceLabel, MAX_DEVICE_LABEL);
  if (hello?.protocolVersion !== WINDOWS_BRIDGE_PROTOCOL_VERSION || !validAgentId(agentId) || !deviceLabel) throw new WindowsBridgePairingError("PAIRING_AGENT_INVALID", "Érvénytelen Windows Bridge agent azonosító vagy protokoll.");
  const pairingResult = await client.from("dev_center_windows_bridge_pairings").select("id,code_hash,status,expires_at,attempt_count,max_attempts").eq("id", pairingId).maybeSingle();
  if (pairingResult.error) throw new WindowsBridgePairingError("PAIRING_LOOKUP_FAILED", pairingResult.error.message, 500);
  const pairing = pairingResult.data as Row | null;
  if (!pairing) throw new WindowsBridgePairingError("PAIRING_NOT_FOUND", "A pairing nem található.", 404);
  if (new Date(String(pairing.expires_at)).getTime() <= Date.now()) {
    await client.from("dev_center_windows_bridge_pairings").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", pairingId).eq("status", "pending");
    throw new WindowsBridgePairingError("PAIRING_EXPIRED", "A pairing kód lejárt.", 410);
  }
  if (pairing.status !== "pending") throw new WindowsBridgePairingError("PAIRING_NOT_PENDING", "A pairing már nem használható.", 409);
  const suppliedHash = hashWindowsBridgePairingCode(pairingSecret(), pairingId, input.code || "");
  if (!safeWindowsBridgeHashEqual(String(pairing.code_hash), suppliedHash)) {
    const attempts = Number(pairing.attempt_count || 0) + 1; const max = Number(pairing.max_attempts || WINDOWS_BRIDGE_PAIRING_ATTEMPT_LIMIT);
    await client.from("dev_center_windows_bridge_pairings").update({ attempt_count: attempts, status: attempts >= max ? "locked" : "pending", updated_at: new Date().toISOString() }).eq("id", pairingId).eq("status", "pending");
    throw new WindowsBridgePairingError(attempts >= max ? "PAIRING_LOCKED" : "PAIRING_CODE_INVALID", attempts >= max ? "A pairing túl sok hibás próbálkozás miatt zárolva." : "Hibás pairing kód.", 403);
  }

  const existing = await client.from("dev_center_windows_bridge_devices").select("id,status").eq("agent_id", agentId).maybeSingle();
  if (existing.error) throw new WindowsBridgePairingError("DEVICE_LOOKUP_FAILED", existing.error.message, 500);
  if (existing.data && !["revoked", "pending"].includes(String(existing.data.status))) throw new WindowsBridgePairingError("DEVICE_ALREADY_REGISTERED", "Ez a Windows Bridge agent már regisztrálva van.", 409);
  const devicePayload = { agent_id: agentId, device_label: deviceLabel, os_version: clean(hello.osVersion, MAX_VERSION), powershell_version: clean(hello.powershellVersion, MAX_VERSION), capabilities: capabilities(hello.capabilities), status: "pending", token_hash: null, token_issued_at: null, approved_at: null, approved_by: null, revoked_at: null, revoked_by: null, revoke_reason: "", updated_at: new Date().toISOString(), metadata: { protocolVersion: WINDOWS_BRIDGE_PROTOCOL_VERSION } };
  const deviceResult = existing.data
    ? await client.from("dev_center_windows_bridge_devices").update(devicePayload).eq("id", existing.data.id).select("id").single()
    : await client.from("dev_center_windows_bridge_devices").insert(devicePayload).select("id").single();
  if (deviceResult.error) throw new WindowsBridgePairingError("DEVICE_REGISTER_FAILED", deviceResult.error.message, 500);
  const deviceId = String(deviceResult.data.id); const claimToken = createWindowsBridgeToken(); const claimHash = hashWindowsBridgeToken(claimToken);
  const claimUpdate = await client.from("dev_center_windows_bridge_pairings").update({ status: "claimed", claim_token_hash: claimHash, device_id: deviceId, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", pairingId).eq("status", "pending").select("id").maybeSingle();
  if (claimUpdate.error || !claimUpdate.data) throw new WindowsBridgePairingError("PAIRING_CLAIM_RACE", "A pairing közben megváltozott, próbáld újra.", 409);
  await audit(client, { action: "WINDOWS_BRIDGE_PAIRING_CLAIMED", entityType: "windows_bridge_device", entityId: deviceId, actor: agentId, summary: "Windows Bridge agent pairing igényt nyújtott be.", metadata: { pairingId, deviceLabel, capabilities: capabilities(hello.capabilities) } });
  return { pairingId, deviceId, claimToken, status: "pending_approval" as const, expiresAt: String(pairing.expires_at) };
}

export async function approveWindowsBridgeDevice(deviceId: string, actor = "BENJADMIN") {
  assertPairingEnabled(); const client = db(); const now = new Date().toISOString();
  const result = await client.from("dev_center_windows_bridge_devices").update({ status: "approved", approved_at: now, approved_by: actor, updated_at: now }).eq("id", clean(deviceId, 64)).eq("status", "pending").select("id,agent_id,device_label").maybeSingle();
  if (result.error) throw new WindowsBridgePairingError("DEVICE_APPROVE_FAILED", result.error.message, 500);
  if (!result.data) throw new WindowsBridgePairingError("DEVICE_NOT_PENDING", "A device nem vár jóváhagyásra.", 409);
  await audit(client, { action: "WINDOWS_BRIDGE_DEVICE_APPROVED", entityType: "windows_bridge_device", entityId: String(result.data.id), actor, summary: "Windows Bridge device jóváhagyva.", metadata: { agentId: result.data.agent_id, deviceLabel: result.data.device_label } });
  return { ok: true as const };
}

export async function pollWindowsBridgeClaim(pairingId: string, claimToken: string) {
  assertPairingEnabled(); const client = db(); const claimHash = hashWindowsBridgeToken(claimToken || "");
  const result = await client.from("dev_center_windows_bridge_pairings").select("id,status,expires_at,claim_token_hash,device_id").eq("id", clean(pairingId, 64)).maybeSingle();
  if (result.error) throw new WindowsBridgePairingError("PAIRING_STATUS_FAILED", result.error.message, 500);
  const pairing = result.data as Row | null;
  if (!pairing || !pairing.claim_token_hash || !safeWindowsBridgeHashEqual(String(pairing.claim_token_hash), claimHash)) throw new WindowsBridgePairingError("CLAIM_TOKEN_INVALID", "Érvénytelen pairing claim token.", 401);
  if (new Date(String(pairing.expires_at)).getTime() <= Date.now()) throw new WindowsBridgePairingError("PAIRING_EXPIRED", "A pairing lejárt.", 410);
  const deviceId = String(pairing.device_id || "");
  const deviceResult = await client.from("dev_center_windows_bridge_devices").select("id,status,agent_id,device_label").eq("id", deviceId).maybeSingle();
  if (deviceResult.error || !deviceResult.data) throw new WindowsBridgePairingError("DEVICE_NOT_FOUND", "A pairinghez tartozó device nem található.", 404);
  if (deviceResult.data.status === "pending") return { status: "pending_approval" as const };
  if (deviceResult.data.status !== "approved") throw new WindowsBridgePairingError("DEVICE_NOT_APPROVABLE", "A device nem aktiválható.", 409);
  const deviceToken = createWindowsBridgeToken(); const tokenHash = hashWindowsBridgeToken(deviceToken); const sessionId = randomUUID();
  const rpc = await client.rpc("dev_center_windows_bridge_activate_device", { p_pairing_id: pairing.id, p_device_id: deviceId, p_claim_token_hash: claimHash, p_token_hash: tokenHash, p_session_id: sessionId });
  if (rpc.error || rpc.data !== true) throw new WindowsBridgePairingError("DEVICE_ACTIVATION_FAILED", rpc.error?.message || "A device aktiválása sikertelen.", 409);
  await audit(client, { action: "WINDOWS_BRIDGE_DEVICE_ACTIVATED", entityType: "windows_bridge_device", entityId: deviceId, actor: String(deviceResult.data.agent_id), summary: "Windows Bridge device aktiválva; token egyszer kiadva.", metadata: { pairingId: pairing.id, sessionId } });
  return { status: "active" as const, deviceId, sessionId, deviceToken };
}

export async function authenticateWindowsBridgeDevice(token: string, agentId?: string) {
  assertBridgeEnabled(); const tokenHash = hashWindowsBridgeToken(token || ""); const client = db();
  let query = client.from("dev_center_windows_bridge_devices").select("id,agent_id,status,device_label").eq("token_hash", tokenHash).eq("status", "active");
  if (agentId) query = query.eq("agent_id", clean(agentId, 128));
  const result = await query.maybeSingle();
  if (result.error || !result.data) throw new WindowsBridgePairingError("DEVICE_TOKEN_INVALID", "Érvénytelen vagy visszavont Windows Bridge device token.", 401);
  return { client, device: result.data as { id: string; agent_id: string; status: string; device_label: string } };
}

export async function heartbeatWindowsBridgeDevice(input: WindowsBridgeHeartbeat, token: string) {
  if (input.protocolVersion !== WINDOWS_BRIDGE_PROTOCOL_VERSION || !validAgentId(clean(input.agentId, 128)) || !clean(input.sessionId, 64)) throw new WindowsBridgePairingError("HEARTBEAT_INVALID", "Érvénytelen Windows Bridge heartbeat.");
  const { client, device } = await authenticateWindowsBridgeDevice(token, input.agentId); const now = new Date().toISOString();
  const session = await client.from("dev_center_windows_bridge_sessions").update({ last_heartbeat_at: now }).eq("id", clean(input.sessionId, 64)).eq("device_id", device.id).eq("status", "active").select("id").maybeSingle();
  if (session.error || !session.data) throw new WindowsBridgePairingError("BRIDGE_SESSION_INVALID", "Az aktív Windows Bridge session nem található.", 409);
  const update = await client.from("dev_center_windows_bridge_devices").update({ last_seen_at: now, updated_at: now }).eq("id", device.id).eq("status", "active");
  if (update.error) throw new WindowsBridgePairingError("HEARTBEAT_UPDATE_FAILED", update.error.message, 500);
  return { ok: true as const, serverTime: now, nextHeartbeatSeconds: 30, commands: [] as never[] };
}

export async function revokeWindowsBridgeDevice(deviceId: string, reason: string, actor = "BENJADMIN") {
  assertBridgeEnabled(); const client = db(); const id = clean(deviceId, 64); const now = new Date().toISOString();
  const result = await client.from("dev_center_windows_bridge_devices").update({ status: "revoked", token_hash: null, revoked_at: now, revoked_by: actor, revoke_reason: clean(reason, 240, "admin_revoked"), updated_at: now }).eq("id", id).neq("status", "revoked").select("id,agent_id,device_label").maybeSingle();
  if (result.error) throw new WindowsBridgePairingError("DEVICE_REVOKE_FAILED", result.error.message, 500);
  if (!result.data) throw new WindowsBridgePairingError("DEVICE_ALREADY_REVOKED", "A device már visszavont vagy nem található.", 409);
  await client.from("dev_center_windows_bridge_sessions").update({ status: "revoked", closed_at: now, close_reason: "device_revoked" }).eq("device_id", id).eq("status", "active");
  await audit(client, { action: "WINDOWS_BRIDGE_DEVICE_REVOKED", entityType: "windows_bridge_device", entityId: id, actor, summary: "Windows Bridge device token visszavonva és session lezárva.", metadata: { agentId: result.data.agent_id, deviceLabel: result.data.device_label, reason: clean(reason, 240) } });
  return { ok: true as const };
}
