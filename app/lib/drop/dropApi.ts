import { NextResponse } from "next/server";

export function dropNoStoreHeaders() {
  return {
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
  };
}

export function dropErrorResponse(error: unknown) {
  const candidate = error as { message?: string; code?: string; status?: number; details?: Record<string, unknown>; retryAfterMs?: number } | null;
  const status = typeof candidate?.status === "number" ? candidate.status : 500;
  const code = candidate?.code || "DROP_INTERNAL_ERROR";
  const publicMessage = status >= 500 && code === "DROP_INTERNAL_ERROR"
    ? "A DIMPRO Drop művelet váratlan hiba miatt nem hajtható végre."
    : candidate?.message || "A DIMPRO Drop művelet sikertelen.";

  const details = candidate?.details && typeof candidate.details === "object" ? candidate.details : undefined;
  const retryAfterMs = typeof candidate?.retryAfterMs === "number" && Number.isFinite(candidate.retryAfterMs)
    ? Math.max(0, Math.floor(candidate.retryAfterMs))
    : undefined;
  return NextResponse.json(
    { ok: false, error: publicMessage, code, ...(details ? { details } : {}), ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) },
    { status, headers: dropNoStoreHeaders() },
  );
}
