import { NextRequest, NextResponse } from "next/server";
import {
  appendDriveEvent,
  isDriveApiAuthorized,
  unauthorizedDriveResponse,
} from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DriveEventBody = {
  type?: string;
  projectId?: string;
  fileId?: string;
  severity?: "info" | "warning" | "error";
  message?: string;
  source?: "desktop" | "server" | "drop" | "mappaor" | "unknown";
  payload?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DriveEventBody;
  const record = await appendDriveEvent({
    type: body.type || "drive.desktop.event",
    projectId: body.projectId,
    fileId: body.fileId,
    severity: body.severity || "info",
    message: body.message || "DIMPRO Drive esemény",
    source: body.source || "desktop",
    payload: {
      ...(body.payload || {}),
      clientId: auth.clientId,
      authMode: auth.mode,
    },
  });

  return NextResponse.json({ ok: true, event: record });
}
