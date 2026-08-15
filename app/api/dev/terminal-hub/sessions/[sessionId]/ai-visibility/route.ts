import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getTerminalSession, setTerminalSessionAiVisibility, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";
import { recordTerminalSecurityEvent } from "@/app/lib/dev-center/terminal-hub/security-audit";
import type { TerminalAiVisibility } from "@/app/lib/dev-center/terminal-hub/session-types";
export const dynamic="force-dynamic"; export const runtime="nodejs"; const OWNER="BENJADMIN_ADMIN";
export async function POST(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){
  if(!(await isDevCenterAuthorized(request.headers,false))) return NextResponse.json({ok:false,error:"Nincs BENJADMIN terminál security jogosultság."},{status:401});
  try{
    const {sessionId}=await params; const body=await request.json().catch(()=>null) as {mode?:TerminalAiVisibility}|null;
    if(!body?.mode||!["FILTERED","BLOCKED"].includes(body.mode)) return NextResponse.json({ok:false,code:"TERMINAL_AI_VISIBILITY_INVALID",error:"FILTERED vagy BLOCKED mód szükséges."},{status:400});
    const previous=getTerminalSession(OWNER,sessionId).summary.aiVisibility;
    await recordTerminalSecurityEvent({sessionId,action:"TERMINAL_AI_VISIBILITY_CHANGED",summary:`Terminál AI visibility: ${previous} → ${body.mode}.`,metadata:{previous,next:body.mode}});
    return NextResponse.json({ok:true,session:setTerminalSessionAiVisibility(OWNER,sessionId,body.mode)},{headers:{"cache-control":"no-store"}});
  }catch(error){if(error instanceof TerminalSessionError)return NextResponse.json({ok:false,code:error.code,error:error.message},{status:error.status});return NextResponse.json({ok:false,code:"TERMINAL_SECURITY_AUDIT_FAILED",error:"Az AI visibility mód nem módosítható biztonságosan."},{status:503});}
}
