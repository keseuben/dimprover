"use client";

import { dropFetchWithRetry } from "@/components/drop/dropNetworkClient";
import { FIELD_CAPTURE_VERSION, type FieldCaptureItem, type FieldCaptureLocalSession } from "./types";

export type FieldCaptureFinalizeReadiness = {
  ready: boolean;
  needsServerSync: boolean;
  pendingCount: number;
  failedCount: number;
  projectDriveBlockedCount: number;
  reason: string | null;
};

export type FieldCaptureFinalizeResult = {
  serverSessionId: string;
  status: "CLOSED";
  closedAt: string | null;
  reused: boolean;
  itemCount: number;
};

type JsonResult = Record<string, unknown>;

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: "Bearer " + token };
}

async function postJson(url: string, token: string, body: unknown, signal?: AbortSignal): Promise<JsonResult> {
  const response = await dropFetchWithRetry(url, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, { signal });
  const payload = await response.json().catch(() => ({})) as JsonResult;
  if (!response.ok) {
    const error = new Error(String(payload.error || "A terepi munkamenet lezárása sikertelen."));
    Object.assign(error, { status: response.status, code: payload.code || null, payload });
    throw error;
  }
  return payload;
}

export function getFieldCaptureFinalizeReadiness(items: FieldCaptureItem[]): FieldCaptureFinalizeReadiness {
  if (!items.length) {
    return { ready: false, needsServerSync: false, pendingCount: 0, failedCount: 0, projectDriveBlockedCount: 0, reason: "A lezáráshoz legalább egy terepi kép szükséges." };
  }

  const projectDriveBlockedCount = items.filter((item) => item.options.saveToProjectDrive).length;
  if (projectDriveBlockedCount > 0) {
    return {
      ready: false,
      needsServerSync: false,
      pendingCount: projectDriveBlockedCount,
      failedCount: 0,
      projectDriveBlockedCount,
      reason: "A Projektkapu Drive P9 cél még nincs aktiválva. A munkamenet lezárása előtt ezt a mentési célt ki kell kapcsolni.",
    };
  }

  const failedCount = items.filter((item) => item.status === "ERROR").length;
  const incomplete = items.filter((item) => {
    if (item.options.saveToUserDrive) return item.status !== "SYNCED";
    return item.status !== "SERVER_STORED" && item.status !== "SYNCED";
  });
  const pendingCount = incomplete.filter((item) => item.status !== "ERROR").length;

  if (failedCount > 0) {
    return {
      ready: false,
      needsServerSync: true,
      pendingCount,
      failedCount,
      projectDriveBlockedCount: 0,
      reason: `${failedCount} képtétel szinkronhibás. Újrapróbálás szükséges a lezárás előtt.`,
    };
  }
  if (incomplete.length > 0) {
    return {
      ready: false,
      needsServerSync: true,
      pendingCount,
      failedCount: 0,
      projectDriveBlockedCount: 0,
      reason: `${incomplete.length} képtétel még szerveres vagy Drive-mentésre vár.`,
    };
  }

  return { ready: true, needsServerSync: false, pendingCount: 0, failedCount: 0, projectDriveBlockedCount: 0, reason: null };
}

export async function finalizeFieldCaptureSession(input: {
  identity: { sessionToken: string };
  session: FieldCaptureLocalSession;
  expectedItemCount: number;
  signal?: AbortSignal;
}): Promise<FieldCaptureFinalizeResult> {
  if (!input.identity.sessionToken) throw new Error("A DIMPRO Send munkamenet hiányzik.");
  if (!Number.isSafeInteger(input.expectedItemCount) || input.expectedItemCount <= 0) {
    throw new Error("A terepi munkamenet lezárásához érvényes tételszám szükséges.");
  }

  const sessionPayload = await postJson("/api/field-capture/sessions", input.identity.sessionToken, {
    clientSessionId: input.session.id,
    projectId: input.session.projectId,
    defaults: { projectName: input.session.projectName, clientVersion: FIELD_CAPTURE_VERSION },
  }, input.signal);
  const serverSessionId = String((sessionPayload.session as { id?: unknown } | undefined)?.id || "");
  if (!serverSessionId) throw new Error("A szerveres terepi munkamenet nem állítható helyre a lezáráshoz.");

  const finalizePayload = await postJson(
    `/api/field-capture/sessions/${encodeURIComponent(serverSessionId)}/finalize`,
    input.identity.sessionToken,
    { expectedItemCount: input.expectedItemCount },
    input.signal,
  );
  const serverSession = finalizePayload.session as { status?: unknown; closedAt?: unknown } | undefined;
  if (finalizePayload.finalized !== true || serverSession?.status !== "CLOSED") {
    throw new Error("A DIMPRO szerver nem igazolta a terepi munkamenet lezárását.");
  }

  return {
    serverSessionId,
    status: "CLOSED",
    closedAt: typeof serverSession.closedAt === "string" ? serverSession.closedAt : null,
    reused: finalizePayload.reused === true,
    itemCount: Number(finalizePayload.itemCount || input.expectedItemCount),
  };
}
