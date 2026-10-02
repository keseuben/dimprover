import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { listDriveChanges, listDriveTreeForAccess } from "@/app/lib/drive-core/store";
import type { DriveChangeEvent } from "@/app/lib/drive-core/types";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function documentRefs(change: DriveChangeEvent) {
  const payload = record(change.payload);
  const document = record(payload.document);
  const version = record(payload.version);
  const governance = record(payload.governance);
  const item = record(payload.item);
  return [...new Set([
    text(payload.documentId), text(payload.document_id), text(document.id),
    text(version.document_id), text(version.documentId),
    text(governance.document_id), text(governance.documentId),
    text(item.document_id), text(item.documentId),
  ].filter(Boolean))];
}

function folderRefs(change: DriveChangeEvent) {
  const payload = record(change.payload);
  const folder = record(payload.folder);
  const document = record(payload.document);
  return [...new Set([
    text(payload.folderId), text(payload.folder_id), text(folder.id),
    text(document.folder_id), text(document.folderId),
  ].filter(Boolean))];
}

function compareDocumentRefs(change: DriveChangeEvent) {
  const payload = record(change.payload);
  const nestedFinding = record(payload.finding);
  const finding = Object.keys(nestedFinding).length ? nestedFinding : payload;
  return [...new Set([
    text(finding.left_document_id), text(finding.leftDocumentId),
    text(finding.right_document_id), text(finding.rightDocumentId),
  ].filter(Boolean))];
}

function canSeeDriveChange(
  change: DriveChangeEvent,
  visibleFolderIds: Set<string>,
  visibleDocumentIds: Set<string>,
) {
  if (change.entityType === "sync" || change.entityType === "box" || change.entityType === "box_folder") return true;

  if (change.entityType === "folder") {
    if (visibleFolderIds.has(change.entityId)) return true;
    return folderRefs(change).some((folderId) => visibleFolderIds.has(folderId));
  }

  if (change.entityType === "document") {
    if (visibleDocumentIds.has(change.entityId)) return true;
    if (documentRefs(change).some((documentId) => visibleDocumentIds.has(documentId))) return true;
    return folderRefs(change).some((folderId) => visibleFolderIds.has(folderId));
  }

  switch (change.entityType) {
    case "document_version":
    case "metadata":
    case "note":
    case "qr":
    case "box_item": {
      const refs = documentRefs(change);
      return refs.length > 0 && refs.every((documentId) => visibleDocumentIds.has(documentId));
    }
    case "compare_finding": {
      const refs = compareDocumentRefs(change);
      return refs.length > 0 && refs.every((documentId) => visibleDocumentIds.has(documentId));
    }
    default:
      break;
  }

  // saved_view / compare_job / ai_job and unknown future entities stay fail-closed
  // until their document visibility contract is explicitly defined.
  return false;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const cursor = Number(request.nextUrl.searchParams.get("cursor") || 0);
    const limit = Number(request.nextUrl.searchParams.get("limit") || 100);
    const [tree, result] = await Promise.all([
      listDriveTreeForAccess(projectId, access.access),
      listDriveChanges(projectId, cursor, limit),
    ]);
    const visibleFolderIds = new Set(tree.folders.map((folder) => folder.id));
    const visibleDocumentIds = new Set(tree.documents.map((document) => document.id));
    const changes = result.changes.filter((change) => canSeeDriveChange(change, visibleFolderIds, visibleDocumentIds));
    return NextResponse.json({ ...result, changes }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return driveCoreErrorResponse(error); }
}
