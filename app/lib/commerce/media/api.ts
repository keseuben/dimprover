import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/server-context";
import { CommerceMediaUploadError } from "./uploadService";

export function commerceMediaErrorResponse(error: unknown) {
  if (error instanceof CommerceMediaUploadError || error instanceof CommerceContextError) {
    return NextResponse.json({ ok:false, error:error.message, code:error.code }, { status:error.status });
  }
  return NextResponse.json({ ok:false, error:"A Commerce Media művelet váratlan hibával leállt.", code:"COMMERCE_MEDIA_UNEXPECTED" }, { status:500 });
}
