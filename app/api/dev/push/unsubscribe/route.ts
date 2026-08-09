import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { removeDevPushSubscription } from "@/app/lib/dev-center/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a push leiratkozáshoz." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { endpoint?: string };
  if (!body.endpoint) return NextResponse.json({ ok: false, error: "A push endpoint kötelező." }, { status: 400 });
  const result = await removeDevPushSubscription(body.endpoint);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
