import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { createDropPublicSession, getDropSubmissionGateBySlug } from "@/app/lib/drop/public/dropPublicRepository";
import { dropPublicSessionCookie } from "@/app/lib/drop/public/dropPublicSession";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
type Context = { params: Promise<{ slug: string }> };
function safeGate(gate: Awaited<ReturnType<typeof getDropSubmissionGateBySlug>>) {
  return { id: gate.id, slug: gate.slug, type: gate.type, title: gate.title, description: gate.description, recipients: gate.recipients, projectName: gate.projectName, targetFolder: gate.targetFolder, limits: gate.limits, retentionDays: gate.retentionDays, requireSenderEmail: gate.requireSenderEmail, allowPackageComment: gate.allowPackageComment, allowFileComments: gate.allowFileComments, downloadProtection: gate.downloadProtection, expiresAt: gate.expiresAt };
}
export async function GET(_request: NextRequest, context: Context) {
  try { assertDropFeatureEnabled("submissionGateEnabled"); const { slug } = await context.params; return NextResponse.json({ ok: true, version: "DROP 1.2.11", gate: safeGate(await getDropSubmissionGateBySlug(slug)) }, { headers: dropNoStoreHeaders() }); }
  catch (error) { return dropErrorResponse(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    assertDropFeatureEnabled("submissionGateEnabled");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (body?.website) return NextResponse.json({ ok: false, error: "A robotvédelmi ellenőrzés sikertelen.", code: "DROP_PUBLIC_HONEYPOT_BLOCKED" }, { status: 403, headers: dropNoStoreHeaders() });
    const { slug } = await context.params; const gate = await getDropSubmissionGateBySlug(slug);
    const session = await createDropPublicSession({ workflowType: "submission_gate", gateId: gate.id, headers: request.headers });
    const response = NextResponse.json({ ok: true, version: "DROP 1.2.11", gate: safeGate(gate), session: { expiresAt: session.record.expiresAt } }, { status: 201, headers: dropNoStoreHeaders() });
    response.cookies.set(dropPublicSessionCookie(session.rawToken, session.record.expiresAt)); return response;
  } catch (error) { return dropErrorResponse(error); }
}
