import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { archiveCommerceMediaOverlay, updateCommerceMediaOverlay } from "@/app/lib/commerce/media/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{assetId:string;overlayId:string}>};
function org(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function PATCH(request:NextRequest,ctx:RouteContext){try{const {assetId,overlayId}=await ctx.params;const context=await resolveCommerceContext(org(request));const body=await request.json() as Record<string,unknown>;const data=await updateCommerceMediaOverlay(context,assetId,overlayId,body);return NextResponse.json({ok:true,data});}catch(error){return commerceMediaErrorResponse(error);}}
export async function DELETE(request:NextRequest,ctx:RouteContext){try{const {assetId,overlayId}=await ctx.params;const context=await resolveCommerceContext(org(request));const data=await archiveCommerceMediaOverlay(context,assetId,overlayId);return NextResponse.json({ok:true,data});}catch(error){return commerceMediaErrorResponse(error);}}
