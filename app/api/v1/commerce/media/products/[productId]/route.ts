import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { listCommerceProductMedia, setCommerceProductMediaOrder } from "@/app/lib/commerce/media/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{productId:string}>};
function org(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function GET(request:NextRequest,ctx:RouteContext){try{const {productId}=await ctx.params;const context=await resolveCommerceContext(org(request));const data=await listCommerceProductMedia(context,productId);return NextResponse.json({ok:true,data});}catch(error){return commerceMediaErrorResponse(error);}}
export async function PATCH(request:NextRequest,ctx:RouteContext){try{const {productId}=await ctx.params;const context=await resolveCommerceContext(org(request));const body=await request.json() as Record<string,unknown>;const data=await setCommerceProductMediaOrder(context,productId,body);return NextResponse.json({ok:true,data});}catch(error){return commerceMediaErrorResponse(error);}}
