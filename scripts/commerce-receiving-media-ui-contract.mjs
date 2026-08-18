import fs from "node:fs";
import assert from "node:assert/strict";
const prep=fs.readFileSync("components/aruter/commerceMediaPreparation.ts","utf8");
const media=fs.readFileSync("components/aruter/CommerceReceivingMediaAttachments.tsx","utf8");
const receiving=fs.readFileSync("components/aruter/CommerceReceivingAdmin.tsx","utf8");
const repo=fs.readFileSync("app/lib/commerce/media/repository.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/media/links/route.ts","utf8");
const checks=[
 ["01 shared uploader supports receipt header",prep.includes('"GOODS_RECEIPT"')&&prep.includes("uploadCommerceTargetImage")],
 ["02 shared uploader supports receipt item",prep.includes('"GOODS_RECEIPT_ITEM"')],
 ["03 existing product uploader remains wrapper",prep.includes('uploadCommerceTargetImage("PRODUCT", productId, file)')],
 ["04 generic linked media list is tenant scoped",repo.includes("listCommerceLinkedMedia")&&repo.includes('.eq("organization_id",context.organizationId)')],
 ["05 linked media target is validated before listing",repo.includes("LINK_TARGET_TABLES")&&repo.includes("COMMERCE_MEDIA_TARGET_SCOPE_MISMATCH")],
 ["06 receipt and item tables are explicit media targets",repo.includes('GOODS_RECEIPT:"commerce_goods_receipts"')&&repo.includes('GOODS_RECEIPT_ITEM:"commerce_goods_receipt_items"')],
 ["07 generic media API resolves Commerce context",route.includes("resolveCommerceContext")&&route.includes("listCommerceLinkedMedia")],
 ["08 attachment component loads generic media API",media.includes("/api/v1/commerce/media/links?linkType=")],
 ["09 attachment component uses shared optimizer uploader",media.includes("uploadCommerceTargetImage")],
 ["10 multiple image selection is supported",media.includes('type="file" multiple')],
 ["11 HEIC/HEIF selection remains supported",media.includes(".heic,.heif")],
 ["12 receipt header has photo attachment UI",receiving.includes('targetType="GOODS_RECEIPT"')&&receiving.includes("CommerceReceivingMediaAttachments")],
 ["13 receipt item has photo attachment UI",receiving.includes('targetType="GOODS_RECEIPT_ITEM"')],
 ["14 thumbnails can be opened",media.includes('window.open(item.contentUrl')],
 ["15 active overlay marker is visible",media.includes('x=>x.active')&&media.includes("jelölt")],
 ["16 web+thumbnail/original-retention policy remains in shared prep",prep.includes("WEB_IMAGE_OPTIONS")&&prep.includes("THUMBNAIL_IMAGE_OPTIONS")&&prep.includes("retainOriginal: false")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
