import { type NextRequest, NextResponse } from "next/server";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { createDropPackageGroup, deleteDropPackageGroup, listDropPackageGroups, updateDropPackageGroup } from "@/app/lib/drop/dropGroupService";
import { findDropPackageById } from "@/app/lib/drop/dropRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readCapabilityBearer(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+([^\s]{20,1200})$/i);
  if (!match) throw Object.assign(new Error("Hiányzó vagy érvénytelen feltöltési capability-token."), { code: "DROP_UPLOAD_CAPABILITY_MISSING", status: 401 });
  return match[1];
}

async function resolveGrant(request: NextRequest) {
  const rawToken = readCapabilityBearer(request.headers);
  return validateDropAccessToken({ rawToken, expectedPurpose: "upload", headers: request.headers });
}

export async function GET(request: NextRequest) {
  try {
    const grant = await resolveGrant(request);
    const groups = await listDropPackageGroups(grant.packageId);
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", groups }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const grant = await resolveGrant(request);
    const body = await request.json().catch(() => null);
    const packageRow = await findDropPackageById(grant.packageId);
    if (!packageRow) throw Object.assign(new Error("A Drop csomag nem található."), { code: "DROP_PACKAGE_NOT_FOUND", status: 404 });
    const result = await createDropPackageGroup(grant.packageId, body, {
      name: packageRow.uploader_name || "Publikus Drop feladó",
      email: packageRow.uploader_email || null,
      source: "drop-public-uploader",
    });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", ...result }, { status: result.created ? 201 : 200, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}


export async function PATCH(request: NextRequest) {
  try {
    const grant = await resolveGrant(request);
    const body = await request.json().catch(() => null);
    const packageRow = await findDropPackageById(grant.packageId);
    if (!packageRow) throw Object.assign(new Error("A Drop csomag nem található."), { code: "DROP_PACKAGE_NOT_FOUND", status: 404 });
    const result = await updateDropPackageGroup(grant.packageId, body, { name: packageRow.uploader_name || "Publikus Drop feladó", email: packageRow.uploader_email || null, source: "drop-public-uploader" });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", ...result }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const grant = await resolveGrant(request);
    const body = await request.json().catch(() => null);
    const packageRow = await findDropPackageById(grant.packageId);
    if (!packageRow) throw Object.assign(new Error("A Drop csomag nem található."), { code: "DROP_PACKAGE_NOT_FOUND", status: 404 });
    const removed = await deleteDropPackageGroup(grant.packageId, body, { name: packageRow.uploader_name || "Publikus Drop feladó", email: packageRow.uploader_email || null, source: "drop-public-uploader" });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", removed }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
