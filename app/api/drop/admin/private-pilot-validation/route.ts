import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  getDropPrivatePilotValidation,
  updateDropPrivatePilotValidation,
} from "@/app/lib/drop/validation/dropPrivatePilotValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: dropNoStoreHeaders() });
}

function unauthorized() {
  return response({
    ok: false,
    error: "Nincs jogosultság a DROP 1.0.0 private-pilot validációs központhoz.",
    code: "DROP_PRIVATE_PILOT_UNAUTHORIZED",
  }, 401);
}

function errorResponse(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code || "DROP_PRIVATE_PILOT_FAILED")
    : "DROP_PRIVATE_PILOT_FAILED";
  const message = error instanceof Error
    ? error.message
    : "A DROP 1.0.0 private-pilot validációs művelet sikertelen.";
  const status = code.includes("STATE_INVALID") ? 503 : 400;
  return response({ ok: false, error: message, code }, status);
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const validation = await getDropPrivatePilotValidation();
    return response({ ok: true, ...validation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return response({
        ok: false,
        error: "Érvénytelen private-pilot validációs kérés.",
        code: "DROP_PRIVATE_PILOT_INPUT_INVALID",
      }, 400);
    }
    const updated = await updateDropPrivatePilotValidation({
      id: body.id,
      status: body.status,
      notes: body.notes,
      evidence: body.evidence,
      environment: body.environment,
      device: body.device,
    });
    return response({ ok: true, version: "DROP 1.0.0", ...updated });
  } catch (error) {
    return errorResponse(error);
  }
}
