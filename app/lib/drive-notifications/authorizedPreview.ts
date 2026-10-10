import "server-only";
import type { NextRequest } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { listDriveTreeForAccess } from "@/app/lib/drive-core/store";
import type { DriveChangeEvent } from "@/app/lib/drive-core/types";
import { buildRecipientDigest, type DigestCategory, type DigestItem } from "./digestCore";

export class DigestAccessDenied extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

type DbChange = {
  sequence: number | string; id: string; project_id: string; event_type: string;
  entity_type: DriveChangeEvent["entityType"]; entity_id: string;
  payload: Record<string, unknown> | null; actor_user_id: string; created_at: string;
};

export async function buildAuthorizedUserPreview(input: {
  request: NextRequest;
  projectId: string;
  category: DigestCategory;
  hours: number;
}): Promise<{
  projectTitle: string;
  recipientLabel: string;
  category: DigestCategory;
  examined: number;
  truncated: boolean;
  items: DigestItem[];
  accessibleNames: Map<string, string>;
  since: string;
}> {
  const access = await requireProjectPermission(input.request, input.projectId, "document.read");
  if (!access.ok) throw new DigestAccessDenied(access.status, "DRIVE_DIGEST_ACCESS_DENIED");

  // No broad approval disclosure: normal document.read/approval.read isn't sufficient.
  const canSeeDecisions = access.access.permissions.includes("document.approve");
  const tree = await listDriveTreeForAccess(input.projectId, access.access);
  const accessibleNames = new Map(tree.documents.map((doc) => [
    doc.id, doc.currentVersion?.originalName || doc.name,
  ]));
  const since = new Date(Date.now() - Math.max(1, Math.min(168, input.hours)) * 60 * 60 * 1000).toISOString();
  const maximum = 250;
  const { data, error } = await getDatabaseClient()
    .from("drive_core_change_events")
    .select("sequence,id,project_id,event_type,entity_type,entity_id,payload,actor_user_id,created_at")
    .eq("project_id", input.projectId)
    .gte("created_at", since)
    .order("sequence", { ascending: false })
    .limit(maximum + 1);
  if (error) throw new Error("A változási napló nem olvasható.");
  const entries = (data || []) as DbChange[];
  const truncated = entries.length > maximum;
  const changes: DriveChangeEvent[] = entries.slice(0, maximum).map((row) => ({
    sequence: Number(row.sequence), id: row.id, projectId: row.project_id,
    eventType: row.event_type, entityType: row.entity_type, entityId: row.entity_id,
    payload: row.payload || {}, actorUserId: row.actor_user_id, createdAt: row.created_at,
  }));
  const items = buildRecipientDigest(changes, {
    userId: access.actor.userId,
    projectId: input.projectId,
    visibleDocumentIds: new Set(accessibleNames.keys()),
    approvalDocumentIds: canSeeDecisions ? new Set(accessibleNames.keys()) : new Set(),
    enabledCategories: new Set([input.category]),
  });
  return {
    projectTitle: access.access.project.name,
    recipientLabel: access.actor.displayName || access.actor.email || "DIMPRO felhasználó",
    category: input.category,
    examined: Math.min(entries.length, maximum),
    truncated,
    items,
    accessibleNames,
    since,
  };
}
