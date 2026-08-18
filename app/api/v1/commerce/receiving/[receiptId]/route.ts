import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceReceivingErrorResponse } from "@/app/lib/commerce/receiving/api";
import { cancelCommerceGoodsReceipt, getCommerceGoodsReceipt, updateCommerceGoodsReceipt } from "@/app/lib/commerce/receiving/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{receiptId:string}>};
function org(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function GET(request:NextRequest,ctx:RouteContext){try{const {receiptId}=await ctx.params;const context=await resolveCommerceContext(org(request));const data=await getCommerceGoodsReceipt(context,receiptId);return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
export async function PATCH(request:NextRequest,ctx:RouteContext){try{const {receiptId}=await ctx.params;const context=await resolveCommerceContext(org(request));const body=await request.json() as Record<string,unknown>;const data=await updateCommerceGoodsReceipt(context,receiptId,body);return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
export async function DELETE(request:NextRequest,ctx:RouteContext){try{const {receiptId}=await ctx.params;const context=await resolveCommerceContext(org(request));const data=await cancelCommerceGoodsReceipt(context,receiptId);return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
