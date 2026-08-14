import { NextRequest, NextResponse } from "next/server";
import { heartbeatWindowsBridgeDevice } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { bearerToken, windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
import type { WindowsBridgeHeartbeat } from "@/app/lib/dev-center/terminal-hub/windows-bridge";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request: NextRequest) {
  try {
    const token=bearerToken(request.headers); if(!token) return NextResponse.json({ok:false,code:"DEVICE_AUTH_REQUIRED",error:"Windows Bridge device token szükséges."},{status:401});
    const body=await request.json().catch(()=>null) as WindowsBridgeHeartbeat|null; if(!body) return NextResponse.json({ok:false,code:"HEARTBEAT_INVALID",error:"Hiányos heartbeat."},{status:400});
    return NextResponse.json(await heartbeatWindowsBridgeDevice(body,token),{headers:{"cache-control":"no-store"}});
  } catch(error){ return windowsBridgeApiError(error); }
}
