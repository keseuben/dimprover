import { NextResponse, type NextRequest } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { listProjectMemberships } from "@/app/lib/project-core/store";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { projectRoleLabel } from "@/app/lib/project-core/permissions";
import { projectAdminDeliveryAudit } from "@/app/lib/drive-notifications/adminAuditProjection";

type Context={params:Promise<{projectId:string}>};
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"cache-control":"private, no-store","x-content-type-options":"nosniff"};

export async function GET(request:NextRequest,context:Context){
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"audit.read");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status,headers:noStore});
  if(!access.access.permissions.includes("project.manage_members")){
    return NextResponse.json({ok:false,error:"Ehhez külön projektfelhasználó-kezelési jog szükséges."},{status:403,headers:noStore});
  }
  try{
    const [members,dbResult]=await Promise.all([
      listProjectMemberships(projectId),
      getDatabaseClient().from("drive_core_digest_deliveries")
        .select("id,project_id,user_id,category,scheduled_slot,status,attempt_count,created_at,sent_at,completed_at,last_error_code,recipient_email_sha256")
        .eq("project_id",projectId).order("created_at",{ascending:false}).limit(151),
    ]);
    if(dbResult.error)throw Error("AUDIT_SOURCE_UNAVAILABLE");
    const deliveries=dbResult.data||[];
    const truncated=deliveries.length>150;
    const rows=projectAdminDeliveryAudit(projectId,deliveries.slice(0,150),members,projectRoleLabel);
    const summary:Record<string,number>={};
    for(const row of rows)summary[row.status]=(summary[row.status]||0)+1;
    return NextResponse.json({
      ok:true,rows,summary,
      truncated,
      recipientEmailLabel:"Az aktuális projekttagsági e-mail nem bizonyítja a történeti kézbesítési címet.",
      deliveryLabel:"A SENT állapot SMTP átvételt, nem végső postafiókos kézbesítést jelent.",
    },{headers:noStore});
  }catch{
    return NextResponse.json({ok:false,error:"Az adminisztratív kézbesítési napló még nem érhető el."},{status:503,headers:noStore});
  }
}
