import { NextRequest, NextResponse } from "next/server";
import { isDriveApiAuthorized, listDriveProjects, unauthorizedDriveResponse } from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const projects = await listDriveProjects();
  return NextResponse.json({ ok: true, authMode: auth.mode, projects });
}
