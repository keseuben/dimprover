import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import {
  completeDriveObjectUpload,
  getDriveDocumentFlowHealth,
  registerDriveIncomingDocument,
  scanDriveQuarantinedVersion,
  upsertDriveEngineeringMetadata,
} from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  try {
    const result = await completeDriveObjectUpload({ projectId, uploadId, actorUserId: access.actor.userId });
    let documentFlow: Record<string, unknown> | null = null;
    let securityScan: Record<string, unknown> | null = null;
    let namingMetadata: Record<string, unknown> | null = null;
    const documentId = result.session.finalizedDocumentId;
    const versionId = result.session.finalizedVersionId;

    if (documentId && result.session.uploadKind === "NEW_DOCUMENT") {
      try {
        const sessionMeta = result.session.metadata || {};
        const originalFileName = typeof sessionMeta.originalFileName === "string" ? sessionMeta.originalFileName : result.session.originalName;
        const safeFileName = typeof sessionMeta.safeFileName === "string" ? sessionMeta.safeFileName : result.session.documentName;
        const displayName = typeof sessionMeta.displayName === "string" && sessionMeta.displayName.trim()
          ? sessionMeta.displayName.trim()
          : originalFileName.replace(/\.[^.]+$/, "");
        const metadataResult = await upsertDriveEngineeringMetadata(
          projectId,
          documentId,
          {
            extra: {
              originalFileName,
              safeFileName,
              displayName,
              planTitle: displayName,
              originalRelativePath: typeof sessionMeta.originalRelativePath === "string" ? sessionMeta.originalRelativePath : "",
              safeRelativePath: typeof sessionMeta.safeRelativePath === "string" ? sessionMeta.safeRelativePath : "",
              nameNormalizationVersion: sessionMeta.nameNormalizationVersion || "1",
              nameWasSanitized: Boolean(sessionMeta.nameWasSanitized),
              nameWasShortened: Boolean(sessionMeta.nameWasShortened),
            },
          },
          {
            userId: access.actor.userId,
            displayName: access.actor.displayName,
            role: access.access.membership.role,
          },
        );
        namingMetadata = { ok: true, metadata: metadataResult.metadata };
      } catch (namingError) {
        namingMetadata = {
          ok: false,
          error: namingError instanceof Error ? namingError.message : "A fájlnév-metaadat inicializálása sikertelen.",
        };
      }
    }

    if (documentId && versionId) {
      try {
        const flowHealth = await getDriveDocumentFlowHealth();
        if (flowHealth.ready) {
          const sourceChannel = result.session.source === "DESKTOP"
            ? "DESKTOP"
            : result.session.source === "SYSTEM"
              ? "SYSTEM"
              : result.session.source === "DROP"
                ? "DROP"
                : "DRIVE";
          const governance = await registerDriveIncomingDocument({
            projectId,
            documentId,
            versionId,
            sourceChannel,
            actorUserId: access.actor.userId,
          });
          documentFlow = { ok: true, governance };
        } else {
          documentFlow = {
            ok: false,
            skipped: true,
            error: flowHealth.errorCode || "DRIVE_DOCUMENT_FLOW_NOT_READY",
          };
        }
      } catch (flowError) {
        documentFlow = {
          ok: false,
          error: flowError instanceof Error
            ? flowError.message
            : "A dokumentum ellenőrzési munkafolyamata nem regisztrálható.",
          code: flowError && typeof flowError === "object" && "code" in flowError
            ? String((flowError as { code?: unknown }).code || "DRIVE_DOCUMENT_FLOW_REGISTER_FAILED")
            : "DRIVE_DOCUMENT_FLOW_REGISTER_FAILED",
        };
      }

      try {
        securityScan = await scanDriveQuarantinedVersion({
          projectId,
          documentId,
          versionId,
          actorUserId: access.actor.userId,
        });
      } catch (scanError) {
        securityScan = {
          ok: false,
          error: scanError instanceof Error ? scanError.message : "A DRIVE vírusvizsgálat nem futott le.",
          code: scanError && typeof scanError === "object" && "code" in scanError
            ? String((scanError as { code?: unknown }).code || "DRIVE_SECURITY_SCAN_FAILED")
            : "DRIVE_SECURITY_SCAN_FAILED",
        };
      }
    }

    return NextResponse.json(
      { ...result, documentFlow, securityScan, namingMetadata },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
