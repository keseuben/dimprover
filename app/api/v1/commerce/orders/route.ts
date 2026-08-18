import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceOrderErrorResponse } from "@/app/lib/commerce/order/api";
import { createCommerceOrder, listCommerceOrders } from "@/app/lib/commerce/order/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
function org(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function GET(request:NextRequest){try{const context=await resolveCommerceContext(org(request));const data=await listCommerceOrders(context,{status:request.nextUrl.searchParams.get("status")||undefined,cashierQueue:["1","true","yes"].includes((request.nextUrl.searchParams.get("cashierQueue")||"").toLowerCase()),limit:Number(request.nextUrl.searchParams.get("limit")||50)});return NextResponse.json({ok:true,data});}catch(error){return commerceOrderErrorResponse(error);}}
export async function POST(request:NextRequest){try{const context=await resolveCommerceContext(org(request));const body=await request.json() as Record<string,unknown>;const idempotencyKey=request.headers.get("idempotency-key")?.trim()||String(body.idempotencyKey||"").trim();const data=await createCommerceOrder(context,{...body,idempotencyKey});return NextResponse.json({ok:true,data},{status:201});}catch(error){return commerceOrderErrorResponse(error);}}
