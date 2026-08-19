import type { PostgrestError } from "@supabase/supabase-js";
import { compareDecimal, normalizeMoney, normalizeQuantity } from "../core/decimal";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import type { GoodsReceiptStatus, GoodsReceiptStockStatus, ReceivingCurrency } from "./types";
import type { UnitOfMeasure } from "../product/types";

type Row = Record<string,unknown>;
const RECEIPT_STATUSES=new Set<GoodsReceiptStatus>(["DRAFT","POSTED","CANCELLED"]);
const STOCK_STATUSES=new Set<GoodsReceiptStockStatus>(["SELLABLE","QUARANTINE","DAMAGED","OUTLET"]);
const CURRENCIES=new Set<ReceivingCurrency>(["HUF","EUR","USD"]);
const UNITS=new Set<UnitOfMeasure>(["DB","KG","G","M","M2","M3","FM","L","CSOMAG","PAR","KESZLET"]);

export class CommerceReceivingError extends Error {
  constructor(message:string,public readonly code:string,public readonly status:number,public readonly causeCode?:string){super(message);}
}
function text(value:unknown){if(typeof value==="string")return value.trim();if(typeof value==="number"||typeof value==="bigint")return String(value);return "";}
function nullableText(value:unknown){const valueText=text(value);return valueText||null;}
function dbError(message:string,error:PostgrestError|null,status=503):never{throw new CommerceReceivingError(message,"COMMERCE_RECEIVING_DATABASE_ERROR",status,error?.code);}
function requireRead(context:CommerceContext){if(!hasCommercePermission(context.permissions,"commerce.receiving.read"))throw new CommerceReceivingError("Nincs bevételezés-olvasási jogosultság.","COMMERCE_PERMISSION_DENIED",403);}
function requireWrite(context:CommerceContext){if(!hasCommercePermission(context.permissions,"commerce.receiving.write"))throw new CommerceReceivingError("Nincs bevételezés-módosítási jogosultság.","COMMERCE_PERMISSION_DENIED",403);}
function requirePost(context:CommerceContext){if(!hasCommercePermission(context.permissions,"commerce.receiving.post"))throw new CommerceReceivingError("Nincs bevételezés-könyvelési jogosultság.","COMMERCE_PERMISSION_DENIED",403);}
function quantity(value:unknown){let result:string;try{result=normalizeQuantity(text(value).replace(",","."));}catch{throw new CommerceReceivingError("A mennyiség NUMERIC(19,6), legfeljebb 6 tizedesjegyű szám lehet.","COMMERCE_RECEIPT_QUANTITY_INVALID",400);}if(compareDecimal(result,"0")<=0)throw new CommerceReceivingError("A mennyiségnek pozitívnak kell lennie.","COMMERCE_RECEIPT_QUANTITY_INVALID",400);return result;}
function cost(value:unknown){if(value===undefined||value===null||text(value)==="")return null;let result:string;try{result=normalizeMoney(text(value).replace(",","."));}catch{throw new CommerceReceivingError("Az egységköltség NUMERIC(19,4), legfeljebb 4 tizedesjegyű érték lehet.","COMMERCE_RECEIPT_COST_INVALID",400);}if(compareDecimal(result,"0",4)<0)throw new CommerceReceivingError("Az egységköltség nem lehet negatív.","COMMERCE_RECEIPT_COST_INVALID",400);return result;}
function dateOnly(value:unknown){const raw=text(value);if(!raw)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))throw new CommerceReceivingError("A lejárati dátum formátuma YYYY-MM-DD legyen.","COMMERCE_RECEIPT_EXPIRY_INVALID",400);return raw;}
function mapReceipt(row:Row){return{id:text(row.id),organizationId:text(row.organization_id),warehouseId:text(row.warehouse_id),sourceId:text(row.source_id),receiptNumber:text(row.receipt_number),supplierName:nullableText(row.supplier_name),supplierDocumentNumber:nullableText(row.supplier_document_number),status:text(row.status) as GoodsReceiptStatus,receivedAt:text(row.received_at),postedAt:nullableText(row.posted_at),notes:nullableText(row.notes),createdByUserId:nullableText(row.created_by_user_id),createdAt:text(row.created_at),updatedAt:text(row.updated_at),archivedAt:nullableText(row.archived_at)};}
function mapItem(row:Row){return{id:text(row.id),organizationId:text(row.organization_id),receiptId:text(row.receipt_id),variantId:text(row.variant_id),stockStatus:text(row.stock_status) as GoodsReceiptStockStatus,quantity:text(row.quantity),unit:text(row.unit) as UnitOfMeasure,unitCost:nullableText(row.unit_cost),currency:text(row.currency) as ReceivingCurrency,lotCode:nullableText(row.lot_code),expiryDate:nullableText(row.expiry_date),notes:nullableText(row.notes),createdAt:text(row.created_at),updatedAt:text(row.updated_at),archivedAt:nullableText(row.archived_at)};}

async function requireDraftReceipt(context:CommerceContext,receiptId:string){
  const client=createCommerceAdminClient();
  const result=await client.from("commerce_goods_receipts").select("*").eq("organization_id",context.organizationId).eq("id",receiptId).is("archived_at",null).maybeSingle();
  if(result.error)dbError("A bevételezés nem ellenőrizhető.",result.error);
  if(!result.data)throw new CommerceReceivingError("A bevételezés nem található.","COMMERCE_RECEIPT_NOT_FOUND",404);
  const row=result.data as Row;
  if(text(row.status)!=="DRAFT")throw new CommerceReceivingError("Csak vázlat bevételezés módosítható.","COMMERCE_RECEIPT_NOT_DRAFT",409);
  return row;
}

async function verifySourceWarehouse(context:CommerceContext,sourceId:string,warehouseId:string){
  const client=createCommerceAdminClient();
  const source=await client.from("commerce_inventory_sources").select("id,warehouse_id,source_type,active").eq("organization_id",context.organizationId).eq("id",sourceId).is("archived_at",null).maybeSingle();
  if(source.error)dbError("A készletforrás nem ellenőrizhető.",source.error);
  if(!source.data||text((source.data as Row).source_type)!=="INTERNAL"||!(source.data as Row).active)throw new CommerceReceivingError("A bevételezéshez aktív belső készletforrás szükséges.","COMMERCE_RECEIPT_SOURCE_NOT_ACTIVE",400);
  if(text((source.data as Row).warehouse_id)!==warehouseId)throw new CommerceReceivingError("A raktár és készletforrás nem tartozik össze.","COMMERCE_RECEIPT_WAREHOUSE_SOURCE_MISMATCH",400);
  const warehouse=await client.from("commerce_warehouses").select("id,active").eq("organization_id",context.organizationId).eq("id",warehouseId).is("archived_at",null).maybeSingle();
  if(warehouse.error)dbError("A raktár nem ellenőrizhető.",warehouse.error);
  if(!warehouse.data||!(warehouse.data as Row).active)throw new CommerceReceivingError("Aktív raktár szükséges.","COMMERCE_RECEIPT_WAREHOUSE_NOT_ACTIVE",400);
}


export async function listCommerceReceivingOptions(context: CommerceContext) {
  requireRead(context);
  const client = createCommerceAdminClient();
  const [warehouses, sources] = await Promise.all([
    client.from("commerce_warehouses")
      .select("id,code,name,active")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    client.from("commerce_inventory_sources")
      .select("id,warehouse_id,source_type,code,name,active")
      .eq("organization_id", context.organizationId)
      .eq("source_type", "INTERNAL")
      .eq("active", true)
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);
  if (warehouses.error) dbError("A raktárlista nem olvasható.", warehouses.error);
  if (sources.error) dbError("A készletforrás-lista nem olvasható.", sources.error);
  return {
    warehouses: ((warehouses.data || []) as Row[]).map((row) => ({ id:text(row.id), code:text(row.code), name:text(row.name) })),
    sources: ((sources.data || []) as Row[]).map((row) => ({ id:text(row.id), warehouseId:text(row.warehouse_id), code:text(row.code), name:text(row.name) })),
  };
}

export async function listCommerceGoodsReceipts(context:CommerceContext,input:{status?:unknown;limit?:number}={}){
  requireRead(context);const client=createCommerceAdminClient();
  let query=client.from("commerce_goods_receipts").select("*").eq("organization_id",context.organizationId).is("archived_at",null).order("received_at",{ascending:false}).order("created_at",{ascending:false}).limit(Math.max(1,Math.min(200,Math.floor(input.limit||50))));
  const status=text(input.status).toUpperCase();if(status){if(!RECEIPT_STATUSES.has(status as GoodsReceiptStatus))throw new CommerceReceivingError("Ismeretlen bevételezési állapot.","COMMERCE_RECEIPT_STATUS_INVALID",400);query=query.eq("status",status);}
  const result=await query;if(result.error)dbError("A bevételezések lekérése sikertelen.",result.error);return((result.data||[])as Row[]).map(mapReceipt);
}

export async function getCommerceGoodsReceipt(context:CommerceContext,receiptIdInput:unknown){
  requireRead(context);const receiptId=text(receiptIdInput);if(!receiptId)throw new CommerceReceivingError("A bevételezés azonosítója kötelező.","COMMERCE_RECEIPT_ID_REQUIRED",400);const client=createCommerceAdminClient();
  const [receipt,items]=await Promise.all([
    client.from("commerce_goods_receipts").select("*").eq("organization_id",context.organizationId).eq("id",receiptId).is("archived_at",null).maybeSingle(),
    client.from("commerce_goods_receipt_items").select("*").eq("organization_id",context.organizationId).eq("receipt_id",receiptId).is("archived_at",null).order("created_at",{ascending:true}).order("id",{ascending:true}),
  ]);
  if(receipt.error)dbError("A bevételezés nem olvasható.",receipt.error);if(!receipt.data)throw new CommerceReceivingError("A bevételezés nem található.","COMMERCE_RECEIPT_NOT_FOUND",404);if(items.error)dbError("A bevételezési tételek nem olvashatók.",items.error);
  return{...mapReceipt(receipt.data as Row),items:((items.data||[])as Row[]).map(mapItem)};
}

export async function createCommerceGoodsReceipt(context:CommerceContext,input:Record<string,unknown>){
  requireWrite(context);const warehouseId=text(input.warehouseId),sourceId=text(input.sourceId),receiptNumber=text(input.receiptNumber);if(!warehouseId||!sourceId||!receiptNumber)throw new CommerceReceivingError("Raktár, készletforrás és bevételezési szám kötelező.","COMMERCE_RECEIPT_REQUIRED_FIELDS",400);if(receiptNumber.length>120)throw new CommerceReceivingError("A bevételezési szám túl hosszú.","COMMERCE_RECEIPT_NUMBER_INVALID",400);await verifySourceWarehouse(context,sourceId,warehouseId);
  const receivedAt=text(input.receivedAt)||new Date().toISOString();if(Number.isNaN(Date.parse(receivedAt)))throw new CommerceReceivingError("A bevételezés időpontja hibás.","COMMERCE_RECEIPT_RECEIVED_AT_INVALID",400);
  const client=createCommerceAdminClient();const result=await client.from("commerce_goods_receipts").insert({organization_id:context.organizationId,warehouse_id:warehouseId,source_id:sourceId,receipt_number:receiptNumber,supplier_name:nullableText(input.supplierName),supplier_document_number:nullableText(input.supplierDocumentNumber),status:"DRAFT",received_at:receivedAt,notes:nullableText(input.notes),created_by_user_id:context.userId}).select("*").single();
  if(result.error){if(result.error.code==="23505")throw new CommerceReceivingError("Ez a bevételezési szám már létezik.","COMMERCE_RECEIPT_NUMBER_DUPLICATE",409,result.error.code);dbError("A bevételezés létrehozása sikertelen.",result.error);}return mapReceipt(result.data as Row);
}

export async function updateCommerceGoodsReceipt(context:CommerceContext,receiptIdInput:unknown,input:Record<string,unknown>){
  requireWrite(context);const receiptId=text(receiptIdInput);const current=await requireDraftReceipt(context,receiptId);const warehouseId=input.warehouseId!==undefined?text(input.warehouseId):text(current.warehouse_id);const sourceId=input.sourceId!==undefined?text(input.sourceId):text(current.source_id);await verifySourceWarehouse(context,sourceId,warehouseId);const patch:Record<string,unknown>={warehouse_id:warehouseId,source_id:sourceId};
  if(input.receiptNumber!==undefined){const value=text(input.receiptNumber);if(!value)throw new CommerceReceivingError("A bevételezési szám nem lehet üres.","COMMERCE_RECEIPT_NUMBER_INVALID",400);patch.receipt_number=value;}
  if(input.supplierName!==undefined)patch.supplier_name=nullableText(input.supplierName);if(input.supplierDocumentNumber!==undefined)patch.supplier_document_number=nullableText(input.supplierDocumentNumber);if(input.notes!==undefined)patch.notes=nullableText(input.notes);if(input.receivedAt!==undefined){const value=text(input.receivedAt);if(Number.isNaN(Date.parse(value)))throw new CommerceReceivingError("A bevételezés időpontja hibás.","COMMERCE_RECEIPT_RECEIVED_AT_INVALID",400);patch.received_at=value;}
  const client=createCommerceAdminClient();const result=await client.from("commerce_goods_receipts").update(patch).eq("organization_id",context.organizationId).eq("id",receiptId).eq("status","DRAFT").is("archived_at",null).select("*").maybeSingle();if(result.error){if(result.error.code==="23505")throw new CommerceReceivingError("Ez a bevételezési szám már létezik.","COMMERCE_RECEIPT_NUMBER_DUPLICATE",409,result.error.code);dbError("A bevételezés módosítása sikertelen.",result.error);}if(!result.data)throw new CommerceReceivingError("A bevételezés már nem módosítható.","COMMERCE_RECEIPT_NOT_DRAFT",409);return mapReceipt(result.data as Row);
}

export async function cancelCommerceGoodsReceipt(context:CommerceContext,receiptIdInput:unknown){
  requireWrite(context);const receiptId=text(receiptIdInput);await requireDraftReceipt(context,receiptId);const client=createCommerceAdminClient();const result=await client.from("commerce_goods_receipts").update({status:"CANCELLED"}).eq("organization_id",context.organizationId).eq("id",receiptId).eq("status","DRAFT").select("*").maybeSingle();if(result.error)dbError("A bevételezés visszavonása sikertelen.",result.error);if(!result.data)throw new CommerceReceivingError("A bevételezés már nem vonható vissza.","COMMERCE_RECEIPT_NOT_DRAFT",409);return mapReceipt(result.data as Row);
}

async function itemPayload(context:CommerceContext,receiptId:string,input:Record<string,unknown>){
  await requireDraftReceipt(context,receiptId);const variantId=text(input.variantId);if(!variantId)throw new CommerceReceivingError("A termékváltozat kötelező.","COMMERCE_RECEIPT_VARIANT_REQUIRED",400);const client=createCommerceAdminClient();const variant=await client.from("commerce_product_variants").select("id,unit").eq("organization_id",context.organizationId).eq("id",variantId).is("archived_at",null).maybeSingle();if(variant.error)dbError("A termékváltozat nem ellenőrizhető.",variant.error);if(!variant.data)throw new CommerceReceivingError("A termékváltozat nem található.","COMMERCE_RECEIPT_VARIANT_NOT_FOUND",404);
  const unit=(text(input.unit).toUpperCase()||text((variant.data as Row).unit).toUpperCase()) as UnitOfMeasure;if(!UNITS.has(unit))throw new CommerceReceivingError("Ismeretlen mennyiségi egység.","COMMERCE_RECEIPT_UNIT_INVALID",400);const stockStatus=(text(input.stockStatus).toUpperCase()||"SELLABLE") as GoodsReceiptStockStatus;if(!STOCK_STATUSES.has(stockStatus))throw new CommerceReceivingError("Ismeretlen bevételezési készletállapot.","COMMERCE_RECEIPT_STOCK_STATUS_INVALID",400);const currency=(text(input.currency).toUpperCase()||"HUF") as ReceivingCurrency;if(!CURRENCIES.has(currency))throw new CommerceReceivingError("Ismeretlen pénznem.","COMMERCE_RECEIPT_CURRENCY_INVALID",400);
  return{organization_id:context.organizationId,receipt_id:receiptId,variant_id:variantId,stock_status:stockStatus,quantity:quantity(input.quantity),unit,unit_cost:cost(input.unitCost ?? input.unitCostMinor),currency,lot_code:nullableText(input.lotCode),expiry_date:dateOnly(input.expiryDate),notes:nullableText(input.notes)};
}

export async function createCommerceGoodsReceiptItem(context:CommerceContext,receiptIdInput:unknown,input:Record<string,unknown>){requireWrite(context);const receiptId=text(receiptIdInput);const payload=await itemPayload(context,receiptId,input);const client=createCommerceAdminClient();const result=await client.from("commerce_goods_receipt_items").insert(payload).select("*").single();if(result.error)dbError("A bevételezési tétel létrehozása sikertelen.",result.error);return mapItem(result.data as Row);}

export async function updateCommerceGoodsReceiptItem(context:CommerceContext,receiptIdInput:unknown,itemIdInput:unknown,input:Record<string,unknown>){requireWrite(context);const receiptId=text(receiptIdInput),itemId=text(itemIdInput);await requireDraftReceipt(context,receiptId);const client=createCommerceAdminClient();const current=await client.from("commerce_goods_receipt_items").select("*").eq("organization_id",context.organizationId).eq("receipt_id",receiptId).eq("id",itemId).is("archived_at",null).maybeSingle();if(current.error)dbError("A bevételezési tétel nem ellenőrizhető.",current.error);if(!current.data)throw new CommerceReceivingError("A bevételezési tétel nem található.","COMMERCE_RECEIPT_ITEM_NOT_FOUND",404);const row=current.data as Row;const merged={variantId:input.variantId??row.variant_id,quantity:input.quantity??row.quantity,unit:input.unit??row.unit,stockStatus:input.stockStatus??row.stock_status,unitCost:input.unitCost!==undefined?input.unitCost:input.unitCostMinor!==undefined?input.unitCostMinor:row.unit_cost,currency:input.currency??row.currency,lotCode:input.lotCode!==undefined?input.lotCode:row.lot_code,expiryDate:input.expiryDate!==undefined?input.expiryDate:row.expiry_date,notes:input.notes!==undefined?input.notes:row.notes};const validated=await itemPayload(context,receiptId,merged);const payload:Record<string,unknown>={...validated};delete payload.organization_id;delete payload.receipt_id;const result=await client.from("commerce_goods_receipt_items").update(payload).eq("organization_id",context.organizationId).eq("receipt_id",receiptId).eq("id",itemId).is("archived_at",null).select("*").maybeSingle();if(result.error)dbError("A bevételezési tétel módosítása sikertelen.",result.error);if(!result.data)throw new CommerceReceivingError("A bevételezési tétel nem található.","COMMERCE_RECEIPT_ITEM_NOT_FOUND",404);return mapItem(result.data as Row);}

export async function archiveCommerceGoodsReceiptItem(context:CommerceContext,receiptIdInput:unknown,itemIdInput:unknown){requireWrite(context);const receiptId=text(receiptIdInput),itemId=text(itemIdInput);await requireDraftReceipt(context,receiptId);const client=createCommerceAdminClient();const result=await client.from("commerce_goods_receipt_items").update({archived_at:new Date().toISOString()}).eq("organization_id",context.organizationId).eq("receipt_id",receiptId).eq("id",itemId).is("archived_at",null).select("id").maybeSingle();if(result.error)dbError("A bevételezési tétel törlése sikertelen.",result.error);if(!result.data)throw new CommerceReceivingError("A bevételezési tétel nem található.","COMMERCE_RECEIPT_ITEM_NOT_FOUND",404);return{id:itemId,archived:true};}

export async function postCommerceGoodsReceipt(context:CommerceContext,receiptIdInput:unknown,input:Record<string,unknown>){requirePost(context);const receiptId=text(receiptIdInput),idempotencyKey=text(input.idempotencyKey);if(!receiptId)throw new CommerceReceivingError("A bevételezés azonosítója kötelező.","COMMERCE_RECEIPT_ID_REQUIRED",400);if(!idempotencyKey||idempotencyKey.length>160)throw new CommerceReceivingError("Érvényes idempotency kulcs kötelező.","COMMERCE_RECEIPT_POST_IDEMPOTENCY_REQUIRED",400);const postedAt=text(input.postedAt)||new Date().toISOString();if(Number.isNaN(Date.parse(postedAt)))throw new CommerceReceivingError("A könyvelési időpont hibás.","COMMERCE_RECEIPT_POSTED_AT_INVALID",400);const client=createCommerceAdminClient();const result=await client.rpc("commerce_goods_receipt_post",{p_organization_id:context.organizationId,p_receipt_id:receiptId,p_idempotency_key:idempotencyKey,p_posted_at:postedAt});if(result.error){const message=result.error.message||"";const mapping:Array<[string,number]>=[["COMMERCE_RECEIPT_NOT_FOUND",404],["COMMERCE_RECEIPT_ALREADY_POSTED",409],["COMMERCE_RECEIPT_CANCELLED",409],["COMMERCE_RECEIPT_EMPTY",409],["COMMERCE_RECEIPT_SOURCE_NOT_ACTIVE",409],["COMMERCE_RECEIPT_WAREHOUSE_SOURCE_MISMATCH",409],["COMMERCE_RECEIPT_VARIANT_SCOPE_MISMATCH",409],["COMMERCE_RESERVED_EXCEEDS_PHYSICAL",409],["COMMERCE_RECEIPT_POST_IDEMPOTENCY_REQUIRED",400]];const known=mapping.find(([code])=>message.includes(code));if(known)throw new CommerceReceivingError("A bevételezés üzleti szabály miatt nem könyvelhető.",known[0],known[1],result.error.code);dbError("A bevételezés könyvelése sikertelen.",result.error);}return result.data as Row;}
