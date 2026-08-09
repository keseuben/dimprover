import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { sendDevPushNotification } from "@/app/lib/dev-center/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság tesztértesítés küldéséhez." }, { status: 401 });
  }
  try {
    const result = await sendDevPushNotification({
      title: "DIMPRO Dev tesztértesítés",
      body: "A mobilos push értesítés és a fejlesztési emlékeztető csatorna működik.",
      url: "/admin/dev#ertesitesek",
      tag: `dimpro-dev-test-${Date.now()}`,
      priority: "high",
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A tesztértesítés sikertelen." }, { status: 500 });
  }
}
