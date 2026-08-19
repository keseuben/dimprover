import { NextResponse } from "next/server";
import { CommerceContextError } from "../core/server-context";
import { CommerceInventoryError } from "./repository";

export function commerceInventoryErrorResponse(error: unknown) {
  if (error instanceof CommerceInventoryError || error instanceof CommerceContextError) {
    return NextResponse.json({ ok:false, error:error.message, code:error.code }, { status:error.status });
  }
  return NextResponse.json({ ok:false, error:"A Commerce Inventory művelet váratlan hibával leállt.", code:"COMMERCE_INVENTORY_UNEXPECTED" }, { status:500 });
}
