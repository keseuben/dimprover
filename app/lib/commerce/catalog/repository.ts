import type { PostgrestError } from "@supabase/supabase-js";
import { hasCommercePermission } from "../core/permissions";
import { createCommerceAdminClient } from "../core/server-db";
import type { CommerceContext } from "../core/types";
import type { ProductStatus, UnitOfMeasure } from "../product/types";

type Row = Record<string, unknown>;
export type CommerceCatalogKind = "categories" | "brands" | "manufacturers";

export class CommerceCatalogError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly causeCode?: string,
  ) { super(message); }
}

const STATUS_VALUES = new Set<ProductStatus>(["DRAFT","ACTIVE","INACTIVE","ARCHIVED"]);
const UNIT_VALUES = new Set<UnitOfMeasure>(["DB","KG","G","M","M2","M3","FM","L","CSOMAG","PAR","KESZLET"]);
const TABLES: Record<CommerceCatalogKind,string> = {
  categories: "commerce_categories",
  brands: "commerce_brands",
  manufacturers: "commerce_manufacturers",
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown) { const valueText=text(value); return valueText || null; }
function integer(value: unknown, fallback=0) { const parsed=Number(value); return Number.isFinite(parsed) ? Math.round(parsed) : fallback; }
function dbError(message:string,error:PostgrestError|null,status=503):never {
  throw new CommerceCatalogError(message,"COMMERCE_CATALOG_DATABASE_ERROR",status,error?.code);
}
function requireRead(context:CommerceContext) {
  if(!hasCommercePermission(context.permissions,"commerce.product.read")) throw new CommerceCatalogError("Nincs Commerce törzsadat olvasási jogosultság.","COMMERCE_PERMISSION_DENIED",403);
}
function requireWrite(context:CommerceContext) {
  if(!hasCommercePermission(context.permissions,"commerce.product.write")) throw new CommerceCatalogError("Nincs Commerce törzsadat módosítási jogosultság.","COMMERCE_PERMISSION_DENIED",403);
}
function slugify(value:string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100)||"tetel";
}

async function verifyCategoryParent(
  client: ReturnType<typeof createCommerceAdminClient>,
  context: CommerceContext,
  parentId: string | null,
  currentId: string | null = null,
) {
  if (!parentId) return;
  if (parentId === currentId) throw new CommerceCatalogError("A kategória nem lehet saját maga szülője.", "COMMERCE_CATEGORY_PARENT_SELF", 400);
  let cursor: string | null = parentId;
  const visited = new Set<string>();
  for (let depth = 0; cursor && depth < 64; depth += 1) {
    if (visited.has(cursor)) throw new CommerceCatalogError("A kategóriahierarchia körkörös hivatkozást tartalmaz.", "COMMERCE_CATEGORY_PARENT_CYCLE", 409);
    visited.add(cursor);
    if (cursor === currentId) throw new CommerceCatalogError("A szülőkategória körkörös hivatkozást hozna létre.", "COMMERCE_CATEGORY_PARENT_CYCLE", 400);
    const result = await client.from("commerce_categories").select("id,parent_id").eq("organization_id", context.organizationId).eq("id", cursor).is("archived_at", null).maybeSingle();
    if (result.error) dbError("A szülőkategória nem ellenőrizhető.", result.error);
    if (!result.data) throw new CommerceCatalogError("A szülőkategória nem található ebben a szervezetben.", "COMMERCE_CATEGORY_PARENT_SCOPE_MISMATCH", 400);
    cursor = nullableText((result.data as Row).parent_id);
  }
  if (cursor) throw new CommerceCatalogError("A kategóriahierarchia túl mély vagy hibás.", "COMMERCE_CATEGORY_PARENT_DEPTH", 400);
}

function mapCatalog(kind:CommerceCatalogKind,row:Row) {
  return {
    id:text(row.id), organizationId:text(row.organization_id), kind,
    name:text(row.name),
    ...(kind === "categories" ? { slug:text(row.slug), parentId:nullableText(row.parent_id), sortOrder:Number(row.sort_order||0) } : {}),
    active:Boolean(row.active), createdAt:text(row.created_at), updatedAt:text(row.updated_at),
  };
}

export async function listCommerceCatalog(context:CommerceContext,kind:CommerceCatalogKind,input:{query?:string;active?:boolean}={}) {
  requireRead(context);
  const client=createCommerceAdminClient();
  const table=TABLES[kind];
  let query=client.from(table).select("*")
    .eq("organization_id",context.organizationId).is("archived_at",null).order(kind === "categories" ? "sort_order" : "name",{ascending:true});
  const search=text(input.query).replace(/[%_,().]/g,"");
  if(search) query=query.ilike("name",`%${search}%`);
  if(typeof input.active === "boolean") query=query.eq("active",input.active);
  const result=await query;
  if(result.error) dbError("A Commerce törzsadatlista lekérése sikertelen.",result.error);
  return ((result.data||[]) as Row[]).map((row)=>mapCatalog(kind,row));
}

export async function createCommerceCatalogItem(context:CommerceContext,kind:CommerceCatalogKind,input:Record<string,unknown>) {
  requireWrite(context);
  const client=createCommerceAdminClient();
  const name=text(input.name);
  if(!name) throw new CommerceCatalogError("A megnevezés kötelező.","COMMERCE_CATALOG_NAME_REQUIRED",400);
  const payload:Record<string,unknown>={organization_id:context.organizationId,name,active:input.active !== false};
  if(kind === "categories") {
    payload.slug=slugify(text(input.slug)||name);
    payload.sort_order=integer(input.sortOrder,0);
    payload.parent_id=nullableText(input.parentId);
    await verifyCategoryParent(client,context,payload.parent_id ? String(payload.parent_id) : null);
  }
  const result=await client.from(TABLES[kind]).insert(payload).select("*").single();
  if(result.error) {
    if(result.error.code === "23505") throw new CommerceCatalogError("Ilyen Commerce törzsadat már létezik.","COMMERCE_CATALOG_DUPLICATE",409,result.error.code);
    dbError("A Commerce törzsadat létrehozása sikertelen.",result.error);
  }
  return mapCatalog(kind,result.data as Row);
}

export async function updateCommerceCatalogItem(context:CommerceContext,kind:CommerceCatalogKind,itemIdInput:unknown,input:Record<string,unknown>) {
  requireWrite(context);
  const client=createCommerceAdminClient();
  const itemId=text(itemIdInput);
  if(!itemId) throw new CommerceCatalogError("A törzsadat azonosítója kötelező.","COMMERCE_CATALOG_ID_REQUIRED",400);
  const patch:Record<string,unknown>={};
  if(input.name !== undefined) {
    const name=text(input.name);
    if(!name) throw new CommerceCatalogError("A megnevezés nem lehet üres.","COMMERCE_CATALOG_NAME_REQUIRED",400);
    patch.name=name;
  }
  if(input.active !== undefined) patch.active=Boolean(input.active);
  if(kind === "categories") {
    if(input.slug !== undefined) patch.slug=slugify(text(input.slug)||text(input.name));
    if(input.sortOrder !== undefined) patch.sort_order=integer(input.sortOrder,0);
    if(input.parentId !== undefined) {
      const parentId=nullableText(input.parentId);
      await verifyCategoryParent(client,context,parentId,itemId);
      patch.parent_id=parentId;
    }
  }
  if(!Object.keys(patch).length) {
    const current=await client.from(TABLES[kind]).select("*").eq("organization_id",context.organizationId).eq("id",itemId).is("archived_at",null).maybeSingle();
    if(current.error) dbError("A Commerce törzsadat nem olvasható.",current.error);
    if(!current.data) throw new CommerceCatalogError("A Commerce törzsadat nem található.","COMMERCE_CATALOG_NOT_FOUND",404);
    return mapCatalog(kind,current.data as Row);
  }
  const result=await client.from(TABLES[kind]).update(patch).eq("organization_id",context.organizationId).eq("id",itemId).is("archived_at",null)
    .select("*").maybeSingle();
  if(result.error) {
    if(result.error.code === "23505") throw new CommerceCatalogError("Ilyen Commerce törzsadat már létezik.","COMMERCE_CATALOG_DUPLICATE",409,result.error.code);
    dbError("A Commerce törzsadat módosítása sikertelen.",result.error);
  }
  if(!result.data) throw new CommerceCatalogError("A Commerce törzsadat nem található.","COMMERCE_CATALOG_NOT_FOUND",404);
  return mapCatalog(kind,result.data as Row);
}

export async function archiveCommerceCatalogItem(context:CommerceContext,kind:CommerceCatalogKind,itemIdInput:unknown) {
  requireWrite(context);
  const client=createCommerceAdminClient();
  const itemId=text(itemIdInput);
  if(!itemId) throw new CommerceCatalogError("A törzsadat azonosítója kötelező.","COMMERCE_CATALOG_ID_REQUIRED",400);
  const productColumn = kind === "categories" ? "category_id" : kind === "brands" ? "brand_id" : "manufacturer_id";
  const inUse=await client.from("commerce_products").select("id",{count:"exact",head:true}).eq("organization_id",context.organizationId).eq(productColumn,itemId).is("archived_at",null);
  if(inUse.error) dbError("A törzsadat használata nem ellenőrizhető.",inUse.error);
  if((inUse.count||0)>0) throw new CommerceCatalogError("A törzsadat aktív termékhez van rendelve, ezért nem archiválható.","COMMERCE_CATALOG_IN_USE",409);
  if(kind === "categories") {
    const children=await client.from("commerce_categories").select("id",{count:"exact",head:true}).eq("organization_id",context.organizationId).eq("parent_id",itemId).is("archived_at",null);
    if(children.error) dbError("Az alkategóriák használata nem ellenőrizhető.",children.error);
    if((children.count||0)>0) throw new CommerceCatalogError("A kategóriának aktív alkategóriája van, ezért nem archiválható.","COMMERCE_CATEGORY_HAS_CHILDREN",409);
  }
  const result=await client.from(TABLES[kind]).update({active:false,archived_at:new Date().toISOString()}).eq("organization_id",context.organizationId).eq("id",itemId).is("archived_at",null).select("id").maybeSingle();
  if(result.error) dbError("A Commerce törzsadat archiválása sikertelen.",result.error);
  if(!result.data) throw new CommerceCatalogError("A Commerce törzsadat nem található.","COMMERCE_CATALOG_NOT_FOUND",404);
  return {id:itemId,archived:true};
}

function mapVariant(row:Row) {
  const attributes = row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes) ? row.attributes as Record<string,unknown> : {};
  return {id:text(row.id),organizationId:text(row.organization_id),productId:text(row.product_id),name:text(row.name),sku:nullableText(row.sku),unit:text(row.unit) as UnitOfMeasure,status:text(row.status) as ProductStatus,attributes,createdAt:text(row.created_at),updatedAt:text(row.updated_at)};
}

async function requireProduct(context:CommerceContext,productId:string) {
  const client=createCommerceAdminClient();
  const product=await client.from("commerce_products").select("id,status").eq("organization_id",context.organizationId).eq("id",productId).is("archived_at",null).maybeSingle();
  if(product.error) dbError("A termék nem ellenőrizhető.",product.error);
  if(!product.data) throw new CommerceCatalogError("A termék nem található.","COMMERCE_PRODUCT_NOT_FOUND",404);
  return client;
}

export async function createCommerceVariant(context:CommerceContext,productIdInput:unknown,input:Record<string,unknown>) {
  requireWrite(context);
  const productId=text(productIdInput);
  if(!productId) throw new CommerceCatalogError("A termékazonosító kötelező.","COMMERCE_PRODUCT_ID_REQUIRED",400);
  const client=await requireProduct(context,productId);
  const name=text(input.name);
  if(!name) throw new CommerceCatalogError("A változat neve kötelező.","COMMERCE_VARIANT_NAME_REQUIRED",400);
  const unit=text(input.unit).toUpperCase() as UnitOfMeasure;
  if(!UNIT_VALUES.has(unit)) throw new CommerceCatalogError("Ismeretlen mértékegység.","COMMERCE_VARIANT_UNIT_INVALID",400);
  const statusRaw=(text(input.status).toUpperCase()||"ACTIVE") as ProductStatus;
  if(!STATUS_VALUES.has(statusRaw)) throw new CommerceCatalogError("Ismeretlen változatállapot.","COMMERCE_VARIANT_STATUS_INVALID",400);
  const attributes=input.attributes && typeof input.attributes === "object" && !Array.isArray(input.attributes) ? input.attributes : {};
  const result=await client.from("commerce_product_variants").insert({organization_id:context.organizationId,product_id:productId,name,sku:nullableText(input.sku),unit,status:statusRaw,attributes}).select("id,organization_id,product_id,name,sku,unit,status,attributes,created_at,updated_at").single();
  if(result.error) {
    if(result.error.code === "23505") throw new CommerceCatalogError("Ez a cikkszám már használatban van.","COMMERCE_VARIANT_SKU_DUPLICATE",409,result.error.code);
    dbError("A termékváltozat létrehozása sikertelen.",result.error);
  }
  return mapVariant(result.data as Row);
}

export async function updateCommerceVariant(context:CommerceContext,productIdInput:unknown,variantIdInput:unknown,input:Record<string,unknown>) {
  requireWrite(context);
  const productId=text(productIdInput), variantId=text(variantIdInput);
  if(!productId||!variantId) throw new CommerceCatalogError("A termék- és változatazonosító kötelező.","COMMERCE_VARIANT_ID_REQUIRED",400);
  const client=await requireProduct(context,productId);
  const patch:Record<string,unknown>={};
  if(input.name !== undefined){const name=text(input.name);if(!name)throw new CommerceCatalogError("A változat neve nem lehet üres.","COMMERCE_VARIANT_NAME_REQUIRED",400);patch.name=name;}
  if(input.sku !== undefined)patch.sku=nullableText(input.sku);
  if(input.unit !== undefined){const unit=text(input.unit).toUpperCase() as UnitOfMeasure;if(!UNIT_VALUES.has(unit))throw new CommerceCatalogError("Ismeretlen mértékegység.","COMMERCE_VARIANT_UNIT_INVALID",400);patch.unit=unit;}
  if(input.status !== undefined){const status=text(input.status).toUpperCase() as ProductStatus;if(!STATUS_VALUES.has(status))throw new CommerceCatalogError("Ismeretlen változatállapot.","COMMERCE_VARIANT_STATUS_INVALID",400);patch.status=status;}
  if(input.attributes !== undefined){if(!input.attributes||typeof input.attributes!=="object"||Array.isArray(input.attributes))throw new CommerceCatalogError("Az attribútumok objektum formátumúak legyenek.","COMMERCE_VARIANT_ATTRIBUTES_INVALID",400);patch.attributes=input.attributes;}
  const result=await client.from("commerce_product_variants").update(patch).eq("organization_id",context.organizationId).eq("product_id",productId).eq("id",variantId).is("archived_at",null).select("id,organization_id,product_id,name,sku,unit,status,attributes,created_at,updated_at").maybeSingle();
  if(result.error){if(result.error.code==="23505")throw new CommerceCatalogError("Ez a cikkszám már használatban van.","COMMERCE_VARIANT_SKU_DUPLICATE",409,result.error.code);dbError("A termékváltozat módosítása sikertelen.",result.error);}
  if(!result.data)throw new CommerceCatalogError("A termékváltozat nem található.","COMMERCE_VARIANT_NOT_FOUND",404);
  return mapVariant(result.data as Row);
}

export async function archiveCommerceVariant(context:CommerceContext,productIdInput:unknown,variantIdInput:unknown) {
  requireWrite(context);
  const productId=text(productIdInput),variantId=text(variantIdInput);
  if(!productId||!variantId)throw new CommerceCatalogError("A termék- és változatazonosító kötelező.","COMMERCE_VARIANT_ID_REQUIRED",400);
  const client=await requireProduct(context,productId);
  const balance=await client.from("commerce_inventory_balances").select("id",{count:"exact",head:true}).eq("organization_id",context.organizationId).eq("variant_id",variantId).is("archived_at",null);
  if(balance.error)dbError("A változat készlete nem ellenőrizhető.",balance.error);
  if((balance.count||0)>0)throw new CommerceCatalogError("Készlethez kapcsolódó változat nem archiválható.","COMMERCE_VARIANT_INVENTORY_IN_USE",409);
  const result=await client.from("commerce_product_variants").update({status:"ARCHIVED",archived_at:new Date().toISOString()}).eq("organization_id",context.organizationId).eq("product_id",productId).eq("id",variantId).is("archived_at",null).select("id").maybeSingle();
  if(result.error)dbError("A termékváltozat archiválása sikertelen.",result.error);
  if(!result.data)throw new CommerceCatalogError("A termékváltozat nem található.","COMMERCE_VARIANT_NOT_FOUND",404);
  return {id:variantId,archived:true};
}
