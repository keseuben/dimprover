import { getDimproSendContextByEntitlementId } from "@/app/lib/identity-core/repository";
import { readBearerToken, verifyDimproSendSession } from "@/app/lib/identity-core/security";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { resolveFieldCaptureProjectCoreId } from "./serverRepository";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = text(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
}

function nullableEnumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const candidate = text(value) as T;
  return allowed.includes(candidate) ? candidate : null;
}

const LOCATION_SOURCES = ["browser-geolocation", "native-bridge", "imported"] as const;
const LOCATION_STATUSES = ["OFF", "REQUESTING", "READY", "UNAVAILABLE", "DENIED", "LOW_ACCURACY"] as const;
const ORIENTATION_SOURCES = ["device-orientation", "native-sensor", "imported"] as const;
const ORIENTATION_STATUSES = ["OFF", "REQUESTING", "READY", "UNAVAILABLE", "DENIED", "UNSTABLE"] as const;
const DIRECTION_LABELS = ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"] as const;
const VOICE_STATUSES = ["NOT_REQUESTED", "RECORDED", "QUEUED", "TRANSCRIBING", "READY", "FAILED"] as const;

export async function authorizeFieldCaptureRequest(request: Request) {
  const token = readBearerToken(request.headers);
  if (!token) {
    throw new DimproIdentityError(
      "A DIMPRO Send-munkamenet token hiányzik.",
      "FIELD_CAPTURE_SEND_SESSION_REQUIRED",
      401,
    );
  }
  const claims = verifyDimproSendSession(token);
  const context = await getDimproSendContextByEntitlementId(claims.entitlementId);
  if (!context.entitlement.canUseStandardSend && !context.entitlement.canUseQuickImageSend) {
    throw new DimproIdentityError(
      "A DIMPRO Send-jogosultság nem használható a Terepi Gyorsrögzítőhöz.",
      "FIELD_CAPTURE_SEND_ENTITLEMENT_NOT_ALLOWED",
      403,
    );
  }
  return { claims, context };
}

export async function resolveAuthorizedProjectCoreId(
  context: Awaited<ReturnType<typeof getDimproSendContextByEntitlementId>>,
  rawProjectId: unknown,
) {
  const projectId = nullableText(rawProjectId);
  if (!projectId) return null;
  const allowed = context.projects.find((project) => project.id === projectId && project.canUploadToDrop);
  if (!allowed) {
    throw new DimproIdentityError(
      "A kiválasztott projekt nem engedélyezett ehhez a Send-jogosultsághoz.",
      "FIELD_CAPTURE_PROJECT_NOT_ALLOWED",
      403,
    );
  }
  return resolveFieldCaptureProjectCoreId(allowed.id);
}

export function parseFieldCaptureSessionBody(body: Record<string, unknown>) {
  const clientSessionId = text(body.clientSessionId);
  if (!clientSessionId || clientSessionId.length > 160) {
    throw new DimproIdentityError(
      "A kliensoldali terepi munkamenet-azonosító érvénytelen.",
      "FIELD_CAPTURE_CLIENT_SESSION_ID_INVALID",
      400,
    );
  }
  return {
    clientSessionId,
    projectId: nullableText(body.projectId),
    defaults: objectValue(body.defaults),
  };
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseFieldCaptureItemBody(body: Record<string, unknown>) {
  const clientItemId = text(body.clientItemId);
  const sequenceNo = Number(body.sequenceNo);
  const capturedAt = text(body.capturedAt);
  const capturedAtMs = Date.parse(capturedAt);
  if (!clientItemId || clientItemId.length > 200 || !Number.isSafeInteger(sequenceNo) || sequenceNo <= 0 || !Number.isFinite(capturedAtMs)) {
    throw new DimproIdentityError(
      "A terepi képtétel alapadatai érvénytelenek.",
      "FIELD_CAPTURE_ITEM_INPUT_INVALID",
      400,
    );
  }

  const assetRaw = objectValue(body.asset);
  const asset = Object.keys(assetRaw).length === 0 ? null : {
    variant: (["ORIGINAL", "OPTIMIZED", "THUMBNAIL"].includes(text(assetRaw.variant))
      ? text(assetRaw.variant)
      : "OPTIMIZED") as "ORIGINAL" | "OPTIMIZED" | "THUMBNAIL",
    originalName: nullableText(assetRaw.originalName),
    displayName: text(assetRaw.displayName) || `${clientItemId}.jpg`,
    mimeType: text(assetRaw.mimeType) || "image/jpeg",
    originalSizeBytes: numberOrNull(assetRaw.originalSizeBytes),
    storedSizeBytes: numberOrNull(assetRaw.storedSizeBytes),
    width: numberOrNull(assetRaw.width),
    height: numberOrNull(assetRaw.height),
    checksumSha256: nullableText(assetRaw.checksumSha256),
    optimized: booleanValue(assetRaw.optimized),
  };

  const locationRaw = objectValue(body.location);
  const orientationRaw = objectValue(body.orientation);
  const voiceRaw = objectValue(body.voice);
  const destinationsRaw = Array.isArray(body.destinations) ? body.destinations : [];

  const destinations = destinationsRaw.flatMap((value) => {
    const row = objectValue(value);
    const target = text(row.target);
    if (!["CAPTURE", "DEVICE", "USER_DRIVE", "PROJECT_DRIVE"].includes(target)) return [];
    const ownershipByTarget = {
      CAPTURE: "CAPTURE",
      DEVICE: "DEVICE",
      USER_DRIVE: "USER",
      PROJECT_DRIVE: "PROJECT",
    } as const;
    return [{
      target: target as "CAPTURE" | "DEVICE" | "USER_DRIVE" | "PROJECT_DRIVE",
      folderId: nullableText(row.folderId),
      ownership: ownershipByTarget[target as keyof typeof ownershipByTarget],
      status: "PENDING" as const,
      retainedIndependently: booleanValue(row.retainedIndependently),
      detail: objectValue(row.detail),
    }];
  });

  return {
    clientItemId,
    sequenceNo,
    capturedAt: new Date(capturedAtMs).toISOString(),
    note: text(body.note).slice(0, 20_000),
    captureOptions: objectValue(body.captureOptions),
    edited: booleanValue(body.edited),
    editRevision: Math.max(0, Math.floor(Number(body.editRevision) || 0)),
    asset,
    location: Object.keys(locationRaw).length ? {
      enabled: booleanValue(locationRaw.enabled),
      latitude: numberOrNull(locationRaw.latitude),
      longitude: numberOrNull(locationRaw.longitude),
      accuracy_meters: numberOrNull(locationRaw.accuracyMeters),
      captured_at: nullableText(locationRaw.capturedAt),
      source: nullableEnumValue(locationRaw.source, LOCATION_SOURCES),
      status: enumValue(locationRaw.status, LOCATION_STATUSES, "OFF"),
      detail: text(locationRaw.detail),
    } : null,
    orientation: Object.keys(orientationRaw).length ? {
      enabled: booleanValue(orientationRaw.enabled),
      heading_degrees: numberOrNull(orientationRaw.headingDegrees),
      heading_accuracy_degrees: numberOrNull(orientationRaw.headingAccuracyDegrees),
      direction_label: nullableEnumValue(orientationRaw.directionLabel, DIRECTION_LABELS),
      captured_at: nullableText(orientationRaw.capturedAt),
      source: nullableEnumValue(orientationRaw.source, ORIENTATION_SOURCES),
      status: enumValue(orientationRaw.status, ORIENTATION_STATUSES, "OFF"),
      detail: text(orientationRaw.detail),
    } : null,
    voice: Object.keys(voiceRaw).length ? {
      transcript_raw: nullableText(voiceRaw.transcriptRaw),
      transcript_cleaned: nullableText(voiceRaw.transcriptCleaned),
      selected_transcript: nullableText(voiceRaw.selectedTranscript),
      status: enumValue(voiceRaw.status, VOICE_STATUSES, "NOT_REQUESTED"),
      audio_retention: text(voiceRaw.audioRetention) === "KEEP_WITH_ITEM" ? "KEEP_WITH_ITEM" : "EPHEMERAL",
    } : null,
    destinations,
  };
}
