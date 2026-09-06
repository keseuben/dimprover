import { NextRequest, NextResponse } from "next/server";
import { getChatGridDeviceToken } from "@/app/lib/dev-center/chatgrid-device-auth";
import { evaluateDeveloperGridWindowsE2E } from "@/app/lib/developer-grid/windows-e2e";

export const dynamic="force-dynamic";
export const runtime="nodejs";
function json(payload:unknown,status=200){return NextResponse.json(payload,{status,headers:{"cache-control":"no-store","x-dimpro-environment":"DEV","x-dimpro-production-access":"DENY"}});}
export async function GET(request:NextRequest){
  const token=getChatGridDeviceToken(request.headers);
  if(!token)return json({ok:false,error:"A Physical Windows E2E ellenőrzéshez párosított Developer Grid device szükséges."},401);
  try{return json({ok:true,windowsE2E:await evaluateDeveloperGridWindowsE2E(token)});}
  catch(error){return json({ok:false,error:error instanceof Error?error.message:"A Physical Windows E2E állapot nem értékelhető."},409);}
}
