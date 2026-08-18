import fs from "node:fs";
import assert from "node:assert/strict";

const sql = fs.readFileSync("supabase/migrations/20260818193000_dimpro_commerce_media_m1.sql", "utf8");
const types = fs.readFileSync("app/lib/commerce/media/types.ts", "utf8");
const prep = fs.readFileSync("components/aruter/commerceMediaPreparation.ts", "utf8");
const checks = [
  ["01 media variants table exists", sql.includes("create table if not exists public.commerce_media_variants")],
  ["02 variant kinds include WEB + THUMBNAIL + ORIGINAL", sql.includes("'ORIGINAL','WEB','THUMBNAIL'")],
  ["03 overlays are non-destructive separate records", sql.includes("create table if not exists public.commerce_media_overlays") && sql.includes("payload jsonb")],
  ["04 overlay palette includes watermark/logo/stamp/markup/blur", sql.includes("'WATERMARK','LOGO','STAMP','ARROW','CIRCLE','TEXT','BLUR'")],
  ["05 direct anon/auth media access is revoked", sql.includes("revoke all on table public.commerce_media_variants, public.commerce_media_overlays from anon, authenticated, service_role")],
  ["06 finalize RPC is service-only", sql.includes("commerce_media_finalize_upload") && sql.includes("grant execute on function public.commerce_media_finalize_upload")],
  ["07 storage key is organization + asset scoped", sql.includes("'commerce/' || p_organization_id::text || '/media/' || p_asset_id::text || '/'")],
  ["08 WEB variant is mandatory", sql.includes("COMMERCE_MEDIA_WEB_VARIANT_REQUIRED")],
  ["09 THUMBNAIL variant is mandatory", sql.includes("COMMERCE_MEDIA_THUMBNAIL_REQUIRED")],
  ["10 original is rejected when retention policy is false", sql.includes("COMMERCE_MEDIA_ORIGINAL_RETENTION_POLICY")],
  ["11 product link validates tenant scope", sql.includes("COMMERCE_MEDIA_PRODUCT_SCOPE_MISMATCH")],
  ["12 finalize writes audit and outbox", sql.includes("MEDIA_FINALIZED") && sql.includes("commerce_outbox_events")],
  ["13 TS types expose variants and overlays", types.includes("MediaVariantKind") && types.includes("MediaOverlayType")],
  ["14 client prep reuses shared Drop image engine", prep.includes("prepareDropFiles") && prep.includes("revokePreparedDropFile")],
  ["15 client prep strips metadata by default", (prep.match(/metadataPolicy: "strip"/g) || []).length === 2],
  ["16 client prep creates web + thumbnail outputs", prep.includes("webFiles") && prep.includes("thumbnails")],
];
let pass=0;
for (const [name,ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (ok) pass++; }
console.log(`RESULT ${pass}/${checks.length} PASS`);
assert.equal(pass,checks.length);
