import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceMediaErrorResponse } from "@/app/lib/commerce/media/api";
import { createCommerceMediaOverlay } from "@/app/lib/commerce/media/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{assetId:string}>};
export async function POST(request:NextRequest,ctx:RouteContext){try{const {assetId}=await ctx.params;const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;const context=await resolveCommerceContext(organizationId);const body=await request.json() as Record<string,unknown>;const data=await createCommerceMediaOverlay(context,assetId,body);return NextResponse.json({ok:true,data},{status:201});}catch(error){return commerceMediaErrorResponse(error);}}
