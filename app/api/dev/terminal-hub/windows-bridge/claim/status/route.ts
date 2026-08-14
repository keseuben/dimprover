import { NextRequest, NextResponse } from "next/server";
import { pollWindowsBridgeClaim } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { bearerToken, windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request: NextRequest) {
  try {
    const pairingId=request.nextUrl.searchParams.get("pairingId")?.trim()||""; const token=bearerToken(request.headers);
    if(!pairingId||!token) return NextResponse.json({ok:false,code:"CLAIM_AUTH_REQUIRED",error:"Pairing ID és claim token szükséges."},{status:401});
    return NextResponse.json({ok:true,claim:await pollWindowsBridgeClaim(pairingId,token)},{headers:{"cache-control":"no-store"}});
  } catch(error){ return windowsBridgeApiError(error); }
}
