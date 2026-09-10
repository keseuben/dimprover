import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { appendConversationMemorySnapshot, getConversationMemoryStatus } from "@/app/lib/developer-grid/conversation-memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function json(payload:unknown,status=200){return NextResponse.json(payload,{status,headers:{"cache-control":"no-store","x-dimpro-environment":"DEV","x-dimpro-production-access":"DENY"}});}
export async function GET(request:NextRequest){
  if(!(await isChatGridDeviceAuthorized(request.headers)))return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  try{return json({ok:true,memory:await getConversationMemoryStatus({taskId:request.nextUrl.searchParams.get("taskId")||undefined,sessionId:request.nextUrl.searchParams.get("sessionId")||undefined,conversationId:request.nextUrl.searchParams.get("conversationId")||undefined}),productionAccess:"DENY"});}
  catch(error){return json({ok:false,error:error instanceof Error?error.message:"A Conversation Memory nem tölthető be."},500);}
}
export async function POST(request:NextRequest){
  if(!(await isChatGridDeviceAuthorized(request.headers)))return json({ok:false,error:"A Developer Grid eszköz nincs párosítva."},401);
  try{return json({ok:true,memory:await appendConversationMemorySnapshot(await request.json().catch(()=>({}))),productionAccess:"DENY"},201);}
  catch(error){const code=error&&typeof error==="object"&&"code" in error?String((error as {code?:unknown}).code||"DEVELOPER_GRID_MEMORY_SAVE_FAILED"):"DEVELOPER_GRID_MEMORY_SAVE_FAILED";const status=error&&typeof error==="object"&&"status" in error?Number((error as {status?:unknown}).status)||409:409;return json({ok:false,code,error:error instanceof Error?error.message:"A Conversation Memory mentése sikertelen."},status);}
}
