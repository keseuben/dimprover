import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createWindowsBridgePairing } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ok:false,error:"Nincs BENJADMIN jogosultság Windows Bridge pairing létrehozásához."},{status:401});
  try { return NextResponse.json({ok:true,pairing:await createWindowsBridgePairing("BENJADMIN")},{status:201,headers:{"cache-control":"no-store"}}); } catch(error){ return windowsBridgeApiError(error); }
}
