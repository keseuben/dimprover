import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceInventoryErrorResponse } from "@/app/lib/commerce/inventory/api";
import { createCommerceInventoryReservation, listCommerceInventoryReservations } from "@/app/lib/commerce/inventory/repository";
export const dynamic="force-dynamic";
export const revalidate=0;
function organizationId(request:NextRequest){return request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;}
export async function GET(request:NextRequest){
  try{const context=await resolveCommerceContext(organizationId(request));const data=await listCommerceInventoryReservations(context,{variantId:request.nextUrl.searchParams.get("variantId")||undefined,sourceId:request.nextUrl.searchParams.get("sourceId")||undefined,status:request.nextUrl.searchParams.get("status")||undefined,limit:Number(request.nextUrl.searchParams.get("limit")||50)});return NextResponse.json({ok:true,data});}
  catch(error){return commerceInventoryErrorResponse(error);}
}
export async function POST(request:NextRequest){
  try{const context=await resolveCommerceContext(organizationId(request));const body=await request.json() as Record<string,unknown>;const idempotencyKey=request.headers.get("idempotency-key")?.trim()||String(body.idempotencyKey||"").trim();const data=await createCommerceInventoryReservation(context,{...body,idempotencyKey});return NextResponse.json({ok:true,data},{status:201});}
  catch(error){return commerceInventoryErrorResponse(error);}
}
