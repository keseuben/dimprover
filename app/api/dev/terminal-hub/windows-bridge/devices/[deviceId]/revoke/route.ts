import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { revokeWindowsBridgeDevice } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request: NextRequest,{params}:{params:Promise<{deviceId:string}>}) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ok:false,error:"Nincs BENJADMIN jogosultság Windows Bridge device visszavonásához."},{status:401});
  try { const {deviceId}=await params; const body=await request.json().catch(()=>null) as {reason?:string}|null; return NextResponse.json({ok:true,result:await revokeWindowsBridgeDevice(deviceId,body?.reason||"admin_revoked","BENJADMIN")},{headers:{"cache-control":"no-store"}}); } catch(error){ return windowsBridgeApiError(error); }
}
