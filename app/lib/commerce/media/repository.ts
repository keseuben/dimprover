import type { PostgrestError } from "@supabase/supabase-js";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import { createCommerceMediaSignedGetUrl } from "./storage";
import type { MediaVariantKind } from "./types";
import { CommerceMediaUploadError } from "./uploadService";

type Row = Record<string, unknown>;
const KINDS = new Set<MediaVariantKind>(["ORIGINAL","WEB","THUMBNAIL"]);
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function dbError(message: string,error:PostgrestError|null):never { throw new CommerceMediaUploadError(message,"COMMERCE_MEDIA_DATABASE_ERROR",503,error?.code); }

export async function getCommerceMediaContentUrl(context: CommerceContext, assetIdInput: unknown, kindInput: unknown) {
  if (!hasCommercePermission(context.permissions,"commerce.media.read")) throw new CommerceMediaUploadError("Nincs médiaolvasási jogosultság.","COMMERCE_PERMISSION_DENIED",403);
  const assetId=text(assetIdInput);
  const kind=(text(kindInput).toUpperCase()||"WEB") as MediaVariantKind;
  if (!assetId) throw new CommerceMediaUploadError("A média asset azonosítója kötelező.","COMMERCE_MEDIA_ASSET_ID_REQUIRED",400);
  if (!KINDS.has(kind)) throw new CommerceMediaUploadError("Ismeretlen média változat.","COMMERCE_MEDIA_VARIANT_KIND_INVALID",400);
  const client=createCommerceAdminClient();
  const result=await client.from("commerce_media_variants")
    .select("id,storage_key,mime_type,size_bytes")
    .eq("organization_id",context.organizationId)
    .eq("asset_id",assetId)
    .eq("variant_kind",kind)
    .is("deleted_at",null)
    .maybeSingle();
  if(result.error) dbError("A média változat nem olvasható.",result.error);
  if(!result.data) throw new CommerceMediaUploadError("A média változat nem található.","COMMERCE_MEDIA_VARIANT_NOT_FOUND",404);
  const row=result.data as Row;
  const url=await createCommerceMediaSignedGetUrl({storageKey:text(row.storage_key),expiresInSeconds:300});
  return { url,mimeType:text(row.mime_type),sizeBytes:Number(row.size_bytes||0),kind };
}

const OVERLAY_TYPES = new Set(["WATERMARK","LOGO","STAMP","ARROW","CIRCLE","TEXT","BLUR"]);

function requireMediaWrite(context: CommerceContext) {
  if (!hasCommercePermission(context.permissions,"commerce.media.write")) throw new CommerceMediaUploadError("Nincs médiamódosítási jogosultság.","COMMERCE_PERMISSION_DENIED",403);
}


export type CommerceMediaLinkTargetType = "PRODUCT" | "PRODUCT_VARIANT" | "GOODS_RECEIPT" | "GOODS_RECEIPT_ITEM";
const LINK_TARGET_TABLES: Record<CommerceMediaLinkTargetType,string> = {
  PRODUCT:"commerce_products", PRODUCT_VARIANT:"commerce_product_variants",
  GOODS_RECEIPT:"commerce_goods_receipts", GOODS_RECEIPT_ITEM:"commerce_goods_receipt_items",
};

export async function listCommerceLinkedMedia(context: CommerceContext, linkTypeInput: unknown, entityIdInput: unknown) {
  if (!hasCommercePermission(context.permissions,"commerce.media.read")) throw new CommerceMediaUploadError("Nincs médiaolvasási jogosultság.","COMMERCE_PERMISSION_DENIED",403);
  const linkType=text(linkTypeInput).toUpperCase() as CommerceMediaLinkTargetType;
  const entityId=text(entityIdInput);
  if(!entityId||!LINK_TARGET_TABLES[linkType]) throw new CommerceMediaUploadError("Érvényes média célobjektum szükséges.","COMMERCE_MEDIA_TARGET_REQUIRED",400);
  const client=createCommerceAdminClient();
  const target=await client.from(LINK_TARGET_TABLES[linkType]).select("id").eq("organization_id",context.organizationId).eq("id",entityId).is("deleted_at",null).maybeSingle();
  if(target.error) dbError("A média célobjektuma nem ellenőrizhető.",target.error);
  if(!target.data) throw new CommerceMediaUploadError("A média célobjektuma nem található ebben a szervezetben.","COMMERCE_MEDIA_TARGET_SCOPE_MISMATCH",404);
  const links=await client.from("commerce_media_links")
    .select("id,asset_id,sort_order,is_primary,created_at")
    .eq("organization_id",context.organizationId).eq("link_type",linkType).eq("linked_entity_id",entityId).is("deleted_at",null)
    .order("sort_order",{ascending:true}).order("created_at",{ascending:true});
  if(links.error) dbError("A kapcsolt média nem olvasható.",links.error);
  const assetIds=(links.data||[]).map((row)=>text((row as Row).asset_id)).filter(Boolean);
  if(!assetIds.length) return [];
  const [assets,overlays]=await Promise.all([
    client.from("commerce_media_assets").select("id,mime_type,width,height,size_bytes,visibility,processing_status,created_at").eq("organization_id",context.organizationId).in("id",assetIds).is("deleted_at",null),
    client.from("commerce_media_overlays").select("id,asset_id,overlay_type,payload,sort_order,active,created_at,updated_at").eq("organization_id",context.organizationId).in("asset_id",assetIds).is("deleted_at",null).order("sort_order",{ascending:true}),
  ]);
  if(assets.error) dbError("A média assetek nem olvashatók.",assets.error);
  if(overlays.error) dbError("A média overlay-k nem olvashatók.",overlays.error);
  const assetMap=new Map((assets.data||[]).map((row)=>[text((row as Row).id),row as Row]));
  const overlaysByAsset=new Map<string,Row[]>();
  for(const row of (overlays.data||[]) as Row[]){const id=text(row.asset_id);const list=overlaysByAsset.get(id)||[];list.push(row);overlaysByAsset.set(id,list);}
  return ((links.data||[]) as Row[]).map((link)=>{
    const assetId=text(link.asset_id),asset=assetMap.get(assetId)||{};
    return {linkId:text(link.id),assetId,sortOrder:Number(link.sort_order||0),primary:Boolean(link.is_primary),mimeType:text(asset.mime_type),width:Number(asset.width||0)||null,height:Number(asset.height||0)||null,sizeBytes:Number(asset.size_bytes||0),visibility:text(asset.visibility),processingStatus:text(asset.processing_status),createdAt:text(asset.created_at),contentUrl:`/api/v1/commerce/media/assets/${assetId}/content?kind=WEB`,thumbnailUrl:`/api/v1/commerce/media/assets/${assetId}/content?kind=THUMBNAIL`,overlays:(overlaysByAsset.get(assetId)||[]).map((row)=>({id:text(row.id),type:text(row.overlay_type),payload:row.payload&&typeof row.payload==="object"&&!Array.isArray(row.payload)?row.payload:{},sortOrder:Number(row.sort_order||0),active:Boolean(row.active)}))};
  });
}

export async function listCommerceProductMedia(context: CommerceContext, productIdInput: unknown) {
  if (!hasCommercePermission(context.permissions,"commerce.media.read")) throw new CommerceMediaUploadError("Nincs médiaolvasási jogosultság.","COMMERCE_PERMISSION_DENIED",403);
  const productId=text(productIdInput);
  if (!productId) throw new CommerceMediaUploadError("A termékazonosító kötelező.","COMMERCE_PRODUCT_ID_REQUIRED",400);
  const client=createCommerceAdminClient();
  const product=await client.from("commerce_products").select("id").eq("organization_id",context.organizationId).eq("id",productId).is("deleted_at",null).maybeSingle();
  if(product.error) dbError("A termék nem ellenőrizhető.",product.error);
  if(!product.data) throw new CommerceMediaUploadError("A termék nem található.","COMMERCE_PRODUCT_NOT_FOUND",404);
  const links=await client.from("commerce_media_links")
    .select("id,asset_id,sort_order,is_primary,created_at")
    .eq("organization_id",context.organizationId).eq("link_type","PRODUCT").eq("linked_entity_id",productId).is("deleted_at",null)
    .order("sort_order",{ascending:true}).order("created_at",{ascending:true});
  if(links.error) dbError("A termék képlistája nem olvasható.",links.error);
  const assetIds=(links.data||[]).map((row)=>text((row as Row).asset_id)).filter(Boolean);
  if(!assetIds.length) return [];
  const assets=await client.from("commerce_media_assets")
    .select("id,mime_type,width,height,size_bytes,visibility,processing_status,created_at")
    .eq("organization_id",context.organizationId).in("id",assetIds).is("deleted_at",null);
  if(assets.error) dbError("A média assetek nem olvashatók.",assets.error);
  const overlays=await client.from("commerce_media_overlays")
    .select("id,asset_id,overlay_type,payload,sort_order,active,created_at,updated_at")
    .eq("organization_id",context.organizationId).in("asset_id",assetIds).is("deleted_at",null)
    .order("sort_order",{ascending:true});
  if(overlays.error) dbError("A média overlay-k nem olvashatók.",overlays.error);
  const assetMap=new Map((assets.data||[]).map((row)=>[text((row as Row).id),row as Row]));
  const overlaysByAsset=new Map<string,Row[]>();
  for(const row of (overlays.data||[]) as Row[]){const id=text(row.asset_id);const list=overlaysByAsset.get(id)||[];list.push(row);overlaysByAsset.set(id,list);}
  return ((links.data||[]) as Row[]).map((link)=>{
    const assetId=text(link.asset_id), asset=assetMap.get(assetId)||{};
    return {linkId:text(link.id),assetId,sortOrder:Number(link.sort_order||0),primary:Boolean(link.is_primary),mimeType:text(asset.mime_type),width:Number(asset.width||0)||null,height:Number(asset.height||0)||null,sizeBytes:Number(asset.size_bytes||0),visibility:text(asset.visibility),processingStatus:text(asset.processing_status),createdAt:text(asset.created_at),contentUrl:`/api/v1/commerce/media/assets/${assetId}/content?kind=WEB`,thumbnailUrl:`/api/v1/commerce/media/assets/${assetId}/content?kind=THUMBNAIL`,overlays:(overlaysByAsset.get(assetId)||[]).map((row)=>({id:text(row.id),type:text(row.overlay_type),payload:row.payload&&typeof row.payload==="object"&&!Array.isArray(row.payload)?row.payload:{},sortOrder:Number(row.sort_order||0),active:Boolean(row.active),createdAt:text(row.created_at),updatedAt:text(row.updated_at)}))};
  });
}

export async function setCommerceProductMediaOrder(context: CommerceContext, productIdInput: unknown, input: Record<string,unknown>) {
  requireMediaWrite(context);
  const productId=text(productIdInput);
  const assetIds=Array.isArray(input.assetIds)?input.assetIds.map(text).filter(Boolean):[];
  const primaryAssetId=text(input.primaryAssetId);
  if(!productId||!assetIds.length||!primaryAssetId) throw new CommerceMediaUploadError("A termék, képsorrend és elsődleges kép kötelező.","COMMERCE_MEDIA_ORDER_REQUIRED",400);
  if(new Set(assetIds).size!==assetIds.length) throw new CommerceMediaUploadError("A képsorrend nem tartalmazhat ismétlődő assetet.","COMMERCE_MEDIA_ASSET_ORDER_DUPLICATE",400);
  if(!assetIds.includes(primaryAssetId)) throw new CommerceMediaUploadError("Az elsődleges képnek szerepelnie kell a képsorrendben.","COMMERCE_MEDIA_PRIMARY_NOT_IN_ORDER",400);
  const client=createCommerceAdminClient();
  const result=await client.rpc("commerce_media_set_product_order",{p_organization_id:context.organizationId,p_product_id:productId,p_asset_ids:assetIds,p_primary_asset_id:primaryAssetId});
  if(result.error){const message=result.error.message||"";const known=["COMMERCE_ORGANIZATION_NOT_ACTIVE","COMMERCE_MEDIA_PRODUCT_SCOPE_MISMATCH","COMMERCE_MEDIA_ASSET_ORDER_REQUIRED","COMMERCE_MEDIA_PRIMARY_NOT_IN_ORDER","COMMERCE_MEDIA_ASSET_ORDER_DUPLICATE","COMMERCE_MEDIA_ASSET_LINK_SCOPE_MISMATCH"].find((code)=>message.includes(code));if(known)throw new CommerceMediaUploadError("A képsorrend üzleti szabály miatt nem menthető.",known,known.includes("SCOPE")?404:400,result.error.code);dbError("A képsorrend mentése sikertelen.",result.error);}
  return result.data as Row;
}

export async function createCommerceMediaOverlay(context: CommerceContext, assetIdInput: unknown, input: Record<string,unknown>) {
  requireMediaWrite(context);
  const assetId=text(assetIdInput), type=text(input.type).toUpperCase();
  if(!assetId) throw new CommerceMediaUploadError("A média asset azonosítója kötelező.","COMMERCE_MEDIA_ASSET_ID_REQUIRED",400);
  if(!OVERLAY_TYPES.has(type)) throw new CommerceMediaUploadError("Ismeretlen overlay típus.","COMMERCE_MEDIA_OVERLAY_TYPE_INVALID",400);
  const payload=input.payload&&typeof input.payload==="object"&&!Array.isArray(input.payload)?input.payload:{};
  const sortOrder=Number.isFinite(Number(input.sortOrder))?Math.max(0,Math.floor(Number(input.sortOrder))):0;
  const client=createCommerceAdminClient();
  const asset=await client.from("commerce_media_assets").select("id").eq("organization_id",context.organizationId).eq("id",assetId).is("deleted_at",null).maybeSingle();
  if(asset.error) dbError("A média asset nem ellenőrizhető.",asset.error);
  if(!asset.data) throw new CommerceMediaUploadError("A média asset nem található.","COMMERCE_MEDIA_ASSET_NOT_FOUND",404);
  const result=await client.from("commerce_media_overlays").insert({organization_id:context.organizationId,asset_id:assetId,overlay_type:type,payload,sort_order:sortOrder,active:input.active!==false}).select("id,asset_id,overlay_type,payload,sort_order,active,created_at,updated_at").single();
  if(result.error) dbError("Az overlay létrehozása sikertelen.",result.error);
  const row=result.data as Row;return{id:text(row.id),assetId:text(row.asset_id),type:text(row.overlay_type),payload:row.payload,sortOrder:Number(row.sort_order||0),active:Boolean(row.active),createdAt:text(row.created_at),updatedAt:text(row.updated_at)};
}

export async function updateCommerceMediaOverlay(context: CommerceContext, assetIdInput: unknown, overlayIdInput: unknown, input: Record<string,unknown>) {
  requireMediaWrite(context);
  const assetId=text(assetIdInput),overlayId=text(overlayIdInput);
  if(!assetId||!overlayId) throw new CommerceMediaUploadError("Az asset és overlay azonosító kötelező.","COMMERCE_MEDIA_OVERLAY_ID_REQUIRED",400);
  const patch:Record<string,unknown>={};
  if(input.type!==undefined){const type=text(input.type).toUpperCase();if(!OVERLAY_TYPES.has(type))throw new CommerceMediaUploadError("Ismeretlen overlay típus.","COMMERCE_MEDIA_OVERLAY_TYPE_INVALID",400);patch.overlay_type=type;}
  if(input.payload!==undefined){if(!input.payload||typeof input.payload!=="object"||Array.isArray(input.payload))throw new CommerceMediaUploadError("Az overlay payload objektum legyen.","COMMERCE_MEDIA_OVERLAY_PAYLOAD_INVALID",400);patch.payload=input.payload;}
  if(input.sortOrder!==undefined)patch.sort_order=Math.max(0,Math.floor(Number(input.sortOrder)||0));
  if(input.active!==undefined)patch.active=Boolean(input.active);
  const client=createCommerceAdminClient();
  const result=await client.from("commerce_media_overlays").update(patch).eq("organization_id",context.organizationId).eq("asset_id",assetId).eq("id",overlayId).is("deleted_at",null).select("id,asset_id,overlay_type,payload,sort_order,active,created_at,updated_at").maybeSingle();
  if(result.error) dbError("Az overlay módosítása sikertelen.",result.error);
  if(!result.data) throw new CommerceMediaUploadError("Az overlay nem található.","COMMERCE_MEDIA_OVERLAY_NOT_FOUND",404);
  const row=result.data as Row;return{id:text(row.id),assetId:text(row.asset_id),type:text(row.overlay_type),payload:row.payload,sortOrder:Number(row.sort_order||0),active:Boolean(row.active),createdAt:text(row.created_at),updatedAt:text(row.updated_at)};
}

export async function archiveCommerceMediaOverlay(context: CommerceContext, assetIdInput: unknown, overlayIdInput: unknown) {
  requireMediaWrite(context);
  const assetId=text(assetIdInput),overlayId=text(overlayIdInput);
  const client=createCommerceAdminClient();
  const result=await client.from("commerce_media_overlays").update({active:false,deleted_at:new Date().toISOString()}).eq("organization_id",context.organizationId).eq("asset_id",assetId).eq("id",overlayId).is("deleted_at",null).select("id").maybeSingle();
  if(result.error) dbError("Az overlay archiválása sikertelen.",result.error);
  if(!result.data) throw new CommerceMediaUploadError("Az overlay nem található.","COMMERCE_MEDIA_OVERLAY_NOT_FOUND",404);
  return{id:overlayId,archived:true};
}
