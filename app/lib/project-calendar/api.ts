import { NextResponse } from "next/server";
import { normalizeProjectCalendarError } from "./errors";

export function projectCalendarErrorResponse(error: unknown) {
  const normalized = normalizeProjectCalendarError(error);
  return NextResponse.json(normalized.body, {
    status: normalized.status,
    headers: { "cache-control": "no-store" },
  });
}
