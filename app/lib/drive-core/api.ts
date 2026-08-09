import { NextResponse } from "next/server";
import { normalizeDriveCoreError } from "./errors";

export function driveCoreErrorResponse(error: unknown) {
  const normalized = normalizeDriveCoreError(error);
  return NextResponse.json(normalized.body, {
    status: normalized.status,
    headers: { "cache-control": "no-store" },
  });
}
