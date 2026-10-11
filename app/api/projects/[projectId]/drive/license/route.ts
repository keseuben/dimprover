import { type NextRequest, NextResponse } from "next/server";
import { getProjectProductLicense } from "@/app/lib/drive-core/projectLicense";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {"cache-control":"private, no-store"};
type RouteContext = {params:Promise<{projectId:string}>};

export async function GET(request:NextRequest,context:RouteContext) {
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"project.read");
  if(!access.ok) return NextResponse.json({ok:false,error:access.error},
    {status:access.status,headers});
  try {
    const canManageBilling=access.access.permissions.includes("project.manage_members")
      && access.access.permissions.includes("project.update");
    const license=await getProjectProductLicense(projectId,canManageBilling);
    return NextResponse.json({ok:true,projectId,canManageBilling,license},{headers});
  } catch {
    return NextResponse.json({ok:false,error:"A projektlicenc adatai nem érhetők el."},
      {status:503,headers});
  }
}
