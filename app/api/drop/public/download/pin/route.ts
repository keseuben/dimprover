import { type NextRequest, NextResponse } from "next/server";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { verifyDropPin } from "@/app/lib/drop/dropCrypto";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { findDropPackageById, writeDropEvent } from "@/app/lib/drop/dropRepository";
import { createDropDownloadProof, dropDownloadProofCookie } from "@/app/lib/drop/public/dropDownloadProof";
import { getDropPackageWorkflow } from "@/app/lib/drop/public/dropPublicRepository";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
    const pin = String(body?.pin || "").replace(/\D/g, "").slice(0, 6);
    if (!rawToken || !/^\d{6}$/.test(pin)) return NextResponse.json({ ok: false, error: "A hatjegyű letöltési kód megadása kötelező.", code: "DROP_DOWNLOAD_PIN_REQUIRED" }, { status: 400, headers: dropNoStoreHeaders() });
    const grant = await validateDropAccessToken({ rawToken, expectedPurpose: "download", headers: request.headers });
    const workflow = await getDropPackageWorkflow(grant.packageId);
    if (!workflow?.requireDownloadPin) return NextResponse.json({ ok: false, error: "Ehhez a küldeményhez nincs külön letöltési kód beállítva.", code: "DROP_DOWNLOAD_PIN_NOT_REQUIRED" }, { status: 409, headers: dropNoStoreHeaders() });
    const packageRow = await findDropPackageById(grant.packageId);
    const valid = Boolean(packageRow?.pin_hash && packageRow.pin_salt && verifyDropPin(pin, packageRow.pin_hash, packageRow.pin_salt));
    await writeDropEvent({ packageId: grant.packageId, eventType: valid ? "public.download_pin.accepted" : "public.download_pin.rejected", severity: valid ? "info" : "warning", payload: { workflowType: workflow.workflowType } });
    if (!valid) return NextResponse.json({ ok: false, error: "A letöltési kód hibás.", code: "DROP_DOWNLOAD_PIN_INVALID" }, { status: 403, headers: dropNoStoreHeaders() });
    const proof = createDropDownloadProof(grant.packageId);
    const response = NextResponse.json({ ok: true, version: "DROP 1.2.13", verified: true, expiresAt: proof.expiresAt }, { headers: dropNoStoreHeaders() });
    response.cookies.set(dropDownloadProofCookie(proof.value, proof.expiresAt));
    return response;
  } catch (error) { return dropErrorResponse(error); }
}
