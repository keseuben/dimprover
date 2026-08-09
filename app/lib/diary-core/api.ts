import { NextResponse } from "next/server";
import { DiaryCoreRepositoryError } from "./errors";

export function diaryCoreErrorResponse(error: unknown) {
  if (error instanceof DiaryCoreRepositoryError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { ok: false, error: "A DIARY művelet váratlan hibával leállt.", code: "DIARY_CORE_UNEXPECTED_ERROR" },
    { status: 500 },
  );
}
