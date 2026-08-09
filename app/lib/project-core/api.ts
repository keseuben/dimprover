import { NextResponse } from "next/server";
import { normalizeProjectCoreError } from "./errors";

export function projectCoreErrorResponse(error: unknown) {
  const normalized = normalizeProjectCoreError(error);
  return NextResponse.json(normalized.body, { status: normalized.status, headers: { "cache-control": "no-store" } });
}
