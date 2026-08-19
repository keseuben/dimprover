import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/server-context";
import { CommerceProductError } from "./repository";

export function commerceProductErrorResponse(error: unknown) {
  if (error instanceof CommerceProductError || error instanceof CommerceContextError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json(
    { ok: false, error: "A Commerce Product művelet váratlan hibával leállt.", code: "COMMERCE_PRODUCT_UNEXPECTED" },
    { status: 500 },
  );
}
