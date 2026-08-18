import { NextRequest, NextResponse } from "next/server";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceInventoryErrorResponse } from "@/app/lib/commerce/inventory/api";
import { applyCommerceInventoryReservationAction } from "@/app/lib/commerce/inventory/repository";
export const dynamic="force-dynamic";
export const revalidate=0;
type RouteContext={params:Promise<{reservationId:string}>};
export async function POST(request:NextRequest,routeContext:RouteContext){
  try{const {reservationId}=await routeContext.params;const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;const context=await resolveCommerceContext(organizationId);const body=await request.json() as Record<string,unknown>;const idempotencyKey=request.headers.get("idempotency-key")?.trim()||String(body.idempotencyKey||"").trim();const data=await applyCommerceInventoryReservationAction(context,reservationId,"CONSUME",{...body,idempotencyKey});return NextResponse.json({ok:true,data});}
  catch(error){return commerceInventoryErrorResponse(error);}
}
