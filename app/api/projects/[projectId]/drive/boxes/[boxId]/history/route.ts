import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { listProjectAuditEvents } from "@/app/lib/project-core/store";
import { listDriveBoxes } from "@/app/lib/drive-core/store";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";

type RouteContext = { params: Promise<{ projectId: string; boxId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const boxEventTypes = new Set([
  "DRIVE_BOX_CREATED",
  "DRIVE_BOX_ITEM_ADDED",
  "DRIVE_BOX_ITEM_REMOVED",
  "DRIVE_BOX_FOLDER_CREATED",
  "DRIVE_BOX_ITEM_MOVED",
  "DRIVE_BOX_LIFECYCLE_CHANGED",
  "DRIVE_DOWNLOAD_PACKAGE_CREATED",
]);

function belongsToBox(event: Awaited<ReturnType<typeof listProjectAuditEvents>>[number], boxId: string) {
  if (!boxEventTypes.has(event.eventType)) return false;
  if (event.entityType === "box" && event.entityId === boxId) return true;
  return String(event.metadata?.boxId || "") === boxId;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId, boxId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    const listed = await listDriveBoxes(projectId, access.access);
    const box = listed.boxes.find((entry) => entry.id === boxId);
    if (!box) {
      return NextResponse.json({ ok: false, error: "A CsomagBOX nem található." }, { status: 404 });
    }
    const visibleDocumentIds = new Set(box.items.map((item) => item.documentId));

    const auditEvents = await listProjectAuditEvents(projectId, 100);
    const events = auditEvents
      .filter((event) => belongsToBox(event, boxId))
      .filter((event) => {
        const documentId = typeof event.metadata?.documentId === "string" ? event.metadata.documentId.trim() : "";
        if (documentId) return visibleDocumentIds.has(documentId);
        return event.entityType !== "box_item";
      })
      .map((event) => ({
        id: event.id,
        eventType: event.eventType,
        summary: event.summary,
        actorUserId: event.actorUserId,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata || {},
        createdAt: event.createdAt,
      }));

    return NextResponse.json(
      { ok: true, projectId, boxId, count: events.length, events },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
