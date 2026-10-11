import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DIMPRO_PRODUCTS,DIMPRO_PRIMARY_PRODUCT_CODES}
 from "../../app/lib/license/dimproProductArchitecture.ts";
import {DIMPRO_MINI_APPS} from "../../app/lib/license/dimproMiniAppCatalog.ts";
import {DIMPRO_DROP_SERVICE,DIMPRO_DROP_WORKFLOWS,
 DIMPRO_DROP_COMMERCIAL_RELEASED,DIMPRO_DROP_LEGACY_CUTOVER_RELEASED,
 previewDropLegacyMigration} from "../../app/lib/license/dimproDropServiceCatalog.ts";

assert.equal(DIMPRO_PRIMARY_PRODUCT_CODES.length,5);
assert.equal(DIMPRO_PRODUCTS.length,6);
assert.equal(DIMPRO_MINI_APPS.length,5);
assert.equal(DIMPRO_DROP_SERVICE.code,"DIMPRO_DROP");
assert.equal(DIMPRO_DROP_SERVICE.companionProductCode,"DRIVE");
assert.equal(DIMPRO_DROP_SERVICE.category,"SHARED_SERVICE");
assert.equal(DIMPRO_DROP_SERVICE.requiresDriveSubscription,false);
assert.equal(DIMPRO_DROP_SERVICE.standaloneUse,true);
assert.deepEqual(DIMPRO_DROP_SERVICE.licenseScopes,["USER","ORGANIZATION"]);
assert.equal(DIMPRO_DROP_COMMERCIAL_RELEASED,false);
assert.equal(DIMPRO_DROP_LEGACY_CUTOVER_RELEASED,false);
assert.equal(DIMPRO_DROP_SERVICE.temporaryStorageDistinctFromDrive,true);
assert.deepEqual(DIMPRO_DROP_WORKFLOWS.map(row=>row.code),[
 "DROP_SEND","DROP_QUICK_IMAGE_SEND","DROP_PROJECT_INBOX","DROP_QUICK_VOICE_NOTE",
]);
assert.ok(DIMPRO_DROP_WORKFLOWS.every(row=>row.driveRequired===false));
assert.ok(!DIMPRO_MINI_APPS.some(row=>row.code==="DIMPRO_DROP"));
const original={
 source:"IDENTITY_CORE_DIMPRO_LICENSES",sourceRecordId:"existing-license-id",
 sourceProductCode:"DIMPRO_DROP",ownerType:"USER",
 verifiedCentralOwnerId:"14544d2c-4fe1-4c09-82f3-935d5a8b4b45",
 legacyStatus:"active",legacyExpiresAt:"2027-01-01T00:00:00Z",
 legacyModuleCodes:["DROP_SEND","DROP_QUICK_IMAGE_SEND","DROP_SEND"],
 hasExistingSendEntitlement:true,
};
const preview=previewDropLegacyMigration(original);
assert.equal(preview.decision,"MANUAL_REVIEW_REQUIRED");
assert.deepEqual(preview.matchedModules,["DROP_SEND","DROP_QUICK_IMAGE_SEND"]);
assert.equal(preview.targetProductCode,"DIMPRO_DROP");
assert.equal(preview.targetScope,"USER");
assert.equal(preview.preservedLegacyAccess,true);
assert.equal(preview.newEntitlementCreated,false);
assert.equal(preview.automaticallyRevoked,false);
assert.equal(preview.projectAccessGranted,false);
assert.equal(preview.effectiveDriveQuotaChanged,false);
assert.ok(preview.warnings.some(text=>text.includes("Send-kód")));
assert.equal(previewDropLegacyMigration({...original,verifiedCentralOwnerId:null}).decision,"BLOCKED_IDENTITY_OR_PRODUCT");
assert.equal(previewDropLegacyMigration({...original,verifiedCentralOwnerId:"abc@domain.hu"}).decision,"BLOCKED_IDENTITY_OR_PRODUCT");
assert.equal(previewDropLegacyMigration({...original,sourceProductCode:"ARUTER"}).decision,"BLOCKED_IDENTITY_OR_PRODUCT");
assert.equal(previewDropLegacyMigration({...original,sourceRecordId:" "}).decision,"BLOCKED_INVALID_SOURCE");
assert.equal(previewDropLegacyMigration({...original,source:"LEGACY_DROP_SEND_CODE",ownerType:"ORGANIZATION"}).targetScope,"ORGANIZATION");
const unfamiliar=previewDropLegacyMigration({...original,legacyModuleCodes:["DROP_SEND","UNMAPPED_MODULE"]});
assert.ok(unfamiliar.warnings.some(text=>text.includes("Ismeretlen")));
assert.equal(previewDropLegacyMigration({...original,legacyExpiresAt:"broken"}).warnings.some(text=>text.includes("lejárati")),true);
assert.ok(!readFileSync("app/lib/license/dimproDropServiceCatalog.ts","utf8").includes("fetch("));
const sql=readFileSync("db/auth/migrations/021_auth_v058_dimpro_drop_shared_service.sql","utf8");
assert.ok(sql.includes("('DIMPRO_DROP','DIMPRO Drop','DISABLED')"));
assert.ok(sql.includes("ON CONFLICT(code) DO NOTHING"));
assert.ok(sql.includes("legacy_cutover_released boolean NOT NULL DEFAULT false"));
assert.ok(sql.includes("entitlement_enabled boolean NOT NULL DEFAULT false"));
assert.ok(sql.includes("requires_companion_license boolean NOT NULL DEFAULT false"));
assert.ok(!sql.includes("INSERT INTO public.auth_access_grants"));
assert.ok(!sql.includes("UPDATE public.auth_products"));
assert.ok(!sql.includes("UPDATE public.dimpro_licenses"));
assert.ok(!sql.includes("DELETE FROM"));
const ui=readFileSync("components/license/ProductArchitectureOverview.tsx","utf8");
assert.ok(ui.includes("DIMPRO_DROP_SERVICE"));
assert.ok(ui.includes("Drive-előfizetés nélkül"));
assert.ok(ui.includes("A régi licencek és Send-kódok addig érvényben maradnak"));
console.log("DIMPRO DROP SHARED SERVICE AND LEGACY BRIDGE CONTRACT PASS");
