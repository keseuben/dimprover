import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import {
  getDeveloperGridActiveWork,
  recoverDeveloperGridLaunchExecution,
  retargetDeveloperGridPreBootSource,
} from "@/app/lib/developer-grid/work-start";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-dimpro-environment": "DEV",
      "x-dimpro-production-access": "DENY",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return json({ ok: false, error: "Nincs BENJADMIN Central Core jogosultság." }, 401);
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").toUpperCase();

    if (action === "RECOVER_LAUNCH_EXECUTION") {
      const recovery = await recoverDeveloperGridLaunchExecution(body);
      return json({ ok: true, recovery, activeWork: await getDeveloperGridActiveWork() });
    }

    if (action === "RETARGET_PRE_BOOT_SOURCE") {
      const retarget = await retargetDeveloperGridPreBootSource(body);
      return json({ ok: true, retarget, activeWork: await getDeveloperGridActiveWork() });
    }

    return json({ ok: false, code: "DEVELOPER_GRID_CENTRAL_CORE_ACTION_INVALID", error: "Ismeretlen Central Core recovery művelet." }, 400);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "DEVELOPER_GRID_CENTRAL_CORE_RECOVERY_FAILED";
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
    return json({ ok: false, code, error: error instanceof Error ? error.message : "A Central Core recovery sikertelen." }, status);
  }
}
