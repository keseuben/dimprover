import { NextRequest, NextResponse } from "next/server";
import { isProtectedTelemetryAuthorized, sanitizeProtectedTelemetryPayload, storeProtectedTelemetry, type ProtectedTelemetryPayload } from "@/app/lib/developer-grid/protected-telemetry-ingress";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
export async function POST(request: NextRequest) {
  if (!(await isProtectedTelemetryAuthorized(request.headers))) return json({ ok: false, code: "PROTECTED_TELEMETRY_UNAUTHORIZED", error: "Protected telemetry hitelesítés sikertelen." }, 401);
  let payload: ProtectedTelemetryPayload;
  try { payload = await request.json() as ProtectedTelemetryPayload; } catch { return json({ ok: false, code: "PROTECTED_TELEMETRY_JSON_INVALID", error: "Érvénytelen JSON." }, 400); }
  try {
    const sample = sanitizeProtectedTelemetryPayload(payload); const stored = await storeProtectedTelemetry(sample);
    return json({ ok: true, accepted: { nodeId: stored.nodeId, sampledAt: stored.sampledAt }, environment: "DEV", productionAccess: "DENY" }, 202);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "PROTECTED_TELEMETRY_REJECTED";
    return json({ ok: false, code, error: error instanceof Error ? error.message : "Protected telemetry minta elutasítva." }, 400);
  }
}
export async function GET() { return json({ ok: false, code: "PROTECTED_TELEMETRY_WRITE_ONLY", error: "Ez a végpont kizárólag sanitizált read-only host metrika fogadására szolgál." }, 405); }
