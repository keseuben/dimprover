import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDevVapidPublicKey, listDevPushSubscriptions } from "@/app/lib/dev-center/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a push beállításokhoz." }, { status: 401 });
  }
  const publicKey = getDevVapidPublicKey();
  const subscriptions = await listDevPushSubscriptions();
  return NextResponse.json({
    ok: Boolean(publicKey),
    configured: Boolean(publicKey),
    publicKey,
    subscriptionCount: subscriptions.length,
  }, { headers: { "cache-control": "no-store" } });
}
