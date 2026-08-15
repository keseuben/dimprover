import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { readTerminalOutput, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";
import { toSanitizedTerminalChunks } from "@/app/lib/dev-center/terminal-hub/output-views";
import { auditTerminalRedactionFindings } from "@/app/lib/dev-center/terminal-hub/security-audit";
export const dynamic = "force-dynamic"; export const runtime = "nodejs"; const OWNER = "BENJADMIN_ADMIN";
export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return NextResponse.json({ ok:false,error:"Nincs BENJADMIN terminál jogosultság."},{status:401});
  try { const {sessionId}=await context.params; const after=Number(new URL(request.url).searchParams.get("after")||0); const result=readTerminalOutput(OWNER,sessionId,after);
    if(result.session.aiVisibility === "BLOCKED") return NextResponse.json({ok:false,code:"TERMINAL_AI_VISIBILITY_BLOCKED",error:"A terminál session kézzel el van rejtve az AI elől."},{status:403,headers:{"cache-control":"no-store"}});
    const chunks=toSanitizedTerminalChunks(result.chunks); await auditTerminalRedactionFindings(sessionId,chunks);
    return NextResponse.json({ok:true,session:result.session,chunks},{headers:{"cache-control":"no-store"}}); }
  catch(error){ if(error instanceof TerminalSessionError)return NextResponse.json({ok:false,code:error.code,error:error.message},{status:error.status}); return NextResponse.json({ok:false,error:"A sanitizált terminál output nem olvasható."},{status:500}); }
}
