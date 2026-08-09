import { NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { getDropRuntimeHealth } from "@/app/lib/drop/dropRuntime";
import {
  DROP_BOOTSTRAP_SQL_PATH,
  DROP_REQUIRED_TABLES,
  DROP_SCHEMA_VERSION,
} from "@/app/lib/drop/dropSchemaContract";
import { dropNoStoreHeaders } from "@/app/lib/drop/dropApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a Drop aktiválási ellenőrzéshez.",
      code: "DROP_ADMIN_UNAUTHORIZED",
    },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const health = await getDropRuntimeHealth();
  const blockers: string[] = [];

  if (!health.readiness.databaseConfigured) blockers.push("A Supabase szerveroldali kapcsolat nincs beállítva.");
  if (!health.readiness.databaseSchema) blockers.push("A DROP 0.2.0 bootstrap SQL még nincs teljesen alkalmazva.");
  if (!health.readiness.tokenSecurity) blockers.push("A Drop HMAC/session biztonsági titkok hiányoznak.");
  if (!health.featureGate.flags.packageEngineEnabled) blockers.push("A csomagmotor feature flag vagy a központi release gate kikapcsolt.");
  if (!health.featureGate.flags.accessGateEnabled) blockers.push("A hozzáférési kapu feature flag vagy a központi release gate kikapcsolt.");

  return NextResponse.json(
    {
      ok: true,
      version: DROP_SCHEMA_VERSION,
      readyForMetadataPilot: health.coreReady,
      readyForFileUpload: false,
      blockers,
      requiredTables: DROP_REQUIRED_TABLES,
      missingTables: health.database.schema.missingTables,
      bootstrapSqlPath: DROP_BOOTSTRAP_SQL_PATH,
      readiness: health.readiness,
      featureGate: health.featureGate,
      safety: health.safety,
      nextAction: health.readiness.databaseSchema
        ? "A metadata pilot csak külön release-döntés után aktiválható."
        : "Futtassa egyszer a bootstrap SQL-t a kijelölt Supabase fejlesztési projekt SQL Editorában, majd ismételje meg ezt az ellenőrzést.",
    },
    { headers: dropNoStoreHeaders() },
  );
}
