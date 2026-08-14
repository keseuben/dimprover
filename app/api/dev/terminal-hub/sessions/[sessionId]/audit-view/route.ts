import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { readTerminalOutput, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";
import { toTerminalAuditChunks } from "@/app/lib/dev-center/terminal-hub/output-views";
export const dynamic = "force-dynamic"; export const runtime = "nodejs"; const OWNER = "BENJADMIN_ADMIN";
export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok:false,error:"Nincs BENJADMIN terminál audit jogosultság."},{status:401});
  try { const {sessionId}=await context.params; const after=Number(new URL(request.url).searchParams.get("after")||0); const result=readTerminalOutput(OWNER,sessionId,after); return NextResponse.json({ok:true,session:result.session,chunks:toTerminalAuditChunks(result.chunks)},{headers:{"cache-control":"no-store"}}); }
  catch(error){ if(error instanceof TerminalSessionError)return NextResponse.json({ok:false,code:error.code,error:error.message},{status:error.status}); return NextResponse.json({ok:false,error:"A terminál audit nézet nem olvasható."},{status:500}); }
}
