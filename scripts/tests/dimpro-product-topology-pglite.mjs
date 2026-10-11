import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {DIMPRO_PRODUCTS} from "../../app/lib/license/dimproProductArchitecture.ts";
const modulePath=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!modulePath)throw Error("Isolated PGlite required");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
try{
 await db.exec("CREATE ROLE dimpro_auth_migrator_dev;CREATE ROLE dimpro_auth_app_dev;GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev;GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev;SET ROLE dimpro_auth_migrator_dev;");
 await db.exec("CREATE TABLE public.auth_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,status text NOT NULL CHECK(status IN ('ACTIVE','DISABLED')));");
 await db.exec("INSERT INTO public.auth_products(code,name,status) VALUES ('DRIVE','DIMPRO Drive','ACTIVE'),('PROJECT_GATE','Earlier Projektkapu NAME','ACTIVE');");
 await db.exec(readFileSync("db/auth/migrations/018_auth_v055_dimpro_product_topology.sql","utf8"));
 let r=await db.query("SELECT product_code,architectural_level,product_role,license_scopes,storage_policy,commercial_source,entitlement_enabled FROM public.auth_product_scope_catalog ORDER BY architectural_level NULLS LAST");
 assert.equal(r.rows.length,6);
 assert.deepEqual(r.rows.map(x=>x.product_code),["DIMPRO_ONE","DIMPRO_WORK","PROJECT_GATE","DIMPRO_BUILD","DIMPROVER","DRIVE"]);
 for(const expected of DIMPRO_PRODUCTS){
  const found=r.rows.find(x=>x.product_code===expected.code);
  assert.ok(found,expected.code+" seeded");
  assert.equal(found.architectural_level,expected.architecturalLevel);
  assert.equal(found.product_role,expected.role);
  assert.deepEqual(found.license_scopes,[...expected.licenseScopes]);
  assert.equal(found.storage_policy,expected.storagePolicy);
  assert.equal(found.commercial_source,expected.currentCommercialRecord);
  assert.equal(found.entitlement_enabled,false);
 }
 r=await db.query("SELECT code,name,status FROM public.auth_products ORDER BY code");
 assert.equal(r.rows.length,6);
 assert.equal(r.rows.find(x=>x.code==="DRIVE").status,"ACTIVE","Drive SSO unchanged");
 assert.equal(r.rows.find(x=>x.code==="PROJECT_GATE").status,"ACTIVE","existing active product preserved");
 assert.equal(r.rows.find(x=>x.code==="PROJECT_GATE").name,"Earlier Projektkapu NAME","existing name unchanged");
 assert.ok(r.rows.filter(x=>!["DRIVE","PROJECT_GATE"].includes(x.code)).every(x=>x.status==="DISABLED"));
 await assert.rejects(()=>db.query("UPDATE public.auth_product_scope_catalog SET entitlement_enabled=true"),/check constraint/i,"no auto enforcement");
 await assert.rejects(()=>db.query("INSERT INTO public.auth_product_scope_catalog(product_code,architectural_level,product_role,license_scopes,storage_policy,commercial_source) VALUES ('DRIVE',6,'PRIMARY_PRODUCT',ARRAY['USER'],'SHARED_DRIVE','NOT_IMPLEMENTED')"),/check constraint|duplicate key/i);
 await db.exec("RESET ROLE;SET ROLE dimpro_auth_app_dev;");
 r=await db.query("SELECT count(*)::int AS n FROM public.auth_product_scope_catalog");
 assert.equal(r.rows[0].n,6,"app may read registry");
 await assert.rejects(()=>db.query("UPDATE public.auth_product_scope_catalog SET commercial_source='NOT_IMPLEMENTED'"),/permission denied/i,"runtime cannot change registry");
 await db.exec("RESET ROLE;");
 console.log("DIMPRO PRODUCT TOPOLOGY PGLITE 12/12 PASS");
}finally{await db.close();}
