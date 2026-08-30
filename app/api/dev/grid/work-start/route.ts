import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { bindDeveloperGridConversation, getDeveloperGridActiveWork, startDeveloperGridWork } from "@/app/lib/developer-grid/work-start";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store", "x-dimpro-environment": "DEV", "x-dimpro-production-access": "DENY" } });
}

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try { return json({ ok: true, activeWork: await getDeveloperGridActiveWork(), productionAccess: "DENY" }); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Az aktív Developer Grid munka nem tölthető be." }, 500); }
}

export async function POST(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try {
    const result = await startDeveloperGridWork(await request.json().catch(() => ({})));
    return json({ ok: true, work: result });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "DEVELOPER_GRID_WORK_START_FAILED";
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) || 500 : code === "SOURCE_BASELINE_MISMATCH" ? 409 : 500;
    return json({ ok: false, code, error: error instanceof Error ? error.message : "A Developer Grid munkaindítás sikertelen." }, status);
  }
}
export async function PATCH(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) return json({ ok: false, error: "A Developer Grid eszköz nincs párosítva." }, 401);
  try {
    const binding = await bindDeveloperGridConversation(await request.json().catch(() => ({})));
    return json({ ok: true, binding });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "DEVELOPER_GRID_CHAT_BIND_FAILED";
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return json({ ok: false, code, error: error instanceof Error ? error.message : "A ChatGPT csevegés nem rögzíthető." }, status);
  }
}
