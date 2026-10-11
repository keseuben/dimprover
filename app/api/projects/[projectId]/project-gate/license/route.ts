import { type NextRequest, NextResponse } from "next/server";
import { getProjectProductLicense } from "@/app/lib/drive-core/projectLicense";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store"};
type Context={params:Promise<{projectId:string}>};

export async function GET(request:NextRequest,context:Context) {
  const {projectId}=await context.params;
  const auth=await requireProjectPermission(request,projectId,"project.read");
  if(!auth.ok) return NextResponse.json({ok:false,error:auth.error},{status:auth.status,headers});
  try {
    const billingAccess=auth.access.permissions.includes("project.manage_members")
      && auth.access.permissions.includes("project.update");
    const license=await getProjectProductLicense(projectId,billingAccess,"PROJECT_GATE");
    return NextResponse.json({ok:true,projectId,projectName:auth.access.project.name,
      canManageBilling:billingAccess,license},{headers});
  } catch {
    return NextResponse.json({ok:false,error:"A Projektkapu licencadatai nem érhetők el."},{status:503,headers});
  }
}
