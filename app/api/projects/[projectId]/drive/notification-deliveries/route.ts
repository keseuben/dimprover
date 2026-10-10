import { NextResponse, type NextRequest } from "next/server";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type Context={params:Promise<{projectId:string}>};
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:NextRequest,context:Context){
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"document.read");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status});
  const noStore={"cache-control":"private, no-store"};
  // Intentionally *only* the authenticated user's records; other users' delivery
  // addresses/identities are not exposed by this route.
  try{
    const {data,error}=await getDatabaseClient().from("drive_core_digest_deliveries")
      .select("id,category,scheduled_slot,status,cursor_from,cursor_to,attempt_count,last_error_code,created_at,sent_at")
      .eq("project_id",projectId).eq("user_id",access.actor.userId)
      .order("created_at",{ascending:false}).limit(50);
    if(error)throw Error("SCHEMA_NOT_READY");
    return NextResponse.json({ok:true,deliveries:data||[]},{headers:noStore});
  }catch{
    return NextResponse.json({ok:false,error:"A kézbesítési napló még nem elérhető."},{status:503,headers:noStore});
  }
}
