import { NextRequest, NextResponse } from "next/server";
import { isDeveloperGridAdminAuthorized } from "@/app/lib/developer-grid/benjadmin-admin-auth";
import { getProtectedTelemetryEnrollmentStatus, prepareProtectedTelemetryEnrollment } from "@/app/lib/developer-grid/protected-telemetry-enrollment";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
export async function GET(request: NextRequest) {
  if (!(await isDeveloperGridAdminAuthorized(request.headers))) return json({ ok: false, code: "ADMIN_REQUIRED" }, 401);
  return json({ ok: true, nodes: await getProtectedTelemetryEnrollmentStatus(), productionAccess: "DENY" });
}
export async function POST(request: NextRequest) {
  if (!(await isDeveloperGridAdminAuthorized(request.headers))) return json({ ok: false, code: "ADMIN_REQUIRED" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== "https://admin.dev.dimpro.hu" && origin !== "http://127.0.0.1:3294") return json({ ok: false, code: "ORIGIN_DENIED" }, 403);
  let body: { nodeId?: unknown; confirm?: unknown } = {};
  try { body = await request.json() as typeof body; } catch { return json({ ok: false, code: "JSON_INVALID" }, 400); }
  if ((body.nodeId !== "prod-vps" && body.nodeId !== "db-vps") || body.confirm !== true) return json({ ok: false, code: "NODE_CONFIRMATION_REQUIRED" }, 400);
  try {
    const approval = await prepareProtectedTelemetryEnrollment(body.nodeId);
    return json({ ok: true, approval, productionAccess: "DENY" }, 201);
  } catch (error) {
    const e = error as { code?: unknown; status?: unknown };
    return json({ ok: false, code: String(e?.code || "ENROLLMENT_PREPARE_FAILED"), error: error instanceof Error ? error.message : "Jóváhagyás sikertelen." }, Number(e?.status) || 400);
  }
}
