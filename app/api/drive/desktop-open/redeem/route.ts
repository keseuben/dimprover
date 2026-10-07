import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { initDriveObjectDownload } from "@/app/lib/drive-core/store";
import { consumeDriveOpenTicket } from "@/app/lib/drive/openTicketStore";
import { getProjectAccess } from "@/app/lib/project-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { ticket?: string };
  try {
    const ticket = await consumeDriveOpenTicket(body.ticket);
    const access = await getProjectAccess(ticket.projectId, ticket.actorUserAliases);
    if (!access) {
      return NextResponse.json(
        { ok: false, error: "A projekt nem található vagy a Windows-megnyitási jogosultság időközben megszűnt.", code: "DRIVE_DESKTOP_OPEN_ACCESS_REVOKED" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    if (!access.permissions.includes("document.read")) {
      return NextResponse.json(
        { ok: false, error: "A dokumentum Windowsban történő megnyitásához már nincs olvasási jogosultság.", code: "DRIVE_DESKTOP_OPEN_PERMISSION_REVOKED" },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    // V0.1.9: az egyszer használható, rövid életű open-ticket maga a capability.
    // A ticketet kizárólag hitelesített web-session kaphatja meg, és redeemkor a canonical
    // projektjogosultságot a szerver a ticketben tárolt felhasználói aliasokkal újraellenőrzi.
    // Tartós Desktop sync/auth ettől külön, későbbi capability.
    const result = await initDriveObjectDownload({
      projectId: ticket.projectId,
      documentId: ticket.documentId,
      versionId: ticket.versionId,
      actorUserId: ticket.actorUserId,
      clientId: "drive-desktop-open-v019",
      access,
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
