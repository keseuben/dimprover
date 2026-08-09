import { NextResponse } from "next/server";
import { checkAruterSupabaseReadiness } from "@/app/lib/aruter/supabaseReadiness";

export async function GET() {
  const readiness = await checkAruterSupabaseReadiness();

  return NextResponse.json({
    ok: readiness.missing.length === 0 && readiness.errors.length === 0 && readiness.canReadPublicReservations,
    data: readiness,
  });
}
