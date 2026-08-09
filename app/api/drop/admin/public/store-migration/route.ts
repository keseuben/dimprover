import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { getDropPublicStoreStatus, runDropPublicStoreMigration } from "@/app/lib/drop/public/dropPublicRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Nincs jogosultság a DROP workflow-tár migrációjához.", code: "DROP_PUBLIC_ADMIN_UNAUTHORIZED" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}
function projectRoot() {
  const configured = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  const suffix = path.join(".next", "standalone");
  return cwd.endsWith(suffix) ? path.resolve(cwd, "..", "..") : cwd;
}
function safeStatus(status: Awaited<ReturnType<typeof getDropPublicStoreStatus>>) {
  return {
    version: status.version,
    requestedMode: status.requestedMode,
    activeStore: status.activeStore,
    reason: status.reason,
    failClosed: status.failClosed,
    schemaReady: status.schemaReady,
    databaseActivated: status.databaseActivated,
    migrationRequired: status.migrationRequired,
    fileCounts: status.file.counts,
    fileUpdatedAt: status.file.updatedAt,
    postgresCounts: status.postgresCounts,
    schema: status.schema,
    localMarker: status.localMarker ? {
      activatedAt: status.localMarker.activatedAt,
      reason: status.localMarker.reason,
      importCounts: status.localMarker.importCounts,
    } : null,
    sqlBootstrapPath: status.sqlBootstrapPath,
    sqlSha256Path: `${status.sqlBootstrapPath}.sha256`,
    multiInstanceReady: status.activeStore === "postgresql" && status.schemaReady,
  };
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const status = await getDropPublicStoreStatus({ refresh: true });
    if (request.nextUrl.searchParams.get("download") === "sql") {
      const sql = await readFile(path.join(projectRoot(), status.sqlBootstrapPath), "utf8");
      return new NextResponse(sql, {
        status: 200,
        headers: {
          ...dropNoStoreHeaders(),
          "content-type": "application/sql; charset=utf-8",
          "content-disposition": 'attachment; filename="DIMPRO_DROP_095_PUBLIC_WORKFLOW_STORE_BOOTSTRAP.sql"',
        },
      });
    }
    const sha256 = (await readFile(path.join(projectRoot(), `${status.sqlBootstrapPath}.sha256`), "utf8")).trim();
    return NextResponse.json({ ok: true, version: "DROP 0.9.9", status: safeStatus(status), sqlSha256: sha256 }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (body?.action !== "migrate") {
      return NextResponse.json({ ok: false, error: "Érvénytelen migrációs művelet.", code: "DROP_PUBLIC_MIGRATION_ACTION_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    }
    const migration = await runDropPublicStoreMigration();
    const status = await getDropPublicStoreStatus({ refresh: true });
    return NextResponse.json({ ok: true, version: "DROP 0.9.9", migration, status: safeStatus(status) }, { headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}
