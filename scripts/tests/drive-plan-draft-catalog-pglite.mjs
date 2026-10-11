import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {INITIAL_LICENSE_PLAN_DRAFTS,GIB} from "../../app/lib/license/planCatalogDrafts.ts";
const modulePath=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!modulePath)throw Error("Isolated PGlite path required");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
const admin="24544d2c-4fe1-4c09-82f3-935d5a8b4b45";
try{
 await db.exec("CREATE ROLE dimpro_auth_migrator_dev; CREATE ROLE dimpro_auth_app_dev; GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev;GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev;SET ROLE dimpro_auth_migrator_dev; CREATE TABLE public.auth_users(id uuid PRIMARY KEY);");
 await db.query("INSERT INTO public.auth_users(id) VALUES($1)",[admin]);
 await db.exec(readFileSync("db/auth/migrations/017_auth_v054_license_plan_catalog_drafts.sql","utf8"));
 let r=await db.query("SELECT plan_code,product_code,license_scope,status,price_mode,monthly_price_huf,annual_price_huf,public_visible,storage_quota_bytes::text AS bytes,max_members,proposed_features FROM public.auth_license_plan_catalog ORDER BY plan_code");
 assert.equal(r.rows.length,17,"14 Drive capacity tiers and 3 Projektkapu plans");
 const byCode=new Map(r.rows.map(row=>[row.plan_code,row]));
 for(const proposed of INITIAL_LICENSE_PLAN_DRAFTS){
   const stored=byCode.get(proposed.planCode);
   assert.ok(stored,"proposal code present in SQL seed");
   assert.equal(stored.product_code,proposed.productCode);
   assert.equal(stored.license_scope,proposed.scope);
   assert.equal(stored.bytes,proposed.proposedStorageGiB===null?null:String(proposed.proposedStorageGiB*GIB));
   assert.equal(stored.max_members,proposed.proposedMemberLimit);
   assert.deepEqual(stored.proposed_features,proposed.proposedFeatureCodes);
 }

 assert.ok(r.rows.every(plan=>plan.status==="DRAFT"&&!plan.public_visible&&plan.price_mode==="PENDING"&&plan.monthly_price_huf===null&&plan.annual_price_huf===null),"no pricing or public offer");
 assert.equal(r.rows.filter(row=>row.product_code==="DRIVE"&&row.license_scope==="PERSONAL").length,7,"personal plans");
 assert.equal(r.rows.filter(row=>row.product_code==="DRIVE"&&row.license_scope==="PROJECT").length,7,"project Drive plans");
 assert.equal(r.rows.filter(row=>row.product_code==="PROJECT_GATE"&&row.license_scope==="PROJECT").length,3,"Projektkapu plans");
 const allPersonal=r.rows.filter(row=>row.product_code==="DRIVE"&&row.license_scope==="PERSONAL");
 const allProject=r.rows.filter(row=>row.product_code==="DRIVE"&&row.license_scope==="PROJECT");
 assert.ok(allPersonal.every(row=>row.max_members===1),"Saját Drive capacity does not imply multi-user access");
 assert.ok(allProject.every(row=>row.max_members===null),"Projekt Drive seats are independently licensed");
 assert.equal(new Set(allPersonal.map(row=>JSON.stringify(row.proposed_features))).size,1,"all personal GiB variants same features");
 assert.equal(new Set(allProject.map(row=>JSON.stringify(row.proposed_features))).size,1,"all project GiB variants same features");
 assert.ok(r.rows.filter(row=>row.product_code==="PROJECT_GATE").every(row=>row.bytes===null),"Projektkapu is not sold as extra storage");
 const before=await db.query("SELECT count(*)::integer AS count FROM public.auth_license_plan_catalog_audit");
 assert.equal(before.rows[0].count,17,"proposal seed audited");
 await assert.rejects(()=>db.query("UPDATE public.auth_license_plan_catalog SET status='APPROVED',revision=2 WHERE plan_code='DRIVE_PROJECT_START'"),/check constraint/i,"approval without price and approver denied");
 await assert.rejects(()=>db.query("UPDATE public.auth_license_plan_catalog SET public_visible=true,revision=2 WHERE plan_code='DRIVE_PROJECT_START'"),/check constraint/i,"no public visibility in draft");
 await assert.rejects(()=>db.query("UPDATE public.auth_license_plan_catalog SET storage_quota_bytes=1 WHERE plan_code='DRIVE_PROJECT_START'"),/REVISION_INVALID/i,"revision mandatory");
 await db.query("UPDATE public.auth_license_plan_catalog SET storage_quota_bytes=40::bigint*1073741824,revision=2 WHERE plan_code='DRIVE_PROJECT_START'");
 r=await db.query("SELECT count(*)::integer AS count FROM public.auth_license_plan_catalog_audit");
 assert.equal(r.rows[0].count,18,"edits auditable");
 await assert.rejects(()=>db.query("DELETE FROM public.auth_license_plan_catalog WHERE plan_code='DRIVE_PROJECT_START'"),/DELETE_DENIED/i,"catalog not hard-deletable");
 await db.exec("RESET ROLE;SET ROLE dimpro_auth_app_dev;");
 r=await db.query("SELECT count(*)::integer AS count FROM public.auth_license_plan_catalog");
 assert.equal(r.rows[0].count,17,"runtime read allowed");
 await assert.rejects(()=>db.query("UPDATE public.auth_license_plan_catalog SET revision=3"),/permission denied/i,"runtime cannot mutate draft offers");
 await assert.rejects(()=>db.query("SELECT * FROM public.auth_license_plan_catalog_audit"),/permission denied/i,"audit not public via app");
 await db.exec("RESET ROLE;");
 console.log("DIMPRO LICENSE DRAFT CATALOG PGLITE 18/18 PASS");
}finally{await db.close();}
