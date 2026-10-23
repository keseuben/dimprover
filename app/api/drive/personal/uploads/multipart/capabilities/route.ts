import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { personalMultipartFeatureEnabled, PERSONAL_MULTIPART_MAX_BYTES } from "@/app/lib/content-core/personalMultipartPolicy";
import { getPersonalMultipartSchemaReadiness } from "@/app/lib/content-core/personalMultipartRepository";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { getDriveSecurityScannerHealth, getDriveScannerUploadLimitBytes } from "@/app/lib/drive-core/securityScanService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noCache = { "cache-control": "private, no-store" };
export async function GET(request: NextRequest) {
  const actor = await resolvePersonalDriveContentActor(request);
  if (!actor.ok) return actor.response;

  // A future feature must not trigger DB/AV queries or advertise readiness by default.
  if (!personalMultipartFeatureEnabled(process.env)) {
    return NextResponse.json({ ok: true, enabled: false,
      plannedMaxFileBytes: PERSONAL_MULTIPART_MAX_BYTES, usableMaxFileBytes: 0,
      reason: "PERSONAL_MULTIPART_FEATURE_OFF" }, { headers: noCache });
  }
  try {
    const config = getDriveObjectStorageConfig();
    const storage = getDriveObjectStorageSafeStatus(config);
    const [schema, scanner] = await Promise.all([
      getPersonalMultipartSchemaReadiness(), getDriveSecurityScannerHealth(),
    ]);
    const scannerCapBytes = getDriveScannerUploadLimitBytes();
    // Presently the existing scanner tops out at <=600 MiB in configuration.
    // Full-file 5 GiB clearance requires a separately validated AV/worker pipeline.
    const verifiedWorker = process.env.DIMPRO_DRIVE_PERSONAL_LARGE_SCAN_VERIFIED === "true"
      && scanner.ready && scannerCapBytes >= PERSONAL_MULTIPART_MAX_BYTES;
    const ready = schema.ready && storage.objectWriteEnabled && storage.objectDownloadEnabled
      && config.maxUploadBytes >= PERSONAL_MULTIPART_MAX_BYTES && verifiedWorker;
    return NextResponse.json({
      ok: true, enabled: ready, plannedMaxFileBytes: PERSONAL_MULTIPART_MAX_BYTES,
      usableMaxFileBytes: ready ? PERSONAL_MULTIPART_MAX_BYTES : 0,
      reason: ready ? null : "PERSONAL_MULTIPART_RELEASE_GATE_NOT_MET",
    }, { headers: noCache });
  } catch {
    return NextResponse.json({ ok: true, enabled: false,
      plannedMaxFileBytes: PERSONAL_MULTIPART_MAX_BYTES, usableMaxFileBytes: 0,
      reason: "PERSONAL_MULTIPART_READINESS_UNKNOWN" }, { headers: noCache });
  }
}
