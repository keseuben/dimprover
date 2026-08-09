import { NextResponse } from "next/server";
import { getDropRuntimeHealth } from "@/app/lib/drop/dropRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getDropRuntimeHealth(), {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
