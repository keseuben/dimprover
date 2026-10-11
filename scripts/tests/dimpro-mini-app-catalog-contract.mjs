import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DIMPRO_PRODUCTS,DIMPRO_PRIMARY_PRODUCT_CODES}
  from "../../app/lib/license/dimproProductArchitecture.ts";
import {DIMPRO_MINI_APPS,DIMPRO_MINI_APP_COMMERCIAL_RELEASED,
 isMiniAppScopeAllowed,dimproMiniApp}
  from "../../app/lib/license/dimproMiniAppCatalog.ts";

assert.equal(DIMPRO_PRODUCTS.length,6,"five levels and Drive stay unchanged");
assert.equal(DIMPRO_PRIMARY_PRODUCT_CODES.length,5,"mini apps never become architectural levels");
assert.equal(DIMPRO_MINI_APPS.length,5);
assert.equal(new Set(DIMPRO_MINI_APPS.map(x=>x.code)).size,5);
assert.equal(DIMPRO_MINI_APP_COMMERCIAL_RELEASED,false);
assert.deepEqual(DIMPRO_MINI_APPS.map(x=>x.code),[
 "DIMPRO_ARUTER",
 "DIMPRO_FELUJITASI_GYORSKALKULATOR",
 "DIMPRO_INGATLANFELMERO",
 "DIMPRO_GAZDASEGED",
 "DIMPRO_ONE_EGESZSEG",
]);
assert.ok(DIMPRO_MINI_APPS.every(x=>x.requiresPrimarySubscription===false));
assert.ok(DIMPRO_MINI_APPS.every(x=>!DIMPRO_PRODUCTS.some(y=>y.code===x.code)));
assert.equal(isMiniAppScopeAllowed("DIMPRO_ARUTER","ORGANIZATION"),true);
assert.equal(isMiniAppScopeAllowed("DIMPRO_ARUTER","USER"),false);
assert.equal(isMiniAppScopeAllowed("DIMPRO_FELUJITASI_GYORSKALKULATOR","USER"),true);
assert.equal(isMiniAppScopeAllowed("DIMPRO_INGATLANFELMERO","ORGANIZATION"),true);
assert.equal(isMiniAppScopeAllowed("DIMPRO_GAZDASEGED","USER"),true);
assert.equal(isMiniAppScopeAllowed("DIMPRO_ONE_EGESZSEG","USER"),true);
assert.equal(isMiniAppScopeAllowed("DIMPRO_ONE_EGESZSEG","ORGANIZATION"),false);
assert.equal(isMiniAppScopeAllowed("DIMPRO_ONE_EGESZSEG","PROJECT"),false);
assert.equal(dimproMiniApp("DIMPRO_ONE_EGESZSEG").relatedPrimaryProduct,"DIMPRO_ONE");
assert.equal(dimproMiniApp("DIMPRO_ONE_EGESZSEG").dataSensitivity,"SPECIAL_CATEGORY_HEALTH");
assert.equal(dimproMiniApp("DIMPRO_ONE"),undefined);
assert.ok(DIMPRO_MINI_APPS.every(x=>x.licenseScopes.length>0));
const source=readFileSync("db/auth/migrations/020_auth_v057_dimpro_mini_app_catalog.sql","utf8");
assert.ok(source.includes("ON CONFLICT(code) DO NOTHING"));
assert.ok(source.includes("commercial_state text NOT NULL DEFAULT 'PLANNED' CHECK(commercial_state='PLANNED')"));
assert.ok(source.includes("entitlement_enabled boolean NOT NULL DEFAULT false CHECK(entitlement_enabled=false)"));
assert.ok(source.includes("GRANT SELECT ON public.auth_mini_app_catalog"));
assert.ok(!source.includes("INSERT INTO public.auth_access_grants"));
assert.ok(!source.includes("INSERT INTO public.auth_user_product_licenses"));
assert.ok(!source.includes("INSERT INTO public.auth_project_product_licenses"));
assert.ok(!source.includes("UPDATE public.auth_products"));
assert.ok(!source.includes("CREATE TABLE public.auth_health"));
for(const x of DIMPRO_MINI_APPS)assert.ok(source.includes("'"+x.code+"'"),"SQL includes "+x.code);
const ui=readFileSync("components/license/MiniAppLicenseCatalog.tsx","utf8");
assert.ok(ui.includes("DIMPRO_MINI_APPS.map"));
assert.ok(ui.includes("Licenc előkészítés alatt"));
assert.ok(ui.includes("Az egészségügyi adatok nem részei"));
assert.ok(!ui.includes("fetch(")&&!ui.includes("onClick="));
const center=readFileSync("app/admin/licenckozpont/page.tsx","utf8");
assert.ok(center.includes("<MiniAppLicenseCatalog/>"));
assert.ok(center.includes("<ProductArchitectureOverview/>"));
console.log("DIMPRO MINI APP CATALOG CONTRACT PASS");
