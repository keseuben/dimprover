import { NextResponse } from "next/server";
import { ProjectIssueRepositoryError } from "./issueRepository";

export function projectIssueErrorResponse(error: unknown) {
  if (error instanceof ProjectIssueRepositoryError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: false, error: "A Project Issue Core művelet váratlan hibával leállt.", code: "PROJECT_ISSUE_UNEXPECTED_ERROR" }, { status: 500, headers: { "cache-control": "no-store" } });
}
