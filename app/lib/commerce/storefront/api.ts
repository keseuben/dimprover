import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/errors";
import { CommerceStorefrontError } from "./repository";

export function commerceStorefrontErrorResponse(error: unknown) {
  if (error instanceof CommerceStorefrontError || error instanceof CommerceContextError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json(
    { ok: false, error: "A Commerce Storefront művelet váratlan hibával leállt.", code: "COMMERCE_STOREFRONT_UNEXPECTED" },
    { status: 500 },
  );
}
