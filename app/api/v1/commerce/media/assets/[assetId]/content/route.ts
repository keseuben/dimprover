import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { getCommerceMediaContentUrl } from "@/app/lib/commerce/media/repository";

export const dynamic="force-dynamic";
export const revalidate=0;
type RouteContext={params:Promise<{assetId:string}>};

export async function GET(request:NextRequest,routeContext:RouteContext){
  try{
    const {assetId}=await routeContext.params;
    const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
    const context=await resolveCommerceContext(organizationId);
    const data=await getCommerceMediaContentUrl(context,assetId,request.nextUrl.searchParams.get("kind")||"WEB");
    return NextResponse.redirect(data.url,307);
  }catch(error){return commerceMediaErrorResponse(error);}
}
