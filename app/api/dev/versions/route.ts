import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createDevVersion, getDevCenterState } from "@/app/lib/dev-center/postgres-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Nincs jogosultság a fejlesztési verziókhoz." }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return unauthorized();
  const state = await getDevCenterState();
  return NextResponse.json({ ok: true, versions: state.versions, projects: state.projects, workSessions: state.workSessions, updatedAt: state.updatedAt }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return unauthorized();
  const result = await createDevVersion(await request.json().catch(() => ({})));
  return NextResponse.json(result, { status: result.ok ? 201 : 400, headers: { "cache-control": "no-store" } });
}
