import { NextResponse } from "next/server";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export function personalBoxErrorResponse(error: unknown, fallback = "PERSONAL_BOX_OPERATION_FAILED") {
  const status = error instanceof DimproIdentityError ? error.status : 500;
  const code = error instanceof DimproIdentityError ? error.code : fallback;
  const message = error instanceof Error ? error.message : "A Saját Drive CsomagBOX művelet sikertelen.";
  return NextResponse.json({ ok: false, error: message, code }, { status, headers: { "cache-control": "no-store" } });
}
