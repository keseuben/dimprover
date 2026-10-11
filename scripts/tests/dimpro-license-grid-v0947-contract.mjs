import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sortLicenseGrid} from "../../app/lib/license/licenseGrid.ts";
import {DIMPRO_PRODUCTS} from "../../app/lib/license/dimproProductArchitecture.ts";
import {DIMPRO_MINI_APPS} from "../../app/lib/license/dimproMiniAppCatalog.ts";
import {DIMPRO_DROP_SERVICE} from "../../app/lib/license/dimproDropServiceCatalog.ts";

const rows=[
  {public_license_code:"LIC-26-10",ownerName:"Ábel",product_code:"DIMPRO_DROP",
    plan_code:"SEND_PLUS",status:"active",memberCount:4,max_users:20,
    expires_at:null,tag:"r1"},
  {public_license_code:"LIC-26-2",ownerName:"Béla",product_code:"DRIVE",
    plan_code:"PROJECT_25G",status:"trial",memberCount:1,max_users:2,
    expires_at:"2026-12-15T00:00:00Z",tag:"r2"},
  {public_license_code:"LIC-26-3",ownerName:"Cecília",product_code:"DRIVE",
    plan_code:"PERSONAL_10G",status:"active",memberCount:1,max_users:3,
    expires_at:"2026-10-15T00:00:00Z",tag:"r3"},
];
const tags=items=>items.map(item=>item.tag);
assert.deepEqual(tags(sortLicenseGrid(rows,"code","asc")),["r2","r3","r1"],"natural code");
assert.deepEqual(tags(sortLicenseGrid(rows,"code","desc")),["r1","r3","r2"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"owner","asc")),["r1","r2","r3"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"owner","desc")),["r3","r2","r1"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"users","desc")),["r1","r3","r2"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"expiry","asc")),["r3","r2","r1"],"no expiry at end");
assert.deepEqual(tags(sortLicenseGrid(rows,"expiry","desc")),["r1","r2","r3"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"status","asc")),["r1","r3","r2"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"product","asc")),["r1","r3","r2"]);
assert.deepEqual(tags(sortLicenseGrid(rows,"code","asc")).sort(),tags(rows).sort(),"all rows preserved");
assert.deepEqual(tags(rows),["r1","r2","r3"],"source array not mutated");
const duplicate={...rows[0],tag:"duplicate"};
assert.deepEqual(tags(sortLicenseGrid([rows[0],duplicate],"code","asc")),["r1","duplicate"],"stable equality");
const css=readFileSync("app/admin/licenckozpont/license-center.css","utf8");
assert.ok(css.includes(".dimpro-license-center .benjadmin-data-table"),"actual missing table css added");
assert.ok(css.includes("position:sticky"),"sticky headings");
assert.ok(css.includes("overflow:auto"),"horizontal scroll");
assert.ok(css.includes('button[aria-pressed="true"]'),"tab selected style");
assert.ok(css.includes(".benjadmin-data-drawer"),"existing edit drawer styled");
assert.ok(css.includes(".benjadmin-data-auth-card"),"auth failure screen styled");
assert.ok(!css.includes("\nbody{")&&!css.includes(":root{"),"route-specific only");
const page=readFileSync("app/admin/licenckozpont/page.tsx","utf8");
assert.ok(page.includes('import "./license-center.css"'));
assert.ok(page.includes('className="dimpro-license-center"'));
assert.ok(page.includes('setActiveView('));
assert.ok(page.includes('activeView==="licenses"'));
assert.ok(page.includes('activeView==="modules"'));
assert.ok(page.includes('activeView==="products"'));
assert.ok(page.includes('activeView==="projects"'));
assert.ok(page.includes('activeView==="plans"'));
assert.ok(page.includes("<UnifiedProductGrid/>"));
assert.ok(page.includes("<ProjectProductLicensesAdmin adminKey={adminKey}/>"));
assert.ok(page.includes("<PlanDraftCatalogue/>")&&page.includes("<PricingProposalWorkshop/>"));
assert.ok(page.includes("sortLicenseGrid("));
assert.ok(page.includes("aria-sort="));
assert.ok(page.includes("productFilter"));
assert.ok(page.includes("setPage(1)"));
assert.ok(page.includes("openEdit(license)"),"original editing remains");
assert.ok(page.includes('fetch("/api/dimpro-identity/admin/licenses"'),"original secure API remains");
assert.ok(page.includes('fetch("/api/dimpro-identity/admin/send-entitlements"'),"original Send API remains");
assert.ok(page.includes("BenjadminPagination"),"original paging remains");
const grid=readFileSync("components/license/UnifiedProductGrid.tsx","utf8");
assert.ok(grid.includes("DIMPRO_PRODUCTS")&&grid.includes("DIMPRO_MINI_APPS")&&grid.includes("DIMPRO_DROP_SERVICE"));
assert.ok(DIMPRO_PRODUCTS.length+DIMPRO_MINI_APPS.length+1===12,"all 12 products represented");
assert.equal(DIMPRO_DROP_SERVICE.requiresDriveSubscription,false);
assert.ok(grid.includes("A katalógus nem számlázási adatforrás"));
assert.ok(!grid.includes("fetch(")&&!grid.includes("PATCH")&&!grid.includes("POST"),"read-only catalog");
console.log("DIMPRO V0.9.47 LICENSE GRID UX CONTRACT PASS");
