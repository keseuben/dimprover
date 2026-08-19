import type { AruterOrder, AruterOrderStatus, AruterUnit } from "../../aruter/types";
import type { CommerceContext } from "../core/types";
import { resolveCommerceProductByCode } from "../product/repository";
import type { CommerceOrderStatus, CommerceOrderUnit } from "./types";

const UNIT_MAP:Record<AruterUnit,CommerceOrderUnit>={db:"DB",kg:"KG",m:"M",m2:"M2",m3:"M3",raklap:"RAKLAP",csomag:"CSOMAG",zsák:"ZSAK",láda:"LADA"};
export function legacyAruterStatusToCommerce(status:AruterOrderStatus):CommerceOrderStatus{return status==="draft"?"DRAFT":status==="sent_to_cashier"?"SENT_TO_CASHIER":status==="paid"?"PAID":status==="issued"?"ISSUED":"CANCELLED";}
export function legacyAruterOrderToCommerceCreate(order:AruterOrder){return{orderNumber:order.orderNumber,sourceChannel:"EXTERNAL_MARKETPLACE" as const,externalReference:`legacy-aruter:${order.id}`,status:order.status==="draft"?"DRAFT":"SENT_TO_CASHIER",customerName:order.customerName,customerType:order.customerType==="walk_in"?"WALK_IN":order.customerType==="loyal_customer"?"LOYAL_CUSTOMER":"CONTRACTOR",recorderName:order.recorderName,pickupAt:order.pickupTime||null,note:order.note||null,idempotencyKey:`legacy-aruter-create:${order.id}`,items:order.items.map(item=>({productName:item.productName,sku:item.sku||null,unit:UNIT_MAP[item.unit],quantity:String(item.quantity),priceNet:String(Math.max(0,item.priceNet)),vatRateBasisPoints:Math.max(0,Math.round(item.vatRate*100)),storageZone:item.storageZone||null}))};}
export function legacyAruterOrderRequiredTransitions(order:AruterOrder):Array<{status:CommerceOrderStatus;paymentMethod?:string;cashierName?:string;issuerName?:string}>{const target=legacyAruterStatusToCommerce(order.status);if(target==="PAID")return[{status:"PAID",paymentMethod:order.paymentMethod?.toUpperCase(),cashierName:order.cashierName}];if(target==="ISSUED")return[{status:"PAID",paymentMethod:order.paymentMethod?.toUpperCase(),cashierName:order.cashierName},{status:"ISSUED",issuerName:order.issuerName}];if(target==="CANCELLED")return[{status:"CANCELLED"}];return[];}

export async function resolveLegacyAruterOrderForCommerce(
  context: CommerceContext,
  order: AruterOrder,
  options: { resolveInventory?: boolean } = {},
) {
  const payload=legacyAruterOrderToCommerceCreate(order);
  if(!options.resolveInventory) return {payload,mappedItemCount:0,unresolvedItemCount:payload.items.length};
  let mappedItemCount=0;
  const items=[];
  for(let index=0;index<order.items.length;index+=1){
    const legacyItem=order.items[index]!;
    const baseItem=payload.items[index]!;
    if(!legacyItem.sku){items.push(baseItem);continue;}
    const resolved=await resolveCommerceProductByCode(context,legacyItem.sku);
    if(!resolved){items.push(baseItem);continue;}
    const variantId=resolved.identifier.variantId||resolved.product.variants.find((variant)=>variant.status==="ACTIVE")?.id||resolved.product.variants[0]?.id||null;
    if(!variantId){items.push(baseItem);continue;}
    mappedItemCount+=1;
    items.push({...baseItem,productId:resolved.product.id,variantId});
  }
  return {payload:{...payload,items},mappedItemCount,unresolvedItemCount:items.length-mappedItemCount};
}
