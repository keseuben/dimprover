import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceCatalogErrorResponse } from "@/app/lib/commerce/catalog/api";
import { createCommerceVariant } from "@/app/lib/commerce/catalog/repository";

export const dynamic="force-dynamic";
export const revalidate=0;
type RouteContext={params:Promise<{productId:string}>};
export async function POST(request:NextRequest,routeContext:RouteContext){
  try{
    const {productId}=await routeContext.params;
    const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
    const context=await resolveCommerceContext(organizationId);
    const body=await request.json() as Record<string,unknown>;
    const data=await createCommerceVariant(context,productId,body);
    return NextResponse.json({ok:true,data},{status:201});
  }catch(error){return commerceCatalogErrorResponse(error);}
}
