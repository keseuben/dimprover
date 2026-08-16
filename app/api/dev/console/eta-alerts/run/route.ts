import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { runDevEtaAlerts } from "@/app/lib/dev-center/eta-alerts";
import { engineUnauthorized } from "@/app/api/dev/engine/_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await getDevCenterMutationSubject(request.headers, false))) return engineUnauthorized();
  try {
    const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
    const result = await runDevEtaAlerts({ dryRun: body.dryRun === true });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az ETA push ellenőrzés sikertelen." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
