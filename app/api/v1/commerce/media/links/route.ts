import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { listCommerceLinkedMedia } from "@/app/lib/commerce/media/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function GET(request:NextRequest){
  try{
    const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
    const context=await resolveCommerceContext(organizationId);
    const data=await listCommerceLinkedMedia(context,request.nextUrl.searchParams.get("linkType"),request.nextUrl.searchParams.get("entityId"));
    return NextResponse.json({ok:true,data});
  }catch(error){return commerceMediaErrorResponse(error);}
}
