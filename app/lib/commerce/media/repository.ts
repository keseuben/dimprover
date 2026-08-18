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
    .is("archived_at",null)
    .maybeSingle();
  if(result.error) dbError("A média változat nem olvasható.",result.error);
  if(!result.data) throw new CommerceMediaUploadError("A média változat nem található.","COMMERCE_MEDIA_VARIANT_NOT_FOUND",404);
  const row=result.data as Row;
  const url=await createCommerceMediaSignedGetUrl({storageKey:text(row.storage_key),expiresInSeconds:300});
  return { url,mimeType:text(row.mime_type),sizeBytes:Number(row.size_bytes||0),kind };
}
