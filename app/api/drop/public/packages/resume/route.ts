import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { resumeDropPublicWorkflowPackage } from "@/app/lib/drop/public/dropPublicWorkflowService";
import { DROP_PUBLIC_SESSION_COOKIE } from "@/app/lib/drop/public/dropPublicSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const rawSession = request.cookies.get(DROP_PUBLIC_SESSION_COOKIE)?.value?.trim() || "";
    if (!rawSession) {
      return NextResponse.json({ ok: true, version: "DROP 1.2.11", resume: null }, { headers: dropNoStoreHeaders() });
    }
    const expectedWorkflowType = request.nextUrl.searchParams.get("workflowType");
    const expectedGateSlug = request.nextUrl.searchParams.get("gateSlug")?.trim() || undefined;
    const resume = await resumeDropPublicWorkflowPackage({
      rawSession,
      headers: request.headers,
      expectedWorkflowType: expectedWorkflowType === "send" || expectedWorkflowType === "submission_gate" ? expectedWorkflowType : undefined,
      expectedGateSlug,
    });
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", resume }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
