import { NextResponse } from "next/server";
import { DecideCoreRepositoryError } from "./errors";

export function decideCoreErrorResponse(error: unknown) {
  if (error instanceof DecideCoreRepositoryError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { ok: false, error: "A DECIDE művelet váratlan hibával leállt.", code: "DECIDE_CORE_UNEXPECTED_ERROR" },
    { status: 500 },
  );
}
