import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceCatalogErrorResponse } from "@/app/lib/commerce/catalog/api";
import { archiveCommerceVariant, updateCommerceVariant } from "@/app/lib/commerce/catalog/repository";

export const dynamic="force-dynamic";
export const revalidate=0;
type RouteContext={params:Promise<{productId:string;variantId:string}>};
function organizationId(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function PATCH(request:NextRequest,routeContext:RouteContext){
  try{
    const {productId,variantId}=await routeContext.params;
    const context=await resolveCommerceContext(organizationId(request));
    const body=await request.json() as Record<string,unknown>;
    const data=await updateCommerceVariant(context,productId,variantId,body);
    return NextResponse.json({ok:true,data});
  }catch(error){return commerceCatalogErrorResponse(error);}
}
export async function DELETE(request:NextRequest,routeContext:RouteContext){
  try{
    const {productId,variantId}=await routeContext.params;
    const context=await resolveCommerceContext(organizationId(request));
    const data=await archiveCommerceVariant(context,productId,variantId);
    return NextResponse.json({ok:true,data});
  }catch(error){return commerceCatalogErrorResponse(error);}
}
