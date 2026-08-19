import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceReceivingErrorResponse } from "@/app/lib/commerce/receiving/api";
import { archiveCommerceGoodsReceiptItem, updateCommerceGoodsReceiptItem } from "@/app/lib/commerce/receiving/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{receiptId:string;itemId:string}>};
function org(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function PATCH(request:NextRequest,ctx:RouteContext){try{const {receiptId,itemId}=await ctx.params;const context=await resolveCommerceContext(org(request));const body=await request.json() as Record<string,unknown>;const data=await updateCommerceGoodsReceiptItem(context,receiptId,itemId,body);return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
export async function DELETE(request:NextRequest,ctx:RouteContext){try{const {receiptId,itemId}=await ctx.params;const context=await resolveCommerceContext(org(request));const data=await archiveCommerceGoodsReceiptItem(context,receiptId,itemId);return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
