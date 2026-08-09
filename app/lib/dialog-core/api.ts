import { NextResponse } from "next/server";
import { normalizeDialogCoreError } from "./errors";

export function dialogCoreErrorResponse(error: unknown) {
  const normalized = normalizeDialogCoreError(error);
  return NextResponse.json(normalized.body, {
    status: normalized.status,
    headers: { "cache-control": "no-store" },
  });
}
