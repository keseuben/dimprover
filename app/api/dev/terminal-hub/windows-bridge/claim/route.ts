import { NextRequest, NextResponse } from "next/server";
import { claimWindowsBridgePairing } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
import type { WindowsBridgeAgentHello } from "@/app/lib/dev-center/terminal-hub/windows-bridge";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request: NextRequest) {
  try {
    const body=await request.json().catch(()=>null) as {pairingId?:string;code?:string;hello?:WindowsBridgeAgentHello}|null;
    if(!body?.pairingId||!body?.code||!body?.hello) return NextResponse.json({ok:false,code:"PAIRING_REQUEST_INVALID",error:"Hiányos pairing kérés."},{status:400});
    return NextResponse.json({ok:true,claim:await claimWindowsBridgePairing({pairingId:body.pairingId,code:body.code,hello:body.hello})},{headers:{"cache-control":"no-store"}});
  } catch(error){ return windowsBridgeApiError(error); }
}
