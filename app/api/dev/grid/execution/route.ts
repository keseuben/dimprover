import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { DeveloperGridExecutionError, executeDeveloperGridRequest } from "@/app/lib/developer-grid/execution-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload:unknown,status=200){return NextResponse.json(payload,{status,headers:{"cache-control":"no-store","x-dimpro-environment":"DEV","x-dimpro-production-access":"DENY"}})}
export async function POST(request:NextRequest){
  if(!(await isChatGridDeviceAuthorized(request.headers)))return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  try{return json(await executeDeveloperGridRequest(await request.json().catch(()=>({}))));}
  catch(error){if(error instanceof DeveloperGridExecutionError)return json({ok:false,code:error.code,error:error.message,details:error.details||null},error.status);return json({ok:false,code:"EXECUTION_BRIDGE_FAILED",error:error instanceof Error?error.message:"Az Execution Bridge művelet sikertelen."},500)}
}
