import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { listWindowsBridgeDevices } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ok:false,error:"Nincs BENJADMIN jogosultság a Windows Bridge device listához."},{status:401});
  try { return NextResponse.json({ok:true,devices:await listWindowsBridgeDevices()},{headers:{"cache-control":"no-store"}}); } catch(error){ return windowsBridgeApiError(error); }
}
