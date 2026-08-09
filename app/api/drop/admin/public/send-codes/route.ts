import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { createDropSendCode, listDropSendCodes, setDropSendCodeStatus } from "@/app/lib/drop/public/dropPublicRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function unauthorized() { return NextResponse.json({ ok: false, error: "Nincs jogosultság a DIMPRO Send kódok kezeléséhez.", code: "DROP_PUBLIC_ADMIN_UNAUTHORIZED" }, { status: 401, headers: dropNoStoreHeaders() }); }
export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try { return NextResponse.json({ ok: true, version: "DROP 1.2.11", sendCodes: await listDropSendCodes() }, { headers: dropNoStoreHeaders() }); }
  catch (error) { return dropErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Érvénytelen küldési kód kérés.", code: "DROP_SEND_CODE_INPUT_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    const created = await createDropSendCode(body, "DIMPRO licencadmin");
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", created, warning: "A nyers küldési kód csak ebben a válaszban jelenik meg. Mentse el biztonságosan." }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
export async function PATCH(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    const status = body?.status === "active" ? "active" : body?.status === "revoked" ? "revoked" : null;
    if (!id || !status) return NextResponse.json({ ok: false, error: "A kódazonosító és az állapot kötelező.", code: "DROP_SEND_CODE_UPDATE_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    return NextResponse.json({ ok: true, version: "DROP 1.2.11", sendCode: await setDropSendCodeStatus(id, status) }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
