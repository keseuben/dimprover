import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ProjectIssueRepositoryError } from "./issueRepository";

export type ProjectIssueAuditEvent = {
  id: string;
  projectId: string;
  actorUserId: string;
  eventType: string;
  entityType: "issue";
  entityId: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type DbAuditEvent = {
  id: string;
  project_id: string;
  actor_user_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new ProjectIssueRepositoryError(
      "A Project Issue Core szerveroldali Supabase-kapcsolata nincs beállítva.",
      "PROJECT_ISSUE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-project-issue-audit/0.5.0" } },
  });
}

function mapAudit(row: DbAuditEvent): ProjectIssueAuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    entityType: "issue",
    entityId: row.entity_id,
    summary: row.summary,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

export async function listProjectIssueAuditEvents(projectId: string, issueId: string, limit = 80) {
  const safeLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.round(limit) : 80));
  const client = getClient();
  const result = await client
    .from("project_core_audit_events")
    .select("id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata,created_at")
    .eq("project_id", projectId)
    .eq("entity_type", "issue")
    .eq("entity_id", issueId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (result.error) {
    const missing = result.error.code === "PGRST205" || result.error.code === "42P01";
    throw new ProjectIssueRepositoryError(
      missing ? "A Project Issue Core audit sémája még nincs alkalmazva." : "A hibajegy auditnaplója nem tölthető be.",
      missing ? "PROJECT_ISSUE_AUDIT_SCHEMA_NOT_READY" : result.error.code || "PROJECT_ISSUE_AUDIT_DATABASE_ERROR",
      missing ? 503 : 500,
    );
  }

  return {
    ok: true as const,
    auditEvents: ((result.data || []) as DbAuditEvent[]).map(mapAudit),
  };
}
