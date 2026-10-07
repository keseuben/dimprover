import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { getDriveDownloadVersionRecord } from "@/app/lib/drive-core/storageRepository";
import { issueDriveOpenTicket } from "@/app/lib/drive/openTicketStore";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

const READABLE_VERSION_STATUSES = new Set(["AVAILABLE", "QUARANTINED"]);

type RouteContext = { params: Promise<{ projectId: string; documentId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, documentId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({})) as { versionId?: string | null; mode?: string | null };
  if (body.mode && body.mode !== "WORKFILE") {
    return NextResponse.json({ ok: false, error: "A kért Windows megnyitási mód nem támogatott.", code: "DRIVE_OPEN_MODE_UNSUPPORTED" }, { status: 400 });
  }

  try {
    const record = await getDriveDownloadVersionRecord({
      projectId,
      documentId,
      versionId: typeof body.versionId === "string" && body.versionId.trim() ? body.versionId.trim() : null,
      access: access.access,
    });
    if (!record) {
      return NextResponse.json({ ok: false, error: "A dokumentumverzió nem található.", code: "DRIVE_OPEN_VERSION_NOT_FOUND" }, { status: 404 });
    }
    if (!READABLE_VERSION_STATUSES.has(record.version.status)) {
      return NextResponse.json({ ok: false, error: "Ez a dokumentumverzió még nem nyitható meg Windowsban.", code: "DRIVE_OPEN_VERSION_NOT_READABLE" }, { status: 409 });
    }
    if (!record.version.sha256 || !/^[a-f0-9]{64}$/i.test(record.version.sha256)) {
      return NextResponse.json({ ok: false, error: "A dokumentumverzió nem rendelkezik ellenőrizhető SHA-256 azonosítóval.", code: "DRIVE_OPEN_VERSION_SHA256_REQUIRED" }, { status: 409 });
    }

    const ticket = await issueDriveOpenTicket({
      projectId,
      projectCode: access.access.project.code,
      projectName: access.access.project.name,
      documentId,
      versionId: record.version.id,
      actorUserId: access.actor.userId,
      actorUserAliases: access.actor.userAliases,
    });
    return NextResponse.json({
      ok: true,
      open: {
        mode: ticket.mode,
        protocol: "dimpro-drive",
        protocolUrl: `dimpro-drive://open-file?ticket=${encodeURIComponent(ticket.token)}`,
        expiresAt: ticket.expiresAt,
        documentId,
        versionId: record.version.id,
        notice: "Ez nem teljes Drive-szinkronizálás. Csak a kiválasztott fájl kerül a helyi DIMPRO munkafájlok közé.",
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
