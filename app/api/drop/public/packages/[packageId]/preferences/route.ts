import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { resolveDropPublicSession, updateDropPackageWorkflow } from "@/app/lib/drop/public/dropPublicRepository";
import { DROP_PUBLIC_SESSION_COOKIE } from "@/app/lib/drop/public/dropPublicSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ packageId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { packageId } = await context.params;
    const rawSession = request.cookies.get(DROP_PUBLIC_SESSION_COOKIE)?.value?.trim() || "";
    const session = await resolveDropPublicSession(rawSession, request.headers, undefined, true);
    if (session.packageId !== packageId) {
      return NextResponse.json({ ok: false, error: "A csomag nem ehhez a Send-munkamenethez tartozik." }, { status: 403, headers: dropNoStoreHeaders() });
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workflow = await updateDropPackageWorkflow(packageId, {
      exportGroupsAsFolders: body.exportGroupsAsFolders === true,
      appendGroupNameToFilename: body.appendGroupNameToFilename !== false,
    });
    return NextResponse.json({ ok: true, workflow: { exportGroupsAsFolders: workflow.exportGroupsAsFolders, appendGroupNameToFilename: workflow.appendGroupNameToFilename } }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
