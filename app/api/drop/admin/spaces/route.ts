import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import {
  createDropSpace,
  getDropSpacesSchemaHealth,
  listDropSpaces,
  type DropCreateSpaceAdminInput,
} from "@/app/lib/drop/dropSpaceRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a Drop hozzáférési terek kezeléséhez.", code: "DROP_SPACE_ADMIN_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const schema = await getDropSpacesSchemaHealth();
    if (!schema.ready) {
      return NextResponse.json(
        { ok: false, error: "A DROP 0.3.0 hozzáférési tér sémája nem kész.", code: "DROP_SPACES_SCHEMA_NOT_READY", schema },
        { status: 503, headers: dropNoStoreHeaders() },
      );
    }
    const spaces = await listDropSpaces(100);
    return NextResponse.json(
      { ok: true, version: "DROP 0.3.0", schema, spaces },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const schema = await getDropSpacesSchemaHealth();
    if (!schema.ready) {
      return NextResponse.json(
        { ok: false, error: "A DROP 0.3.0 hozzáférési tér sémája nem kész.", code: "DROP_SPACES_SCHEMA_NOT_READY", schema },
        { status: 503, headers: dropNoStoreHeaders() },
      );
    }
    const input = await request.json().catch(() => null) as DropCreateSpaceAdminInput | null;
    if (!input || typeof input !== "object") {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen Drop tér létrehozási kérés.", code: "DROP_SPACE_INPUT_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const created = await createDropSpace(input);
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 0.3.0",
        created,
        note: "A tér, az aktív tulajdonosi tagság és az opcionális projektkapcsolat létrejött. A fájlfeltöltés továbbra is tiltott.",
      },
      { status: 201, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
