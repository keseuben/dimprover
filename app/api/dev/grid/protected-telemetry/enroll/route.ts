import { NextRequest, NextResponse } from "next/server";
import { enrollProtectedTelemetryNode } from "@/app/lib/developer-grid/protected-telemetry-enrollment";
import type { ProtectedTelemetryNodeId } from "@/app/lib/developer-grid/protected-telemetry-ingress";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
const json = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { "cache-control": "no-store, no-cache, must-revalidate", "pragma": "no-cache", "x-content-type-options": "nosniff" } });
export async function POST(request: NextRequest) {
  let body: { nodeId?: unknown; nonce?: unknown; enrollmentCode?: unknown } = {};
  try { body = await request.json() as typeof body; } catch { return json({ ok: false, code: "PROTECTED_TELEMETRY_ENROLL_JSON_INVALID" }, 400); }
  if (body.nodeId !== "prod-vps" && body.nodeId !== "db-vps") return json({ ok: false, code: "PROTECTED_TELEMETRY_NODE_INVALID" }, 400);
  try {
    const enrolled = await enrollProtectedTelemetryNode({ nodeId: body.nodeId as ProtectedTelemetryNodeId, nonce: body.nonce, enrollmentCode: body.enrollmentCode }, request.headers);
    return json({ ok: true, nodeId: enrolled.nodeId, key: enrolled.key, issuedAt: enrolled.issuedAt, productionAccess: "DENY" }, 201);
  } catch (error) {
    const e = error as { code?: unknown; status?: unknown };
    return json({ ok: false, code: String(e?.code || "PROTECTED_TELEMETRY_ENROLL_FAILED"), error: error instanceof Error ? error.message : "Regisztráció sikertelen." }, Number(e?.status) || 400);
  }
}
export async function GET() { return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405); }
