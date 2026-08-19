import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceReceivingErrorResponse } from "@/app/lib/commerce/receiving/api";
import { postCommerceGoodsReceipt } from "@/app/lib/commerce/receiving/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{receiptId:string}>};
export async function POST(request:NextRequest,ctx:RouteContext){try{const {receiptId}=await ctx.params;const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;const context=await resolveCommerceContext(organizationId);const body=await request.json() as Record<string,unknown>;const idempotencyKey=request.headers.get("idempotency-key")?.trim()||String(body.idempotencyKey||"").trim();const data=await postCommerceGoodsReceipt(context,receiptId,{...body,idempotencyKey});return NextResponse.json({ok:true,data});}catch(error){return commerceReceivingErrorResponse(error);}}
