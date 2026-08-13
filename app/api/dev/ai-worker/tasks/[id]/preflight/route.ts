import { NextRequest, NextResponse } from "next/server";
import { getDevCenterMutationSubject } from "@/app/lib/dev-center/auth";
import { runExternalAiWorkerPreflight } from "@/app/lib/dev-center/ai-worker/preflight";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 if(!(await getDevCenterMutationSubject(request.headers,false)))return NextResponse.json({ok:false,error:"Nincs jogosultság."},{status:401});
 try{const {id}=await context.params;const result=await runExternalAiWorkerPreflight(id);const status=result.ok?200:("code" in result&&String(result.code||"").includes("CONFLICT")?409:400);return NextResponse.json(result,{status,headers:{"cache-control":"no-store"}})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"A preflight sikertelen."},{status:500})}
}
