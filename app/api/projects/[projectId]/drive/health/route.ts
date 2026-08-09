import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import {
  getDriveCoreDatabaseHealth,
  getDriveObjectStorageHealth,
  getDriveQuarantineReviewHealth,
  getDriveWorkspaceDatabaseHealth,
} from "@/app/lib/drive-core/store";

type RouteContext = { params: Promise<{ projectId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.read");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const [database, objectStorage, review, workspace] = await Promise.all([
    getDriveCoreDatabaseHealth(),
    getDriveObjectStorageHealth(),
    getDriveQuarantineReviewHealth(projectId),
    getDriveWorkspaceDatabaseHealth(),
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
    activationSafe: database.ready,
  }, { headers: { "cache-control": "no-store" } });
}
