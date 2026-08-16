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
    const body = await request.json().catch(() => ({})) as { taskId?: string };
    const taskId = typeof body.taskId === "string" && /^[A-Za-z0-9_-]{4,120}$/.test(body.taskId.trim())
      ? body.taskId.trim()
      : "";
    const targetUrl = taskId
      ? `/admin/dev-console?task=${encodeURIComponent(taskId)}`
      : "/admin/dev-console";
    const result = await sendDevPushNotification({
      title: "DIMPRO Dev tesztértesítés",
      body: taskId
        ? "A push csatorna működik. Koppintson az értesítésre a konkrét BENJADMIN feladat megnyitásához."
        : "A mobilos push értesítés és a fejlesztési emlékeztető csatorna működik.",
      url: targetUrl,
      tag: `dimpro-dev-test-${Date.now()}`,
      priority: "high",
    });
    return NextResponse.json({ ...result, targetTaskId: taskId || null, targetUrl }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A tesztértesítés sikertelen." }, { status: 500 });
  }
}
