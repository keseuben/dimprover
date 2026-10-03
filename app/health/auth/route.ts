import { NextRequest, NextResponse } from "next/server";
import { getAuthClient, getAuthDatabaseHealth } from "@/app/lib/dimpro-auth/repository";
import { driveSsoConfigForEnvironment, resolveDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const environment = resolveDimproAuthEnvironmentFromHost(request.headers.get("host"));
    if (!environment) throw new Error("AUTH_HOST_NOT_ALLOWED");
    const driveConfig = driveSsoConfigForEnvironment(environment);
    const [db, driveClient] = await Promise.all([
      getAuthDatabaseHealth(),
      getAuthClient(driveConfig.clientId, driveConfig.redirectUri, environment),
    ]);
    const sessionRepository = db.database && db.migrationCount >= 4;
    const internalSso = Boolean(driveClient);
    const ready = sessionRepository && internalSso;
    return NextResponse.json(
      {
        ok: ready,
        service: "dimpro-auth",
        sessionRepository,
        internalSso,
        passkey: "NOT_ENABLED_V01",
      },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, service: "dimpro-auth", sessionRepository: false, internalSso: false, passkey: "NOT_ENABLED_V01" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
