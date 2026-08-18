import fs from "node:fs";
import assert from "node:assert/strict";
const gallery=fs.readFileSync("components/aruter/CommerceProductMediaGallery.tsx","utf8");
const products=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const api=fs.readFileSync("app/api/v1/commerce/media/products/[productId]/route.ts","utf8");
const checks=[
 ["01 product inspector uses gallery component",products.includes("CommerceProductMediaGallery")&&products.includes("productId={selectedId!")],
 ["02 gallery loads tenant-scoped product media API",gallery.includes('/api/v1/commerce/media/products/${productId}')&&api.includes("resolveCommerceContext")],
 ["03 multiple file picker is enabled",gallery.includes('type="file" multiple')],
 ["04 drag and drop image upload exists",gallery.includes("onDrop=")&&gallery.includes("event.dataTransfer.files")],
 ["05 upload uses shared Commerce image optimizer",gallery.includes("uploadCommerceProductImage")],
 ["06 upload progress is visible",gallery.includes("uploadProgress.current")&&gallery.includes("uploadProgress.total")],
 ["07 web preview is shown",gallery.includes("active.contentUrl")&&gallery.includes("object-contain")],
 ["08 thumbnail strip is shown",gallery.includes("item.thumbnailUrl")&&gallery.includes("overflow-x-auto")],
 ["09 primary image is visibly marked",gallery.includes("Elsődleges")&&gallery.includes("item.primary")],
 ["10 primary image can be changed",gallery.includes("setPrimary(active.assetId)")&&gallery.includes("Legyen elsődleges")],
 ["11 gallery order can move left",gallery.includes("moveActive(-1)")&&gallery.includes("Kép mozgatása balra")],
 ["12 gallery order can move right",gallery.includes("moveActive(1)")&&gallery.includes("Kép mozgatása jobbra")],
 ["13 order save sends all asset ids",gallery.includes("assetIds: nextItems.map")&&gallery.includes("primaryAssetId")],
 ["14 active overlays are indicated",gallery.includes("jelölés")&&gallery.includes("activeOverlays")],
 ["15 overlay types have user-facing labels",gallery.includes('type === "WATERMARK"')&&gallery.includes('type === "BLUR"')],
 ["16 original retention policy remains visible",gallery.includes("eredeti nagy fájl alapból nem marad meg")],
 ["17 gallery refresh updates product summary",products.includes("await loadProducts(query)")&&products.includes("onChanged={async")],
 ["18 desktop inspector layout remains intact",products.includes("xl:grid-cols-[minmax(0,1fr)_380px]")&&products.includes("xl:sticky")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
