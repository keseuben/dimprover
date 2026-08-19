import { NextRequest, NextResponse } from "next/server";
import type { AruterOrder } from "@/app/lib/aruter/types";
import { resolveCommerceContext } from "@/app/lib/commerce/core/server-context";
import { commerceOrderErrorResponse } from "@/app/lib/commerce/order/api";
import { legacyAruterOrderRequiredTransitions, resolveLegacyAruterOrderForCommerce } from "@/app/lib/commerce/order/legacyBridge";
import { createCommerceOrder, reserveCommerceOrderInventory, setCommerceOrderStatus } from "@/app/lib/commerce/order/repository";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function POST(request:NextRequest){try{
  const organizationId=request.headers.get("x-dimpro-organization-id")?.trim()||request.nextUrl.searchParams.get("organizationId")?.trim()||null;
  const context=await resolveCommerceContext(organizationId);
  const body=await request.json() as {order?:AruterOrder;fulfillmentSourceId?:string;reservationExpiresAt?:string};
  const order=body.order;if(!order||typeof order.id!=="string"||typeof order.orderNumber!=="string"||!Array.isArray(order.items)||!order.items.length)return NextResponse.json({ok:false,error:"Érvénytelen legacy Árutér rendelés.",code:"COMMERCE_LEGACY_ORDER_INVALID"},{status:400});
  const fulfillmentSourceId=body.fulfillmentSourceId?.trim()||null;
  const resolved=await resolveLegacyAruterOrderForCommerce(context,order,{resolveInventory:Boolean(fulfillmentSourceId)});
  const created=await createCommerceOrder(context,resolved.payload);const orderId=String(created.orderId||"");if(!orderId)throw new Error("COMMERCE_LEGACY_BRIDGE_ORDER_ID_MISSING");
  let reservation:null|Record<string,unknown>=null;
  if(fulfillmentSourceId&&order.status!=="draft"&&order.status!=="cancelled"){reservation=await reserveCommerceOrderInventory(context,orderId,{sourceId:fulfillmentSourceId,expiresAt:body.reservationExpiresAt||null,idempotencyKey:`legacy-aruter-reserve:${order.id}`});}
  const transitions=legacyAruterOrderRequiredTransitions(order);const applied=[];for(const transition of transitions){applied.push(await setCommerceOrderStatus(context,orderId,{...transition,idempotencyKey:`legacy-aruter-status:${order.id}:${transition.status.toLowerCase()}`}));}
  return NextResponse.json({ok:true,data:{orderId,created,resolution:{mappedItemCount:resolved.mappedItemCount,unresolvedItemCount:resolved.unresolvedItemCount},reservation,transitions:applied}});
}catch(error){return commerceOrderErrorResponse(error);}}
