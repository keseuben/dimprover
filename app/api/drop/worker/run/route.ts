import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { isDropWorkerAuthorized, isDropWorkerHostAllowed } from "@/app/lib/drop/worker/dropWorkerAuth";
import { getClamdHealth } from "@/app/lib/drop/worker/clamdInstream";
import { getDropWorkerConfig, getDropWorkerSafeStatus } from "@/app/lib/drop/worker/dropWorkerConfig";
import { getDropWorkerSchemaHealth } from "@/app/lib/drop/worker/dropWorkerRepository";
import { runDropWorkerCycle } from "@/app/lib/drop/worker/dropWorkerService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

function hidden() {
  return NextResponse.json(
    { ok: false, error: "Az útvonal nem található.", code: "DROP_ROUTE_NOT_FOUND" },
    { status: 404, headers: dropNoStoreHeaders() },
  );
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a DROP worker futtatásához.", code: "DROP_WORKER_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

export async function GET(request: NextRequest) {
  if (!isDropWorkerHostAllowed(request)) return hidden();
  if (!isDropWorkerAuthorized(request)) return unauthorized();
  try {
    const config = getDropWorkerConfig();
    const [schema, scanner] = await Promise.all([
      getDropWorkerSchemaHealth(),
      getClamdHealth(config),
    ]);
    return NextResponse.json({
      ok: schema.ready && scanner.ping === "PONG" && config.enabled,
      version: "DROP 1.2.13",
      schema,
      worker: getDropWorkerSafeStatus(config),
      scanner: {
        ping: scanner.ping,
        engine: scanner.version.engine,
        engineVersion: scanner.version.engineVersion,
        signatureVersion: scanner.version.signatureVersion,
        signatureDate: scanner.version.signatureDate,
      },
      secretsExposed: false,
    }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isDropWorkerHostAllowed(request)) return hidden();
  if (!isDropWorkerAuthorized(request)) return unauthorized();
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestedLimit = Math.max(1, Math.min(20, Number(body.limit || 2)));
    const scanOnly = body.scanOnly === true;
    const limit = scanOnly ? Math.min(requestedLimit, 2) : requestedLimit;
    const result = await runDropWorkerCycle({ limit, scanOnly });
    return NextResponse.json(result, { status: 200, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
