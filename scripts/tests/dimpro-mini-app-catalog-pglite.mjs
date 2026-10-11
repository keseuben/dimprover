import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {DIMPRO_MINI_APPS} from "../../app/lib/license/dimproMiniAppCatalog.ts";

const modulePath=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!modulePath)throw Error("Isolated PGlite module required");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
try{
  await db.exec("CREATE ROLE dimpro_auth_migrator_dev;CREATE ROLE dimpro_auth_app_dev;GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev;GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev;SET ROLE dimpro_auth_migrator_dev;");
  await db.exec("CREATE TABLE public.auth_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,status text NOT NULL CHECK(status IN ('ACTIVE','DISABLED')));");
  await db.exec("INSERT INTO public.auth_products(code,name,status) VALUES ('DRIVE','DIMPRO Drive','ACTIVE'),('PROJECT_GATE','Existing Projektkapu Name','ACTIVE');");
  await db.exec(readFileSync("db/auth/migrations/018_auth_v055_dimpro_product_topology.sql","utf8"));
  await db.exec(readFileSync("db/auth/migrations/020_auth_v057_dimpro_mini_app_catalog.sql","utf8"));
  let result=await db.query("SELECT product_code,license_scopes,app_group,related_primary_product,requires_primary_subscription,data_sensitivity,commercial_state,entitlement_enabled FROM public.auth_mini_app_catalog ORDER BY product_code");
  assert.equal(result.rows.length,5,"five mini app records");
  for(const app of DIMPRO_MINI_APPS){
    const found=result.rows.find(x=>x.product_code===app.code);
    assert.ok(found,"record for "+app.code);
    assert.deepEqual(found.license_scopes,[...app.licenseScopes]);
    assert.equal(found.app_group,app.group);
    assert.equal(found.related_primary_product,app.relatedPrimaryProduct);
    assert.equal(found.requires_primary_subscription,false);
    assert.equal(found.data_sensitivity,app.dataSensitivity);
    assert.equal(found.commercial_state,"PLANNED");
    assert.equal(found.entitlement_enabled,false);
  }
  result=await db.query("SELECT code,name,status FROM public.auth_products ORDER BY code");
  assert.equal(result.rows.length,11);
  assert.equal(result.rows.find(x=>x.code==="DRIVE").status,"ACTIVE","original Drive preserved");
  assert.equal(result.rows.find(x=>x.code==="PROJECT_GATE").name,"Existing Projektkapu Name");
  assert.equal(result.rows.find(x=>x.code==="PROJECT_GATE").status,"ACTIVE");
  assert.ok(result.rows.filter(x=>DIMPRO_MINI_APPS.some(app=>app.code===x.code)).every(x=>x.status==="DISABLED"));
  result=await db.query("SELECT count(*)::int AS n FROM public.auth_product_scope_catalog");
  assert.equal(result.rows[0].n,6,"original topology untouched");
  await assert.rejects(()=>db.query("UPDATE public.auth_mini_app_catalog SET entitlement_enabled=true"),/check constraint/i);
  await assert.rejects(()=>db.query("UPDATE public.auth_mini_app_catalog SET commercial_state='ACTIVE'"),/check constraint/i);
  await assert.rejects(()=>db.query("UPDATE public.auth_mini_app_catalog SET requires_primary_subscription=true"),/check constraint/i);
  await assert.rejects(()=>db.query("UPDATE public.auth_mini_app_catalog SET license_scopes=ARRAY['ORGANIZATION']::text[] WHERE product_code='DIMPRO_ONE_EGESZSEG'"),/check constraint/i);
  await assert.rejects(()=>db.query("UPDATE public.auth_mini_app_catalog SET data_sensitivity='STANDARD' WHERE product_code='DIMPRO_ONE_EGESZSEG'"),/check constraint/i);
  await db.exec("RESET ROLE;SET ROLE dimpro_auth_app_dev;");
  result=await db.query("SELECT count(*)::int AS n FROM public.auth_mini_app_catalog");
  assert.equal(result.rows[0].n,5,"app role may read only");
  await assert.rejects(()=>db.query("UPDATE public.auth_mini_app_catalog SET commercial_state='PLANNED'"),/permission denied/i);
  await assert.rejects(()=>db.query("INSERT INTO public.auth_mini_app_catalog(product_code,license_scopes,app_group,data_sensitivity) VALUES('DRIVE',ARRAY['USER'],'BUSINESS','STANDARD')"),/permission denied/i);
  await db.exec("RESET ROLE;");
  console.log("DIMPRO MINI APP CATALOG POSTGRES ISOLATION PASS");
}finally{await db.close();}
