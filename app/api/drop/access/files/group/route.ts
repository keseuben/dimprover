import { type NextRequest, NextResponse } from "next/server";
import { validateDropAccessToken } from "@/app/lib/drop/dropAccess";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { moveDropPackageFileToGroup } from "@/app/lib/drop/dropGroupService";
import { findDropPackageById } from "@/app/lib/drop/dropRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readCapabilityBearer(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+([^\s]{20,1200})$/i);
  if (!match) throw Object.assign(new Error("Hiányzó vagy érvénytelen feltöltési capability-token."), { code: "DROP_UPLOAD_CAPABILITY_MISSING", status: 401 });
  return match[1];
}

export async function PATCH(request: NextRequest) {
  try {
    const rawToken = readCapabilityBearer(request.headers);
    const grant = await validateDropAccessToken({ rawToken, expectedPurpose: "upload", headers: request.headers });
    const packageRow = await findDropPackageById(grant.packageId);
    if (!packageRow) throw Object.assign(new Error("A Drop csomag nem található."), { code: "DROP_PACKAGE_NOT_FOUND", status: 404 });
    if (packageRow.status !== "active") throw Object.assign(new Error("A lezárt küldemény képcsoportjai már nem módosíthatók."), { code: "DROP_PACKAGE_NOT_ACTIVE", status: 409 });
    const body = await request.json().catch(() => null);
    const result = await moveDropPackageFileToGroup(grant.packageId, body, {
      name: packageRow.uploader_name || "Publikus Drop feladó",
      email: packageRow.uploader_email || null,
      source: "drop-public-uploader",
    });
    return NextResponse.json({ ok: true, version: "DROP 1.2.12", ...result }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
