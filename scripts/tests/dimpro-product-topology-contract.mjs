import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 DIMPRO_PRODUCTS,DIMPRO_PRIMARY_PRODUCT_CODES,DIMPRO_PROJECT_RELEVANT_CODES,
 isLicensedScopeAllowed,currentProjectLicenseHasSource,
} from "../../app/lib/license/dimproProductArchitecture.ts";
assert.equal(DIMPRO_PRODUCTS.length,6,"five product layers and one shared Drive");
assert.deepEqual(DIMPRO_PRIMARY_PRODUCT_CODES,["DIMPRO_ONE","DIMPRO_WORK","PROJECT_GATE","DIMPRO_BUILD","DIMPROVER"]);
assert.deepEqual(DIMPRO_PRODUCTS.map(x=>x.architecturalLevel),[1,2,3,4,5,null]);
assert.deepEqual(DIMPRO_PROJECT_RELEVANT_CODES,["DRIVE","PROJECT_GATE","DIMPRO_BUILD","DIMPROVER"]);
assert.equal(DIMPRO_PRODUCTS[5].role,"SHARED_SERVICE");
assert.equal(DIMPRO_PRODUCTS[2].storagePolicy,"NO_INDEPENDENT_DRIVE_QUOTA");
assert.equal(DIMPRO_PRODUCTS[5].currentCommercialRecord,"PROJECT_LICENSE_SOURCE_ONLY");
assert.ok(DIMPRO_PRODUCTS.every(x=>x.state==="ARCHITECTURE_DEFINED"));
assert.ok(isLicensedScopeAllowed("DIMPRO_ONE","USER"));
assert.ok(!isLicensedScopeAllowed("DIMPRO_ONE","PROJECT"));
assert.ok(isLicensedScopeAllowed("DIMPRO_WORK","ORGANIZATION"));
assert.ok(!isLicensedScopeAllowed("DIMPRO_WORK","PROJECT"));
assert.ok(isLicensedScopeAllowed("DIMPRO_BUILD","PROJECT"));
assert.ok(isLicensedScopeAllowed("DIMPROVER","ORGANIZATION"));
assert.ok(isLicensedScopeAllowed("DRIVE","USER")&&isLicensedScopeAllowed("DRIVE","PROJECT"));
assert.equal(currentProjectLicenseHasSource("DRIVE"),true);
assert.equal(currentProjectLicenseHasSource("PROJECT_GATE"),true);
assert.equal(currentProjectLicenseHasSource("DIMPRO_BUILD"),false);
assert.equal(currentProjectLicenseHasSource("DIMPRO_ONE"),false);
const migration=readFileSync("db/auth/migrations/018_auth_v055_dimpro_product_topology.sql","utf8");
assert.ok(migration.includes("ON CONFLICT(code) DO NOTHING"),"existing SSO product rows immutable");
assert.ok(migration.includes("entitlement_enabled boolean NOT NULL DEFAULT false CHECK(entitlement_enabled=false)"));
assert.ok(!migration.includes("INSERT INTO public.auth_access_grants"));
assert.ok(!migration.includes("UPDATE public.auth_products"));
assert.ok(!migration.includes("INSERT INTO public.auth_project_product_licenses"));
console.log("DIMPRO PRODUCT TOPOLOGY CONTRACT 25/25 PASS");
