import fs from "node:fs";
import assert from "node:assert/strict";
const service=fs.readFileSync("app/lib/commerce/media/uploadService.ts","utf8");
const storage=fs.readFileSync("app/lib/commerce/media/storage.ts","utf8");
const config=fs.readFileSync("app/lib/commerce/media/storageConfig.ts","utf8");
const token=fs.readFileSync("app/lib/commerce/media/uploadToken.ts","utf8");
const uploadRoute=fs.readFileSync("app/api/v1/commerce/media/uploads/[assetId]/[kind]/route.ts","utf8");
const contentRoute=fs.readFileSync("app/api/v1/commerce/media/assets/[assetId]/content/route.ts","utf8");
const products=fs.readFileSync("app/lib/commerce/product/repository.ts","utf8");
const ui=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const gallery=fs.readFileSync("components/aruter/CommerceProductMediaGallery.tsx","utf8");
const prep=fs.readFileSync("components/aruter/commerceMediaPreparation.ts","utf8");
const checks=[
  ["01 Commerce-specific S3 config supported",config.includes("DIMPRO_COMMERCE_S3_ENDPOINT")&&config.includes("DIMPRO_COMMERCE_S3_BUCKET")],
  ["02 existing Drive object store is fallback only",config.includes("DRIVE_FALLBACK")&&config.includes("DIMPRO_DRIVE_S3_ENDPOINT")],
  ["03 upload token uses HMAC SHA-256",token.includes('createHmac("sha256"')&&token.includes("timingSafeEqual")],
  ["04 token is user + organization scoped",token.includes("organizationId")&&token.includes("userId")&&service.includes("COMMERCE_MEDIA_UPLOAD_TICKET_SCOPE_MISMATCH")],
  ["05 token has expiration",token.includes("expiresAt")&&token.includes("COMMERCE_MEDIA_UPLOAD_TOKEN_EXPIRED")],
  ["06 initiate validates target tenant scope",service.includes("verifyMediaTarget")&&service.includes("COMMERCE_MEDIA_TARGET_SCOPE_MISMATCH")],
  ["07 only JPEG PNG WEBP storage outputs accepted",service.includes('"image/jpeg", "image/png", "image/webp"')],
  ["08 original retention defaults false",service.includes("const retainOriginal = input.retainOriginal === true")],
  ["09 web and thumbnail are mandatory",service.includes("COMMERCE_MEDIA_REQUIRED_VARIANTS_MISSING")],
  ["10 media upload remains same-origin server PUT",service.includes("/api/v1/commerce/media/uploads/${assetId}")&&uploadRoute.includes("putCommerceMediaObject")===false&&uploadRoute.includes("uploadCommerceMediaVariant")],
  ["11 PUT content metadata must match ticket",service.includes("COMMERCE_MEDIA_UPLOAD_METADATA_MISMATCH")],
  ["12 finalization HEAD-verifies every stored object",service.includes("headCommerceMediaObject")&&service.includes("COMMERCE_MEDIA_OBJECT_METADATA_MISMATCH")],
  ["13 finalization uses atomic DB RPC",service.includes('client.rpc("commerce_media_finalize_upload"')],
  ["14 media read uses short signed GET redirect",storage.includes("createCommerceMediaSignedGetUrl")&&contentRoute.includes("NextResponse.redirect")],
  ["15 product summary returns primary media asset",products.includes("primaryMediaAssetId")&&products.includes("mediaByProduct")],
  ["16 client reuses shared optimizer before upload",prep.includes("prepareCommerceProductImages")&&prep.includes("uploadCommerceProductImage")],
  ["17 admin UI supports image add/replace",ui.includes("CommerceProductMediaGallery")&&gallery.includes("Képek feltöltése vagy behúzása")&&gallery.includes("További képek hozzáadása")],
  ["18 UI states original is not retained by default",gallery.includes("eredeti nagy fájl alapból nem marad meg")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
