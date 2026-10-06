import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { initDriveObjectDownload } from "@/app/lib/drive-core/store";
import { isDriveApiAuthorized } from "@/app/lib/drive/driveApi";
import { consumeDriveOpenTicket } from "@/app/lib/drive/openTicketStore";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const driveAuth = await isDriveApiAuthorized(request.headers);
  if (!driveAuth.ok || driveAuth.mode !== "desktop-access") {
    return NextResponse.json({ ok: false, error: "Érvényes DIMPRO Drive Desktop hozzáférési token szükséges.", code: "DRIVE_DESKTOP_OPEN_AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const body = await request.json().catch(() => ({})) as { ticket?: string };
  try {
    const ticket = await consumeDriveOpenTicket(body.ticket);
    const access = await requireProjectPermission(request, ticket.projectId, "document.read");
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status, headers: { "cache-control": "no-store" } });
    }
    if (!access.actor.userAliases.includes(ticket.actorUserId)) {
      return NextResponse.json({
        ok: false,
        error: "A Windows megnyitási jegy más DIMPRO felhasználóhoz tartozik.",
        code: "DRIVE_OPEN_TICKET_ACTOR_MISMATCH",
      }, { status: 403, headers: { "cache-control": "no-store" } });
    }

    const result = await initDriveObjectDownload({
      projectId: ticket.projectId,
      documentId: ticket.documentId,
      versionId: ticket.versionId,
      actorUserId: access.actor.userId,
      clientId: driveAuth.clientId || null,
      access: access.access,
    });

    return NextResponse.json({
      ok: true,
      open: {
        mode: ticket.mode,
        projectId: ticket.projectId,
        projectCode: ticket.projectCode,
        projectName: ticket.projectName,
        documentId: ticket.documentId,
        versionId: ticket.versionId,
        fileName: result.download.fileName,
        mimeType: result.download.mimeType,
        sizeBytes: result.download.sizeBytes,
        sha256: result.download.sha256,
        download: {
          method: result.download.method,
          url: result.download.url,
          expiresAt: result.download.expiresAt,
        },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
