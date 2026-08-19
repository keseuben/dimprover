import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceOrderErrorResponse } from "@/app/lib/commerce/order/api";
import { reserveCommerceOrderInventory } from "@/app/lib/commerce/order/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
type RouteContext={params:Promise<{orderId:string}>};
export async function POST(request:NextRequest,ctx:RouteContext){try{const {orderId}=await ctx.params;const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;const context=await resolveCommerceContext(organizationId);const body=await request.json() as Record<string,unknown>;const idempotencyKey=request.headers.get("idempotency-key")?.trim()||String(body.idempotencyKey||"").trim();const data=await reserveCommerceOrderInventory(context,orderId,{...body,idempotencyKey});return NextResponse.json({ok:true,data});}catch(error){return commerceOrderErrorResponse(error);}}
