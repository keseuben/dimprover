import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import {
  getDriveCoreDatabaseHealth,
  getDriveCompareFindingsHealth,
  getDriveObjectStorageHealth,
  getDriveQuarantineReviewHealth,
  getDriveSecurityScannerHealth,
  getDriveWorkspaceDatabaseHealth,
} from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const [database, objectStorage, review, security, workspace, compareFindings] = await Promise.all([
    getDriveCoreDatabaseHealth(),
    getDriveObjectStorageHealth(),
    getDriveQuarantineReviewHealth(projectId),
    getDriveSecurityScannerHealth(),
    getDriveWorkspaceDatabaseHealth(),
    getDriveCompareFindingsHealth(),
  ]);
  const storageNextStep = !objectStorage.database.ready
    ? "A DRIVE Object Storage 0.4.0 SQL-séma alkalmazása szükséges."
    : !objectStorage.storageConfigured
      ? "Külön privát DRIVE S3-kompatibilis bucket és szerveroldali hozzáférési adatok beállítása szükséges."
      : objectStorage.mode === "disabled"
        ? "A tárhelykapcsolat ellenőrzése után a DIMPRO_DRIVE_STORAGE_MODE értéke először quarantine legyen."
        : objectStorage.mode === "quarantine"
          ? "A karanténfolyamat és a fájlellenőrzés jóváhagyása után kapcsolható active módba a letöltés."
          : "A privát DRIVE objektumtárhely aktív.";

  return NextResponse.json({
    ok: true,
    component: "drive-core",
    projectId,
    database,
    storage: {
      version: objectStorage.version,
      mode: objectStorage.mode,
      provider: objectStorage.provider,
      databaseReady: objectStorage.database.ready,
      storageConfigured: objectStorage.storageConfigured,
      credentialsConfigured: objectStorage.credentialsConfigured,
      bucketConfigured: objectStorage.bucketConfigured,
      realObjectWriteEnabled: objectStorage.uploadReady,
      realObjectDownloadEnabled: objectStorage.downloadReady,
      quarantineRequired: objectStorage.quarantineRequired,
      maxUploadBytes: objectStorage.maxUploadBytes,
      maxUploadMb: objectStorage.maxUploadMb,
      signedUrlTtlSeconds: objectStorage.signedUrlTtlSeconds,
      warning: objectStorage.warning,
      nextStep: storageNextStep,
    },
    workspace: {
      version: workspace.expectedSchemaVersion,
      databaseReady: workspace.ready,
      expectedSchemaVersion: workspace.expectedSchemaVersion,
      actualSchemaVersion: workspace.actualSchemaVersion,
      migrationCount: workspace.migrationCount,
      tables: workspace.tables,
      nextStep: workspace.ready
        ? "A DRIVE Workspace 1.0.0 metaadat, megjegyzés, QR és CsomagBOX adatmodell aktív."
        : "A DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql alkalmazása szükséges a bővített Drive Workspace funkciókhoz.",
    },
    compareFindings: {
      version: "2.0.0",
      databaseReady: compareFindings.ready,
      actualSchemaVersion: compareFindings.schemaVersion,
      bootstrapId: compareFindings.bootstrapId,
      errorCode: compareFindings.errorCode,
      nextStep: compareFindings.ready
        ? "A Compare Findings V2 tartós, auditált eltérési jegyzéke aktív."
        : "A Drive Compare Findings V2 SQL-migráció alkalmazása szükséges.",
    },
    security: {
      version: "0.5.0",
      scannerSource: security.scannerSource,
      ready: security.ready,
      mode: security.mode,
      socketConfigured: security.socketConfigured,
      maxScanMb: security.maxScanMb,
      ping: security.ping,
      engine: security.engine,
      engineVersion: security.engineVersion,
      signatureVersion: security.signatureVersion,
      signatureDate: security.signatureDate,
      errorCode: security.errorCode,
      releaseRule: "WEB/DESKTOP feltöltés csak CLEAN ClamAV eredmény után hagyható jóvá.",
    },
    review: {
      version: review.version,
      databaseReady: review.database.ready,
      expectedSchemaVersion: review.database.expectedSchemaVersion,
      actualSchemaVersion: review.database.actualSchemaVersion,
      pendingCleanupCount: review.pendingCleanupCount,
      cleanupExecutable: review.cleanupExecutable,
      ready: review.ready,
      nextStep: review.ready
        ? "A karanténverziók auditálható jóváhagyása és elutasítása aktív."
        : "A DRIVE Quarantine Review 0.4.1 SQL-séma alkalmazása szükséges.",
    },
    activationSafe: database.ready && workspace.ready && compareFindings.ready && review.ready && objectStorage.uploadReady && security.ready,
  }, { headers: { "cache-control": "no-store" } });
}
