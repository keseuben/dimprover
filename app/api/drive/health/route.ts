import { NextRequest, NextResponse } from "next/server";
import {
  getDriveHealth,
  isDriveApiAuthorized,
  unauthorizedDriveResponse,
} from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }

  return NextResponse.json(
    {
      ...(await getDriveHealth()),
      authMode: auth.mode,
      clientId: auth.clientId,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
