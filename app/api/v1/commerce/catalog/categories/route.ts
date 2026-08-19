import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceCatalogErrorResponse } from "@/app/lib/commerce/catalog/api";
import { createCommerceCatalogItem, listCommerceCatalog } from "@/app/lib/commerce/catalog/repository";

export const dynamic="force-dynamic";
export const revalidate=0;
function organizationId(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function GET(request:NextRequest){
  try{
    const context=await resolveCommerceContext(organizationId(request));
    const activeParam=request.nextUrl.searchParams.get("active");
    const data=await listCommerceCatalog(context,"categories",{query:request.nextUrl.searchParams.get("q")||undefined,active:activeParam===null?undefined:activeParam==="true"});
    return NextResponse.json({ok:true,data});
  }catch(error){return commerceCatalogErrorResponse(error);}
}
export async function POST(request:NextRequest){
  try{
    const context=await resolveCommerceContext(organizationId(request));
    const body=await request.json() as Record<string,unknown>;
    const data=await createCommerceCatalogItem(context,"categories",body);
    return NextResponse.json({ok:true,data},{status:201});
  }catch(error){return commerceCatalogErrorResponse(error);}
}
