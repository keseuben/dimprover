"use client";

import { uploadDropInitialized, type DropInitializedUpload } from "@/components/drop/dropMultipartClient";
import { dropFetchWithRetry } from "@/components/drop/dropNetworkClient";
import { DROP_UPLOAD_RULES_VERSION, isDropUploadRulesAcceptanceFresh } from "@/app/lib/drop/dropUploadRules";
import { patchFieldCaptureItem } from "./offlineQueue";
import { FIELD_CAPTURE_VERSION, type FieldCaptureItem, type FieldCaptureLocalSession, type FieldCaptureSyncState } from "./types";

export type FieldCaptureClientSyncPatch = {
  status?: FieldCaptureSyncState;
  progress?: number;
  error?: string | null;
};

export type FieldCaptureClientSyncResult = {
  serverSessionId: string;
  stagingPackageId: string;
  synced: number;
  pendingDestinations: number;
  failed: number;
};

type JsonResult = Record<string, unknown>;

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: "Bearer " + token };
}

async function requestJson(url: string, token: string, body: unknown, signal?: AbortSignal): Promise<JsonResult> {
  const response = await dropFetchWithRetry(url, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, { signal });
  const payload = await response.json().catch(() => ({})) as JsonResult;
  if (!response.ok) {
    const error = new Error(String(payload.error || "A DIMPRO szerveres szinkron művelet sikertelen."));
    Object.assign(error, { status: response.status, code: payload.code || null, payload });
    throw error;
  }
  return payload;
}

function serverItemBody(item: FieldCaptureItem) {
  const destinations: Array<{ target: "CAPTURE" | "DEVICE" | "USER_DRIVE" | "PROJECT_DRIVE"; folderId: string | null; retainedIndependently: boolean; detail: Record<string, unknown> }> = [
    { target: "CAPTURE", folderId: null, retainedIndependently: false, detail: { source: "terep-client-sync" } },
  ];
  if (item.options.saveToDevice) destinations.push({ target: "DEVICE", folderId: null, retainedIndependently: true, detail: { localCopy: true } });
  if (item.options.saveToUserDrive) destinations.push({ target: "USER_DRIVE", folderId: null, retainedIndependently: true, detail: { scope: "USER_ROOT" } });
  if (item.options.saveToProjectDrive) destinations.push({ target: "PROJECT_DRIVE", folderId: null, retainedIndependently: true, detail: { disabledUntilP9: true } });
  return {
    clientItemId: item.id,
    sequenceNo: item.sequence,
    capturedAt: item.capturedAt,
    note: item.note,
    captureOptions: item.options,
    edited: item.edited,
    editRevision: item.editRevision,
    asset: {
      variant: "OPTIMIZED",
      originalName: item.originalName,
      displayName: item.displayName,
      mimeType: item.uploadFile.type || "application/octet-stream",
      originalSizeBytes: item.originalSize,
      storedSizeBytes: item.uploadSize,
      width: item.width,
      height: item.height,
      checksumSha256: null,
      optimized: item.optimized,
    },
    location: item.location,
    orientation: item.orientation,
    voice: item.voiceTranscript.trim() ? {
      transcriptRaw: item.voiceTranscript,
      transcriptCleaned: item.voiceTranscript,
      selectedTranscript: item.voiceTranscript,
      status: "READY",
      audioRetention: "EPHEMERAL",
    } : null,
    destinations,
  };
}

async function persistPatch(
  itemId: string,
  patch: FieldCaptureClientSyncPatch,
  onPatch?: (itemId: string, patch: FieldCaptureClientSyncPatch) => void,
) {
  await patchFieldCaptureItem(itemId, patch).catch(() => undefined);
  onPatch?.(itemId, patch);
}

export async function syncFieldCaptureSession(input: {
  identity: { sessionToken: string };
  session: FieldCaptureLocalSession;
  items: FieldCaptureItem[];
  rulesVersion: string | null;
  rulesAcceptedAt: string | null;
  signal?: AbortSignal;
  onPatch?: (itemId: string, patch: FieldCaptureClientSyncPatch) => void;
}): Promise<FieldCaptureClientSyncResult> {
  if (!input.identity.sessionToken) throw new Error("A DIMPRO Send munkamenet hiányzik.");
  if (!isDropUploadRulesAcceptanceFresh({ version: input.rulesVersion, acceptedAt: input.rulesAcceptedAt })) {
    throw new Error("A feltöltési szabályzat friss elfogadása szükséges a szerveres szinkronhoz.");
  }
  const sessionPayload = await requestJson("/api/field-capture/sessions", input.identity.sessionToken, {
    clientSessionId: input.session.id,
    projectId: input.session.projectId,
    defaults: { projectName: input.session.projectName, clientVersion: FIELD_CAPTURE_VERSION },
  }, input.signal);
  const serverSessionId = String((sessionPayload.session as { id?: unknown } | undefined)?.id || "");
  if (!serverSessionId) throw new Error("A szerveres terepi munkamenet nem jött létre.");

  const stagingPayload = await requestJson(
    "/api/field-capture/sessions/" + encodeURIComponent(serverSessionId) + "/staging-package",
    input.identity.sessionToken,
    {},
    input.signal,
  );
  const stagingPackageId = String((stagingPayload.staging as { packageId?: unknown } | undefined)?.packageId || "");
  if (!stagingPackageId) throw new Error("A privát terepi staging csomag nem jött létre.");

  let synced = 0;
  let pendingDestinations = 0;
  let failed = 0;

  for (const item of input.items) {
    if (input.signal?.aborted) throw new DOMException("A szinkron megszakadt.", "AbortError");
    try {
      await persistPatch(item.id, { status: "QUEUED", progress: 0, error: null }, input.onPatch);
      const itemPayload = await requestJson(
        "/api/field-capture/sessions/" + encodeURIComponent(serverSessionId) + "/items",
        input.identity.sessionToken,
        serverItemBody(item),
        input.signal,
      );
      const serverItemId = String((itemPayload.item as { id?: unknown } | undefined)?.id || "");
      if (!serverItemId) throw new Error("A szerveres terepi képtétel nem jött létre.");

      const uploadPayload = await requestJson(
        "/api/field-capture/sessions/" + encodeURIComponent(serverSessionId) + "/items/" + encodeURIComponent(serverItemId) + "/upload",
        input.identity.sessionToken,
        {
          packageId: stagingPackageId,
          rulesAccepted: true,
          rulesVersion: DROP_UPLOAD_RULES_VERSION,
          rulesAcceptedAt: input.rulesAcceptedAt,
        },
        input.signal,
      );
      const initialized = uploadPayload.upload as DropInitializedUpload | undefined;
      if (!initialized?.session?.id || !initialized.uploadToken || !initialized.completeUrl) {
        throw new Error("A Drop feltöltési munkamenet hiányos.");
      }
      await persistPatch(item.id, { status: "UPLOADING", progress: 0, error: null }, input.onPatch);
      await uploadDropInitialized({
        initialized,
        file: item.uploadFile,
        signal: input.signal,
        onProgress: (progress) => {
          void persistPatch(item.id, { status: "UPLOADING", progress, error: null }, input.onPatch);
        },
      });

      const completeResponse = await dropFetchWithRetry(initialized.completeUrl, {
        method: "POST",
        headers: { authorization: "Bearer " + initialized.uploadToken },
      }, { signal: input.signal });
      const completePayload = await completeResponse.json().catch(() => ({})) as JsonResult;
      if (!completeResponse.ok) throw new Error(String(completePayload.error || "A Drop feltöltés véglegesítése sikertelen."));

      const reconcilePayload = await requestJson(
        "/api/field-capture/sessions/" + encodeURIComponent(serverSessionId) + "/items/" + encodeURIComponent(serverItemId) + "/upload/reconcile",
        input.identity.sessionToken,
        {},
        input.signal,
      );
      if (reconcilePayload.stored !== true) throw new Error("A szerveres tárolás még nem igazolt.");
      await persistPatch(item.id, { status: "SERVER_STORED", progress: 100, error: null }, input.onPatch);

      if (item.options.saveToUserDrive) {
        try {
          const drivePayload = await requestJson(
            "/api/field-capture/sessions/" + encodeURIComponent(serverSessionId) + "/items/" + encodeURIComponent(serverItemId) + "/user-drive",
            input.identity.sessionToken,
            {},
            input.signal,
          );
          if (drivePayload.driveSynced !== true) throw new Error("A Saját Drive mentés nem igazolt.");
          await persistPatch(item.id, { status: "SYNCED", progress: 100, error: null }, input.onPatch);
          synced += 1;
        } catch (error) {
          const code = String((error as { code?: unknown } | null)?.code || "");
          const status = Number((error as { status?: unknown } | null)?.status || 0);
          if (status === 409 && code === "FIELD_CAPTURE_USER_DRIVE_SCAN_PENDING") {
            await persistPatch(item.id, { status: "DESTINATION_PENDING", progress: 100, error: "Vírusellenőrzés után a Saját Drive mentés automatikusan újrapróbálható." }, input.onPatch);
            pendingDestinations += 1;
          } else {
            throw error;
          }
        }
      } else {
        synced += 1;
      }
    } catch (error) {
      failed += 1;
      await persistPatch(item.id, { status: "ERROR", error: error instanceof Error ? error.message : "A terepi szinkron sikertelen." }, input.onPatch);
    }
  }

  return { serverSessionId, stagingPackageId, synced, pendingDestinations, failed };
}
