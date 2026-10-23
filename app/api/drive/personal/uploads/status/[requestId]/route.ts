import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { validPersonalUploadRequestId } from "@/app/lib/content-core/personalUploadPolicy";
import { findOwnedPersonalUploadReceipt } from "@/app/lib/content-core/repository";
import { assessPersonalUploadConfirmation } from "@/app/lib/content-core/personalUploadConfirmation";
import { calculateDriveObjectSha256 } from "@/app/lib/drive-core/s3ObjectStorage";
import { getDriveObjectStorageConfig } from "@/app/lib/drive-core/storageConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };
const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers });

type RouteContext = { params: Promise<{ requestId: string }> };

/** Inspection only; no file upload, no state mutation and no auto-retry. */
export async function GET(request: NextRequest, context: RouteContext) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  if (process.env.DIMPRO_PRODUCTION_ACCESS !== "DENY"
    || process.env.DIMPRO_AUTH_ENVIRONMENT !== "DEV") {
    return reply({ ok: false, code: "PERSONAL_UPLOAD_STATUS_DEV_ONLY", retryAllowed: false }, 403);
  }
  const { requestId } = await context.params;
  if (!validPersonalUploadRequestId(requestId)) {
    return reply({ ok: false, code: "PERSONAL_UPLOAD_REQUEST_ID_INVALID", retryAllowed: false }, 400);
  }
  try {
    const confirmation = await assessPersonalUploadConfirmation({
      ownerUserId: access.contentUserId, requestId,
      expectedBucket: getDriveObjectStorageConfig().bucket,
      findOwnedReceipt: async (userId, id) =>
        findOwnedPersonalUploadReceipt({ userId, requestId: id }),
      hashStoredObject: async (bucket, key) => {
        const found = await calculateDriveObjectSha256({ bucket, storageKey: key });
        return { sha256: found.sha256, sizeBytes: found.sizeBytes };
      },
    });
    if (confirmation.state === "PENDING_OR_NOT_FOUND") return reply(confirmation, 202);
    if (confirmation.state === "OBJECT_UNVERIFIED") return reply(confirmation, 409);
    return reply(confirmation);
  } catch {
    return reply({
      ok: false, code: "PERSONAL_UPLOAD_STATUS_UNAVAILABLE",
      retryAllowed: false,
    }, 503);
  }
}
