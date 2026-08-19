import type { PostgrestError } from "@supabase/supabase-js";
import { compareDecimal, normalizeMoney } from "../core/decimal";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import type { CurrencyCode, PriceStatus } from "./types";

type Row = Record<string,unknown>;
const CURRENCIES=new Set<CurrencyCode>(["HUF","EUR","USD"]);

export class CommercePricingError extends Error {
  constructor(message:string,public readonly code:string,public readonly status:number,public readonly causeCode?:string){super(message);}
}
function text(value:unknown){return typeof value==="string"?value.trim():String(value??"").trim();}
function dbError(message:string,error:PostgrestError|null):never{throw new CommercePricingError(message,"COMMERCE_PRICING_DATABASE_ERROR",503,error?.code);}
function requireRead(context:CommerceContext){if(!hasCommercePermission(context.permissions,"commerce.product.read"))throw new CommercePricingError("Nincs árolvasási jogosultság.","COMMERCE_PERMISSION_DENIED",403);}
function requireWrite(context:CommerceContext){if(!hasCommercePermission(context.permissions,"commerce.product.write"))throw new CommercePricingError("Nincs ármódosítási jogosultság.","COMMERCE_PERMISSION_DENIED",403);}
function parseAmount(value:unknown){const raw=text(value).replace(",",".");let amount:string;try{amount=normalizeMoney(raw);}catch{throw new CommercePricingError("Az ár legfeljebb 4 tizedesjegyű NUMERIC(19,4) érték lehet.","COMMERCE_PRICE_AMOUNT_INVALID",400);}if(compareDecimal(amount,"0",4)<0)throw new CommercePricingError("Az ár nem lehet negatív.","COMMERCE_PRICE_AMOUNT_INVALID",400);return amount;}
function parseVatBasisPoints(value:unknown){const parsed=Number(value);if(!Number.isInteger(parsed)||parsed<0||parsed>10000)throw new CommercePricingError("Az ÁFA basis point értéke 0 és 10000 között legyen.","COMMERCE_PRICE_VAT_INVALID",400);return parsed;}
function mapPrice(row:Row){return{id:text(row.id),organizationId:text(row.organization_id),variantId:text(row.variant_id),currency:text(row.currency) as CurrencyCode,amount:normalizeMoney(text(row.amount)),vatRateBasisPoints:Number(row.vat_rate_basis_points||0),validFrom:row.valid_from?text(row.valid_from):null,validUntil:row.valid_until?text(row.valid_until):null,status:text(row.status) as PriceStatus,createdAt:text(row.created_at),updatedAt:text(row.updated_at)};}

export async function listCommercePrices(context:CommerceContext,input:{variantId?:unknown;currency?:unknown;limit?:number}={}){
  requireRead(context);
  const client=createCommerceAdminClient();
  const variantId=text(input.variantId);
  if(!variantId)throw new CommercePricingError("A termékváltozat azonosítója kötelező.","COMMERCE_PRICE_VARIANT_REQUIRED",400);
  const variant=await client.from("commerce_product_variants").select("id").eq("organization_id",context.organizationId).eq("id",variantId).is("deleted_at",null).maybeSingle();
  if(variant.error)dbError("A termékváltozat nem ellenőrizhető.",variant.error);
  if(!variant.data)throw new CommercePricingError("A termékváltozat nem található.","COMMERCE_PRICE_VARIANT_NOT_FOUND",404);
  let query=client.from("commerce_prices").select("id,organization_id,variant_id,currency,amount,vat_rate_basis_points,valid_from,valid_until,status,created_at,updated_at")
    .eq("organization_id",context.organizationId).eq("variant_id",variantId).is("deleted_at",null).order("valid_from",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false}).limit(Math.max(1,Math.min(100,Math.floor(input.limit||25))));
  const currency=text(input.currency).toUpperCase();
  if(currency){if(!CURRENCIES.has(currency as CurrencyCode))throw new CommercePricingError("Ismeretlen pénznem.","COMMERCE_PRICE_CURRENCY_INVALID",400);query=query.eq("currency",currency);}
  const result=await query;
  if(result.error)dbError("Az ártörténet lekérése sikertelen.",result.error);
  return ((result.data||[]) as Row[]).map(mapPrice);
}

export async function setCommerceActivePrice(context:CommerceContext,input:Record<string,unknown>){
  requireWrite(context);
  const client=createCommerceAdminClient();
  const variantId=text(input.variantId);
  if(!variantId)throw new CommercePricingError("A termékváltozat azonosítója kötelező.","COMMERCE_PRICE_VARIANT_REQUIRED",400);
  const currency=(text(input.currency).toUpperCase()||"HUF") as CurrencyCode;
  if(!CURRENCIES.has(currency))throw new CommercePricingError("Ismeretlen pénznem.","COMMERCE_PRICE_CURRENCY_INVALID",400);
  const amount=parseAmount(input.amount ?? input.amountMinor);
  const vatRateBasisPoints=input.vatRateBasisPoints===undefined?2700:parseVatBasisPoints(input.vatRateBasisPoints);
  const effectiveAt=text(input.effectiveAt)||new Date().toISOString();
  if(Number.isNaN(Date.parse(effectiveAt)))throw new CommercePricingError("Az ár érvényességi időpontja hibás.","COMMERCE_PRICE_EFFECTIVE_AT_INVALID",400);
  const result=await client.rpc("commerce_price_set_active",{
    p_organization_id:context.organizationId,
    p_variant_id:variantId,
    p_currency:currency,
    p_amount:amount,
    p_vat_rate_basis_points:vatRateBasisPoints,
    p_effective_at:effectiveAt,
  });
  if(result.error){
    const message=result.error.message||"";
    const known=["COMMERCE_ORGANIZATION_NOT_ACTIVE","COMMERCE_PRICE_VARIANT_SCOPE_MISMATCH","COMMERCE_PRICE_CURRENCY_INVALID","COMMERCE_PRICE_AMOUNT_INVALID","COMMERCE_PRICE_VAT_INVALID"].find((code)=>message.includes(code));
    if(known)throw new CommercePricingError("Az ár üzleti szabály miatt nem menthető.",known,known.includes("SCOPE")?404:400,result.error.code);
    dbError("Az aktív ár mentése sikertelen.",result.error);
  }
  return result.data as Row;
}
