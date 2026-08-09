import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { saveDevPushSubscription } from "@/app/lib/dev-center/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a push feliratkozáshoz." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { subscription?: unknown; deviceLabel?: string };
  const result = await saveDevPushSubscription({
    subscription: body.subscription,
    userAgent: request.headers.get("user-agent") || undefined,
    deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel.trim() : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
