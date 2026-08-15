import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { SanitizedTerminalChunk } from "./output-views";
import { scanSensitiveText } from "../ai-worker/secret-scanner";
import { sanitizeTerminalText } from "./data-policy";

export class TerminalSecurityAuditError extends Error {
  constructor(message: string, public code = "TERMINAL_SECURITY_AUDIT_FAILED") { super(message); }
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new TerminalSecurityAuditError("A security audit adatbázis nincs konfigurálva.", "TERMINAL_SECURITY_AUDIT_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "benjadmin-terminal-security/0.1.0" } } });
}

export async function recordTerminalSecurityEvent(input: { sessionId: string; action: string; summary: string; metadata?: Record<string, unknown> }) {
  const db = client();
  const rawMetadata = input.metadata || {};
  const metadataText = JSON.stringify(rawMetadata);
  const metadataFindings = scanSensitiveText(metadataText);
  const safeMetadata = metadataFindings.length ? { redacted: true, findingCount: metadataFindings.length } : rawMetadata;
  const result = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "BENJADMIN",
    action: input.action.slice(0, 120),
    entity_type: "terminal_session",
    entity_id: input.sessionId,
    summary: sanitizeTerminalText(input.summary).slice(0, 500),
    metadata: safeMetadata,
  });
  if (result.error) throw new TerminalSecurityAuditError(result.error.message);
}

const globalState = globalThis as typeof globalThis & { __benjadminTerminalFindingAudit?: Set<string> };
const findingAudit = globalState.__benjadminTerminalFindingAudit || new Set<string>();
globalState.__benjadminTerminalFindingAudit = findingAudit;

export async function auditTerminalRedactionFindings(sessionId: string, chunks: SanitizedTerminalChunk[]) {
  for (const chunk of chunks) {
    if (chunk.findingCount <= 0) continue;
    const key = `${sessionId}:${chunk.sequence}`;
    if (findingAudit.has(key)) continue;
    await recordTerminalSecurityEvent({
      sessionId,
      action: "TERMINAL_SECRET_REDACTED",
      summary: "Terminál output érzékeny mintát tartalmazott; AI-adatút maszkolva.",
      metadata: { sequence: chunk.sequence, findingCount: chunk.findingCount },
    });
    findingAudit.add(key);
  }
}
