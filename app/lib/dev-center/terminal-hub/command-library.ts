"server-only";

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTerminalHubFeatureFlags } from "./config";
import { buildTerminalDataViews, sanitizeTerminalText } from "./data-policy";

export type TerminalCommandShellFamily = "bash" | "powershell" | "git" | "other";
export type TerminalCommandEnvironment = "DEV" | "STAGING" | "PRODUCTION" | "LOCAL" | "CONTROL";
export type TerminalCommandSource = "terminal" | "managed" | "manual" | "import";
export type TerminalCommandResultStatus = "queued" | "running" | "passed" | "failed" | "cancelled" | "unknown";

export type TerminalCommandCatalogItem = {
  id: string;
  commandHash: string;
  shellFamily: TerminalCommandShellFamily;
  displayCommand: string;
  usageCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
  lastEnvironment: TerminalCommandEnvironment;
  lastProjectId: string | null;
  purpose: string;
  lastResultSummary: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type TerminalCommandEvent = {
  id: string;
  catalogId: string;
  environment: TerminalCommandEnvironment;
  projectId: string | null;
  workerSessionId: string | null;
  terminalSessionId: string | null;
  source: TerminalCommandSource;
  resultStatus: TerminalCommandResultStatus;
  resultSummary: string;
  executedAt: string;
};

export class TerminalCommandLibraryError extends Error {
  status: number;
  code: string;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "TerminalCommandLibraryError";
    this.code = code;
    this.status = status;
  }
}

const SHELLS: TerminalCommandShellFamily[] = ["bash", "powershell", "git", "other"];
const ENVIRONMENTS: TerminalCommandEnvironment[] = ["DEV", "STAGING", "PRODUCTION", "LOCAL", "CONTROL"];
const SOURCES: TerminalCommandSource[] = ["terminal", "managed", "manual", "import"];
const RESULTS: TerminalCommandResultStatus[] = ["queued", "running", "passed", "failed", "cancelled", "unknown"];
const MAX_COMMAND_LENGTH = 4000;
const MAX_TEXT_LENGTH = 800;
const MAX_TAGS = 12;

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new TerminalCommandLibraryError("A Terminál Parancstár adatbázis-kapcsolata nincs beállítva.", "COMMAND_LIBRARY_DB_NOT_CONFIGURED", 503);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-benjadmin-terminal-command-library/1.0" } },
  });
}

export function assertTerminalCommandLibraryEnabled() {
  if (!getTerminalHubFeatureFlags().commandLibraryEnabled) {
    throw new TerminalCommandLibraryError("A Terminál Parancstár feature flag jelenleg ki van kapcsolva.", "COMMAND_LIBRARY_DISABLED", 409);
  }
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = typeof value === "string" ? value.trim() : "";
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

function sanitizeSingleLine(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  const raw = typeof value === "string" ? value : "";
  return sanitizeTerminalText(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeTerminalCommand(raw: string) {
  const withoutAnsi = raw
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "");
  const controlsRemoved = withoutAnsi
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const compact = controlsRemoved.replace(/\s+/g, " ").trim().slice(0, MAX_COMMAND_LENGTH);
  if (!compact) throw new TerminalCommandLibraryError("A parancs nem lehet üres.", "COMMAND_LIBRARY_COMMAND_EMPTY");
  const views = buildTerminalDataViews(compact);
  const safeCommand = views.sanitized.replace(/\s+/g, " ").trim().slice(0, MAX_COMMAND_LENGTH);
  if (!safeCommand) throw new TerminalCommandLibraryError("A sanitizált parancs üres.", "COMMAND_LIBRARY_SANITIZED_EMPTY");
  return {
    normalized: safeCommand,
    display: safeCommand,
    redacted: views.findings.length > 0,
    findingCount: views.findings.length,
  };
}

export function commandFingerprint(shellFamily: TerminalCommandShellFamily, normalizedSanitizedCommand: string) {
  return createHash("sha256").update(`${shellFamily}\n${normalizedSanitizedCommand}`, "utf8").digest("hex");
}

function safeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const tag = sanitizeSingleLine(item, 60);
    if (tag) unique.add(tag);
    if (unique.size >= MAX_TAGS) break;
  }
  return [...unique];
}

function mapCatalog(row: Record<string, unknown>): TerminalCommandCatalogItem {
  return {
    id: String(row.id || ""),
    commandHash: String(row.command_hash || ""),
    shellFamily: enumValue(row.shell_family, SHELLS, "other"),
    displayCommand: String(row.display_command || ""),
    usageCount: Number(row.usage_count || 0),
    firstUsedAt: String(row.first_used_at || ""),
    lastUsedAt: String(row.last_used_at || ""),
    lastEnvironment: enumValue(row.last_environment, ENVIRONMENTS, "DEV"),
    lastProjectId: typeof row.last_project_id === "string" && row.last_project_id ? row.last_project_id : null,
    purpose: String(row.purpose || ""),
    lastResultSummary: String(row.last_result_summary || ""),
    notes: String(row.notes || ""),
    tags: Array.isArray(row.tags) ? row.tags.filter((item): item is string => typeof item === "string") : [],
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function mapEvent(row: Record<string, unknown>): TerminalCommandEvent {
  return {
    id: String(row.id || ""),
    catalogId: String(row.catalog_id || ""),
    environment: enumValue(row.environment, ENVIRONMENTS, "DEV"),
    projectId: typeof row.project_id === "string" && row.project_id ? row.project_id : null,
    workerSessionId: typeof row.worker_session_id === "string" && row.worker_session_id ? row.worker_session_id : null,
    terminalSessionId: typeof row.terminal_session_id === "string" && row.terminal_session_id ? row.terminal_session_id : null,
    source: enumValue(row.source, SOURCES, "manual"),
    resultStatus: enumValue(row.result_status, RESULTS, "unknown"),
    resultSummary: String(row.result_summary || ""),
    executedAt: String(row.executed_at || ""),
  };
}

function schemaError(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code === "PGRST205" || /does not exist|schema cache/i.test(error?.message || "")) {
    return new TerminalCommandLibraryError("A Terminál Parancstár DEV adatbázissémája még nincs alkalmazva.", "COMMAND_LIBRARY_SCHEMA_NOT_READY", 409);
  }
  return new TerminalCommandLibraryError(error?.message || "Terminál Parancstár adatbázishiba.", "COMMAND_LIBRARY_DB_ERROR", 500);
}

export async function listTerminalCommands(input: {
  query?: string;
  shellFamily?: string;
  environment?: string;
  projectId?: string;
  limit?: number;
} = {}) {
  assertTerminalCommandLibraryEnabled();
  const client = getClient();
  const limit = Math.max(10, Math.min(150, Math.floor(Number(input.limit) || 80)));
  let query = client
    .from("dev_center_terminal_command_catalog")
    .select("id,command_hash,shell_family,display_command,usage_count,first_used_at,last_used_at,last_environment,last_project_id,purpose,last_result_summary,notes,tags,created_at,updated_at")
    .order("last_used_at", { ascending: false })
    .limit(limit);
  const shell = enumValue(input.shellFamily, SHELLS, "other");
  if (input.shellFamily && SHELLS.includes(input.shellFamily as TerminalCommandShellFamily)) query = query.eq("shell_family", shell);
  if (input.environment && ENVIRONMENTS.includes(input.environment as TerminalCommandEnvironment)) query = query.eq("last_environment", input.environment);
  if (input.projectId?.trim()) query = query.eq("last_project_id", input.projectId.trim());
  const search = sanitizeSingleLine(input.query, 160);
  if (search) query = query.ilike("display_command", `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  const result = await query;
  if (result.error) throw schemaError(result.error);
  return (result.data || []).map((row) => mapCatalog(row as Record<string, unknown>));
}

export async function listTerminalCommandEvents(catalogId: string, limit = 80) {
  assertTerminalCommandLibraryEnabled();
  if (!catalogId) throw new TerminalCommandLibraryError("Hiányzó parancskatalógus-azonosító.", "COMMAND_LIBRARY_ID_REQUIRED");
  const client = getClient();
  const result = await client
    .from("dev_center_terminal_command_events")
    .select("id,catalog_id,environment,project_id,worker_session_id,terminal_session_id,source,result_status,result_summary,executed_at")
    .eq("catalog_id", catalogId)
    .order("executed_at", { ascending: false })
    .limit(Math.max(10, Math.min(200, Math.floor(Number(limit) || 80))));
  if (result.error) throw schemaError(result.error);
  return (result.data || []).map((row) => mapEvent(row as Record<string, unknown>));
}

export async function recordTerminalCommand(input: {
  command: string;
  shellFamily?: string;
  environment?: string;
  projectId?: string | null;
  workerSessionId?: string | null;
  terminalSessionId?: string | null;
  source?: string;
  purpose?: string;
  resultStatus?: string;
  resultSummary?: string;
  tags?: unknown;
  actor?: string;
}) {
  assertTerminalCommandLibraryEnabled();
  const shellFamily = enumValue(input.shellFamily, SHELLS, "bash");
  const environment = enumValue(input.environment, ENVIRONMENTS, "DEV");
  const source = enumValue(input.source, SOURCES, "manual");
  const resultStatus = enumValue(input.resultStatus, RESULTS, "unknown");
  const safe = normalizeTerminalCommand(input.command);
  const hash = commandFingerprint(shellFamily, safe.normalized);
  const purpose = sanitizeSingleLine(input.purpose);
  const resultSummary = sanitizeSingleLine(input.resultSummary);
  const tags = safeTags(input.tags);
  const actor = sanitizeSingleLine(input.actor, 120) || "BENJADMIN";
  const metadata = {
    normalizationVersion: 1,
    redacted: safe.redacted,
    findingCount: safe.findingCount,
    origin: "BENJADMIN_TERMINAL_COMMAND_LIBRARY",
  };
  const client = getClient();
  const rpc = await client.rpc("dev_center_record_terminal_command", {
    p_command_hash: hash,
    p_shell_family: shellFamily,
    p_normalized_command: safe.normalized,
    p_display_command: safe.display,
    p_environment: environment,
    p_project_id: input.projectId?.trim() || null,
    p_worker_session_id: input.workerSessionId?.trim() || null,
    p_terminal_session_id: input.terminalSessionId?.trim() || null,
    p_source: source,
    p_purpose: purpose,
    p_result_status: resultStatus,
    p_result_summary: resultSummary,
    p_tags: tags,
    p_actor: actor,
    p_metadata: metadata,
  });
  if (rpc.error) throw schemaError(rpc.error);
  const id = typeof rpc.data === "string" ? rpc.data : String(rpc.data || "");
  if (!id) throw new TerminalCommandLibraryError("A Terminál Parancstár nem adott vissza katalógus-azonosítót.", "COMMAND_LIBRARY_RECORD_FAILED", 500);
  return { id, commandHash: hash, redacted: safe.redacted, findingCount: safe.findingCount };
}
