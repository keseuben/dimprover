import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { createDropSubmissionGate, listDropSubmissionGates, setDropSubmissionGateStatus } from "@/app/lib/drop/public/dropPublicRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function unauthorized() { return NextResponse.json({ ok: false, error: "Nincs jogosultság a Beküldőkapuk kezeléséhez.", code: "DROP_PUBLIC_ADMIN_UNAUTHORIZED" }, { status: 401, headers: dropNoStoreHeaders() }); }
export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try { return NextResponse.json({ ok: true, version: "DROP 1.2.13", gates: await listDropSubmissionGates() }, { headers: dropNoStoreHeaders() }); }
  catch (error) { return dropErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Érvénytelen Beküldőkapu kérés.", code: "DROP_GATE_INPUT_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    const gate = await createDropSubmissionGate(body, "DIMPRO licencadmin");
    const base = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", gate, publicUrl: `${base}/bekuldes/${encodeURIComponent(gate.slug)}` }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
export async function PATCH(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    const status = body?.status === "active" ? "active" : body?.status === "revoked" ? "revoked" : null;
    if (!id || !status) return NextResponse.json({ ok: false, error: "A kapuazonosító és az állapot kötelező.", code: "DROP_GATE_UPDATE_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", gate: await setDropSubmissionGateStatus(id, status) }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
