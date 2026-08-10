import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { createDropPublicWorkflowPackage } from "@/app/lib/drop/public/dropPublicWorkflowService";
import { DROP_PUBLIC_SESSION_COOKIE } from "@/app/lib/drop/public/dropPublicSession";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const rawSession = request.cookies.get(DROP_PUBLIC_SESSION_COOKIE)?.value?.trim() || "";
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Érvénytelen küldeményadatok.", code: "DROP_PUBLIC_PACKAGE_INPUT_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    assertDropFeatureEnabled(body.workflowType === "submission_gate" ? "submissionGateEnabled" : "sendEnabled");
    const created = await createDropPublicWorkflowPackage({ rawSession, headers: request.headers, body });
    return NextResponse.json({ ok: true, version: "DROP 1.2.12", created }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
