import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceReceivingErrorResponse } from "@/app/lib/commerce/receiving/api";
import { createCommerceGoodsReceiptItem } from "@/app/lib/commerce/receiving/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{receiptId:string}>};
export async function POST(request:NextRequest,ctx:RouteContext){try{const {receiptId}=await ctx.params;const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;const context=await resolveCommerceContext(organizationId);const body=await request.json() as Record<string,unknown>;const data=await createCommerceGoodsReceiptItem(context,receiptId,body);return NextResponse.json({ok:true,data},{status:201});}catch(error){return commerceReceivingErrorResponse(error);}}
