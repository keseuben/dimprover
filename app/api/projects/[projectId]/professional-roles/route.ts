import {NextResponse,type NextRequest} from "next/server";
import {requireProjectPermission} from "@/app/lib/project-core/auth";
import {listProjectMemberships} from "@/app/lib/project-core/store";
import {getDatabaseClient} from "@/app/lib/drive-core/databaseRepository";
import {normalizeProfessionalRoles} from "@/app/lib/project-core/professionalRoles";
type Context={params:Promise<{projectId:string}>};
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"cache-control":"private, no-store"};

export async function GET(request:NextRequest,context:Context) {
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"project.read");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status,headers});
  const result=await getDatabaseClient().from("drive_core_member_professional_roles")
    .select("membership_id,roles").eq("project_id",projectId).limit(1000);
  if(result.error)return NextResponse.json({ok:false,error:"A szakmai szerepkörök adatbázisa még nincs aktiválva."},{status:503,headers});
  return NextResponse.json({ok:true,roles:Object.fromEntries((result.data||[]).map((row)=>[row.membership_id,row.roles]))},{headers});
}

export async function PUT(request:NextRequest,context:Context) {
  const {projectId}=await context.params;
  const access=await requireProjectPermission(request,projectId,"project.manage_members");
  if(!access.ok)return NextResponse.json({ok:false,error:access.error},{status:access.status,headers});
  const input=await request.json().catch(()=>null) as {membershipId?:unknown;roles?:unknown}|null;
  const membershipId=typeof input?.membershipId==="string"?input.membershipId.trim():"";
  if(!membershipId)return NextResponse.json({ok:false,error:"Hiányzó projekttagság."},{status:400,headers});
  let roles;
  try{roles=normalizeProfessionalRoles(input?.roles);}
  catch{return NextResponse.json({ok:false,error:"Érvénytelen szakmai szerepkörlista."},{status:400,headers});}
  const member=(await listProjectMemberships(projectId))
    .find((entry)=>entry.id===membershipId && entry.status==="ACTIVE");
  if(!member)return NextResponse.json({ok:false,error:"Nincs aktív projekttagság."},{status:404,headers});
  const {error}=await getDatabaseClient().rpc("drive_set_professional_roles_atomic",{
    p_project_id:projectId,p_membership_id:membershipId,p_roles:roles,p_actor_user_id:access.actor.userId,
  });
  if(error)return NextResponse.json({ok:false,error:"A szakmai szerepkörök mentése nem elérhető."},{status:503,headers});
  return NextResponse.json({ok:true,roles},{headers});
}
