import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { approveWindowsBridgeDevice } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request: NextRequest,{params}:{params:Promise<{deviceId:string}>}) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ok:false,error:"Nincs BENJADMIN jogosultság Windows Bridge device jóváhagyásához."},{status:401});
  try { const {deviceId}=await params; return NextResponse.json({ok:true,result:await approveWindowsBridgeDevice(deviceId,"BENJADMIN")},{headers:{"cache-control":"no-store"}}); } catch(error){ return windowsBridgeApiError(error); }
}
