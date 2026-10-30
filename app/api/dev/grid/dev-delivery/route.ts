import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { advanceDeveloperGridDevDelivery, getDeveloperGridDevDelivery, recordDeveloperGridDevBrowserCheck, pauseDeveloperGridDevDelivery } from "@/app/lib/developer-grid/dev-delivery";

export const dynamic="force-dynamic";
export const runtime="nodejs";
function json(payload:unknown,status=200){return NextResponse.json(payload,{status,headers:{"cache-control":"no-store","x-dimpro-environment":"DEV","x-dimpro-production-access":"DENY"}});}
export async function GET(request:NextRequest){
  if(!(await isChatGridDeviceAuthorized(request.headers)))return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  try{return json({ok:true,delivery:await getDeveloperGridDevDelivery(request.nextUrl.searchParams.get("taskId")||"",request.nextUrl.searchParams.get("sessionId")||"")});}
  catch{return json({ok:false,error:"A DEV-kihelyezés állapota nem olvasható."},500);}
}
export async function POST(request:NextRequest){
  if(!(await isChatGridDeviceAuthorized(request.headers)))return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  try{
    const input=await request.json();
    if(!["BROWSER_CHECK","ADVANCE","PAUSE","RESUME"].includes(input.action))return json({ok:false,code:"DEV_DELIVERY_ACTION_INVALID",error:"Ismeretlen DEV-kihelyezési művelet."},400);
    const delivery=input.action==="BROWSER_CHECK"?await recordDeveloperGridDevBrowserCheck(input):input.action==="ADVANCE"?await advanceDeveloperGridDevDelivery(input):await pauseDeveloperGridDevDelivery(input);
    return json({ok:true,delivery});
  }catch(error){const e=error as {code?:string;status?:number};return json({ok:false,code:e.code||"DEV_DELIVERY_FAILED",error:error instanceof Error?error.message:"A DEV-kihelyezés blokkolva maradt."},e.status||409);}
}
