import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import type { DriveAutoAlignmentSource } from "@/components/drive/driveAutoAlignment";

export type DriveCompareFindingStatus = "REVIEW" | "ACCEPTED_DIFFERENCE" | "FIX_REQUIRED";
export type DriveCompareFindingPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DriveCompareFinding = {
  id: string;
  projectId: string;
  leftDocumentId: string;
  leftVersionId: string;
  rightDocumentId: string;
  rightVersionId: string;
  pageNumber: number;
  sourceZoneIndex: number;
  zoneLabel: string;
  zone: { x: number; y: number; width: number; height: number };
  score: number;
  mismatchPixels: number;
  inkPixels: number;
  alignment: {
    offsetX: number;
    offsetY: number;
    scalePercent: number;
    rotationDegrees: number;
    source: DriveAutoAlignmentSource;
    confidenceScore: number;
  };
  status: DriveCompareFindingStatus;
  priority: DriveCompareFindingPriority;
  note: string;
  assigneeUserId: string | null;
  assigneeName: string;
  dueAt: string | null;
  version: number;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  links: Array<{ id: string; targetType: string; targetId: string; relationType: string; createdAt: string; createdBy: string }>;
};

type DbFinding = {
  id: string; project_id: string; left_document_id: string; left_version_id: string; right_document_id: string; right_version_id: string;
  page_number: number; source_zone_index: number; zone_label: string; zone_x: number; zone_y: number; zone_width: number; zone_height: number;
  score: number; mismatch_pixels: number; ink_pixels: number; alignment_offset_x: number; alignment_offset_y: number;
  alignment_scale_percent: number; alignment_rotation_degrees: number; alignment_source: DriveAutoAlignmentSource; alignment_confidence_score: number;
  status: DriveCompareFindingStatus; priority: DriveCompareFindingPriority; note: string; assignee_user_id: string | null; assignee_name: string; due_at: string | null;
  version: number; created_by: string; created_by_name: string; updated_by: string; updated_by_name: string; created_at: string; updated_at: string;
};

type DbLink = { id: string; source_id: string; target_type: string; target_id: string; relation_type: string; created_at: string; created_by: string };

const STATUSES: DriveCompareFindingStatus[] = ["REVIEW", "ACCEPTED_DIFFERENCE", "FIX_REQUIRED"];
const PRIORITIES: DriveCompareFindingPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const ALIGNMENT_SOURCES: DriveAutoAlignmentSource[] = ["TEXT_LABELS", "GEOMETRIC_NODES", "VECTOR_SEGMENTS", "VECTOR_CONTOURS"];

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DriveCoreRepositoryError("A Compare Findings szerveroldali Supabase-kapcsolata nincs beállítva.", "DRIVE_COMPARE_DATABASE_NOT_CONFIGURED", 503);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "dimpro-drive-compare-findings/2.0.0" } } });
}

function dbError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = `${candidate?.message || ""} ${candidate?.details || ""}`;
  const code = candidate?.code || "DRIVE_COMPARE_DATABASE_ERROR";
  const missing = code === "PGRST205" || code === "42P01" || code === "42883";
  if (text.includes("DRIVE_COMPARE_FINDING_DUPLICATE")) throw new DriveCoreRepositoryError("Ez az eltérési zóna már szerepel a tartós jegyzékben.", "DRIVE_COMPARE_FINDING_DUPLICATE", 409);
  if (text.includes("DRIVE_COMPARE_FINDING_VERSION_CONFLICT")) throw new DriveCoreRepositoryError("Az eltérési tételt közben más is módosította. Frissítsd a listát.", "DRIVE_COMPARE_FINDING_VERSION_CONFLICT", 409);
  if (text.includes("DRIVE_COMPARE_FINDING_NOT_FOUND")) throw new DriveCoreRepositoryError("Az eltérési tétel nem található.", "DRIVE_COMPARE_FINDING_NOT_FOUND", 404);
  if (text.includes("DRIVE_COMPARE_ASSIGNEE_NOT_ACTIVE")) throw new DriveCoreRepositoryError("Felelősként csak aktív projekttag választható.", "DRIVE_COMPARE_ASSIGNEE_NOT_ACTIVE", 400);
  if (text.includes("DRIVE_COMPARE_LEFT_VERSION_NOT_FOUND") || text.includes("DRIVE_COMPARE_RIGHT_VERSION_NOT_FOUND")) throw new DriveCoreRepositoryError("Az összehasonlított dokumentumverzió nem található vagy nem AVAILABLE állapotú.", "DRIVE_COMPARE_VERSION_NOT_AVAILABLE", 409);
  throw new DriveCoreRepositoryError(missing ? "A Compare Findings V2 PostgreSQL-séma még nincs alkalmazva." : message, missing ? "DRIVE_COMPARE_SCHEMA_NOT_READY" : code, missing ? 503 : status, candidate || undefined);
}

function text(value: unknown, max = 4000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function number(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function integer(value: unknown, fallback = 0) { return Math.round(number(value, fallback)); }
function optionalDate(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new DriveCoreRepositoryError("Érvénytelen határidő.", "DRIVE_COMPARE_DUE_AT_INVALID", 400);
  return parsed.toISOString();
}
function status(value: unknown): DriveCompareFindingStatus { return STATUSES.includes(value as DriveCompareFindingStatus) ? value as DriveCompareFindingStatus : "REVIEW"; }
function priority(value: unknown): DriveCompareFindingPriority { return PRIORITIES.includes(value as DriveCompareFindingPriority) ? value as DriveCompareFindingPriority : "MEDIUM"; }
function alignmentSource(value: unknown): DriveAutoAlignmentSource {
  if (!ALIGNMENT_SOURCES.includes(value as DriveAutoAlignmentSource)) throw new DriveCoreRepositoryError("Érvénytelen Auto Align forrás.", "DRIVE_COMPARE_ALIGNMENT_SOURCE_INVALID", 400);
  return value as DriveAutoAlignmentSource;
}
function normalized(value: unknown, name: string) {
  const n = number(value, Number.NaN);
  if (!Number.isFinite(n) || n < 0 || n > 1.002) throw new DriveCoreRepositoryError(`Érvénytelen normalizált zónakoordináta: ${name}.`, "DRIVE_COMPARE_ZONE_INVALID", 400);
  return Number(n.toFixed(8));
}

function mapFinding(row: DbFinding, links: DbLink[] = []): DriveCompareFinding {
  return {
    id: row.id, projectId: row.project_id, leftDocumentId: row.left_document_id, leftVersionId: row.left_version_id,
    rightDocumentId: row.right_document_id, rightVersionId: row.right_version_id, pageNumber: Number(row.page_number), sourceZoneIndex: Number(row.source_zone_index), zoneLabel: row.zone_label,
    zone: { x: Number(row.zone_x), y: Number(row.zone_y), width: Number(row.zone_width), height: Number(row.zone_height) },
    score: Number(row.score), mismatchPixels: Number(row.mismatch_pixels), inkPixels: Number(row.ink_pixels),
    alignment: { offsetX: Number(row.alignment_offset_x), offsetY: Number(row.alignment_offset_y), scalePercent: Number(row.alignment_scale_percent), rotationDegrees: Number(row.alignment_rotation_degrees), source: row.alignment_source, confidenceScore: Number(row.alignment_confidence_score) },
    status: row.status, priority: row.priority, note: row.note || "", assigneeUserId: row.assignee_user_id, assigneeName: row.assignee_name || "", dueAt: row.due_at,
    version: Number(row.version), createdBy: row.created_by, createdByName: row.created_by_name || "", updatedBy: row.updated_by, updatedByName: row.updated_by_name || "", createdAt: row.created_at, updatedAt: row.updated_at,
    links: links.map((link) => ({ id: link.id, targetType: link.target_type, targetId: link.target_id, relationType: link.relation_type, createdAt: link.created_at, createdBy: link.created_by })),
  };
}

export async function getDriveCompareFindingsHealth() {
  try {
    const client = getClient();
    const [table, marker] = await Promise.all([
      client.from("drive_core_compare_findings").select("id,project_id,version").limit(0),
      client.from("drive_compare_findings_schema_meta").select("schema_version,migration_count,bootstrap_id").eq("component", "drive-compare-findings").maybeSingle(),
    ]);
    const ready = !table.error && !marker.error && marker.data?.schema_version === "2.0.0" && Number(marker.data?.migration_count) === 1 && marker.data?.bootstrap_id === "drive-compare-findings-v200-20260815";
    return { ready, schemaVersion: marker.data?.schema_version || null, bootstrapId: marker.data?.bootstrap_id || null, errorCode: table.error?.code || marker.error?.code || null };
  } catch (error) {
    return { ready: false, schemaVersion: null, bootstrapId: null, errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_COMPARE_HEALTH_FAILED" };
  }
}

async function linksFor(client: SupabaseClient, projectId: string, findingIds: string[]) {
  if (!findingIds.length) return new Map<string, DbLink[]>();
  const result = await client.from("project_core_entity_links").select("id,source_id,target_type,target_id,relation_type,created_at,created_by").eq("project_id", projectId).eq("source_type", "compare_finding").in("source_id", findingIds);
  if (result.error) dbError("A Compare Finding kapcsolatok nem tölthetők be.", result.error);
  const map = new Map<string, DbLink[]>();
  for (const row of (result.data || []) as DbLink[]) { const bucket = map.get(row.source_id) || []; bucket.push(row); map.set(row.source_id, bucket); }
  return map;
}

export async function listDriveCompareFindings(projectId: string, input: { leftVersionId?: string; rightVersionId?: string; pageNumber?: number }) {
  const client = getClient();
  let query = client.from("drive_core_compare_findings").select("*").eq("project_id", projectId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(250);
  if (input.leftVersionId) query = query.eq("left_version_id", input.leftVersionId);
  if (input.rightVersionId) query = query.eq("right_version_id", input.rightVersionId);
  if (input.pageNumber) query = query.eq("page_number", input.pageNumber);
  const result = await query;
  if (result.error) dbError("Az eltérési jegyzék nem tölthető be.", result.error);
  const rows = (result.data || []) as DbFinding[];
  const linkMap = await linksFor(client, projectId, rows.map((row) => row.id));
  return { ok: true as const, findings: rows.map((row) => mapFinding(row, linkMap.get(row.id) || [])) };
}

export async function createDriveCompareFinding(projectId: string, input: Record<string, unknown>, actorUserId: string, actorName: string) {
  const client = getClient();
  const leftDocumentId = text(input.leftDocumentId, 160); const leftVersionId = text(input.leftVersionId, 160);
  const rightDocumentId = text(input.rightDocumentId, 160); const rightVersionId = text(input.rightVersionId, 160);
  if (!leftDocumentId || !leftVersionId || !rightDocumentId || !rightVersionId) throw new DriveCoreRepositoryError("Az A/B dokumentum- és verzióazonosító kötelező.", "DRIVE_COMPARE_VERSIONS_REQUIRED", 400);
  const zoneX = normalized(input.zoneX, "x"), zoneY = normalized(input.zoneY, "y"), zoneWidth = normalized(input.zoneWidth, "width"), zoneHeight = normalized(input.zoneHeight, "height");
  if (zoneWidth <= 0 || zoneHeight <= 0 || zoneX + zoneWidth > 1.002 || zoneY + zoneHeight > 1.002) throw new DriveCoreRepositoryError("Az eltérési zóna kívül esik a terv normalizált területén.", "DRIVE_COMPARE_ZONE_INVALID", 400);
  const payload = {
    id: text(input.id, 160) || `drive-finding-${randomUUID()}`,
    left_document_id: leftDocumentId, left_version_id: leftVersionId, right_document_id: rightDocumentId, right_version_id: rightVersionId,
    page_number: Math.max(1, integer(input.pageNumber, 1)), source_zone_index: Math.max(0, integer(input.sourceZoneIndex, 0)), zone_label: text(input.zoneLabel, 32) || `Δ${Math.max(0, integer(input.sourceZoneIndex, 0)) + 1}`,
    zone_x: zoneX, zone_y: zoneY, zone_width: zoneWidth, zone_height: zoneHeight,
    score: Math.max(0, Math.min(100, integer(input.score, 0))), mismatch_pixels: Math.max(0, integer(input.mismatchPixels, 0)), ink_pixels: Math.max(0, integer(input.inkPixels, 0)),
    alignment_offset_x: number(input.alignmentOffsetX), alignment_offset_y: number(input.alignmentOffsetY), alignment_scale_percent: number(input.alignmentScalePercent, 100), alignment_rotation_degrees: number(input.alignmentRotationDegrees), alignment_source: alignmentSource(input.alignmentSource), alignment_confidence_score: Math.max(0, Math.min(1, number(input.alignmentConfidenceScore))),
    status: status(input.status), priority: priority(input.priority), note: typeof input.note === "string" ? input.note.slice(0, 4000) : "",
    assignee_user_id: text(input.assigneeUserId, 240), due_at: optionalDate(input.dueAt),
  };
  const result = await client.rpc("drive_compare_findings_create_atomic", { p_project_id: projectId, p_payload: payload, p_actor_user_id: actorUserId, p_actor_name: actorName });
  if (result.error) dbError("Az eltérési tétel mentése sikertelen.", result.error);
  return { ok: true as const, finding: mapFinding(result.data as DbFinding) };
}

export async function updateDriveCompareFinding(projectId: string, findingId: string, input: Record<string, unknown>, actorUserId: string, actorName: string) {
  const client = getClient();
  const expectedVersion = integer(input.expectedVersion, 0);
  if (expectedVersion < 1) throw new DriveCoreRepositoryError("A módosításhoz érvényes verziószám szükséges.", "DRIVE_COMPARE_EXPECTED_VERSION_REQUIRED", 400);
  const patch: Record<string, unknown> = {};
  if ("status" in input) patch.status = status(input.status);
  if ("priority" in input) patch.priority = priority(input.priority);
  if ("note" in input) patch.note = typeof input.note === "string" ? input.note.slice(0, 4000) : "";
  if ("assigneeUserId" in input) patch.assignee_user_id = text(input.assigneeUserId, 240);
  if ("dueAt" in input) patch.due_at = optionalDate(input.dueAt);
  if (!Object.keys(patch).length) throw new DriveCoreRepositoryError("Nincs módosítható Compare Finding mező.", "DRIVE_COMPARE_PATCH_EMPTY", 400);
  const result = await client.rpc("drive_compare_findings_update_atomic", { p_project_id: projectId, p_finding_id: findingId, p_expected_version: expectedVersion, p_patch: patch, p_actor_user_id: actorUserId, p_actor_name: actorName });
  if (result.error) dbError("Az eltérési tétel frissítése sikertelen.", result.error);
  return { ok: true as const, finding: mapFinding(result.data as DbFinding) };
}

export async function deleteDriveCompareFinding(projectId: string, findingId: string, expectedVersion: number, actorUserId: string, actorName: string) {
  const client = getClient();
  if (expectedVersion < 1) throw new DriveCoreRepositoryError("A törléshez érvényes verziószám szükséges.", "DRIVE_COMPARE_EXPECTED_VERSION_REQUIRED", 400);
  const result = await client.rpc("drive_compare_findings_delete_atomic", { p_project_id: projectId, p_finding_id: findingId, p_expected_version: expectedVersion, p_actor_user_id: actorUserId, p_actor_name: actorName });
  if (result.error) dbError("Az eltérési tétel archiválása sikertelen.", result.error);
  return { ok: true as const, finding: mapFinding(result.data as DbFinding), deleted: true as const };
}
