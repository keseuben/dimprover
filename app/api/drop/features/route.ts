import { NextResponse } from "next/server";
import { getDropFeatureState } from "@/app/lib/drop/dropFeatureFlags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getDropFeatureState(), {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
