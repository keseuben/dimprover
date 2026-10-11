import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolveUserCommercialReadiness}
  from "../../app/lib/license/userCommercialReadinessCore.ts";

const mod=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!mod)throw Error("Isolated PostgreSQL test module required");
const {PGlite}=await import(pathToFileURL(mod).href);
const db=new PGlite();
const userA="14544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const userB="24544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const operator="34544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const company="4f7b8696-3019-4c63-a5ef-a491565cc001";
const query="SELECT l.product_code,l.status,l.plan_code,l.storage_quota_bytes::text AS storage_quota_bytes,"+
 " l.starts_at,l.expires_at,l.approved_at,l.approved_by_user_id"+
 " FROM public.auth_user_product_licenses l JOIN public.auth_users u ON u.id=l.owner_user_id"+
 " WHERE l.owner_user_id=$1::uuid AND u.status='ACTIVE'"+
 " AND u.login_enabled=true AND u.email_verified_at IS NOT NULL"+
 " AND l.product_code IN ('DRIVE','DIMPRO_ONE')";
try{
 await db.exec("CREATE ROLE dimpro_auth_migrator_dev;CREATE ROLE dimpro_auth_app_dev;GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev;GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev;SET ROLE dimpro_auth_migrator_dev;");
 await db.exec("CREATE TABLE public.auth_users(id uuid PRIMARY KEY,status text NOT NULL DEFAULT 'ACTIVE',login_enabled boolean NOT NULL DEFAULT true,email_verified_at timestamptz);CREATE TABLE public.auth_organizations(id uuid PRIMARY KEY);CREATE TABLE public.auth_products(code text PRIMARY KEY,name text,status text CHECK(status IN ('ACTIVE','DISABLED')));");
 await db.query("INSERT INTO public.auth_users(id,email_verified_at) VALUES ($1,now()),($2,now()),($3,now())",[userA,userB,operator]);
 await db.query("INSERT INTO public.auth_organizations(id) VALUES($1)",[company]);
 await db.exec("INSERT INTO public.auth_products(code,name,status) VALUES('DRIVE','DIMPRO Drive','ACTIVE');");
 for(const file of [
  "018_auth_v055_dimpro_product_topology.sql","019_auth_v056_user_product_licenses.sql",
 ])await db.exec(readFileSync("db/auth/migrations/"+file,"utf8"));
 let r=await db.query("SELECT count(*)::integer AS n FROM public.auth_user_product_licenses");
 assert.equal(r.rows[0].n,0,"no commercial row seeded by migration");
 await db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,status,payer_type,payer_user_id,storage_quota_bytes,starts_at,expires_at,approved_at,approved_by_user_id) VALUES($1,'DRIVE','UDL-OWNERAA','DRIVE_PERSONAL_PLUS','ACTIVE','USER',$1,26843545600,'2026-10-01T00:00:00Z','2026-11-01T00:00:00Z','2026-10-01T00:00:00Z',$2)",[userA,operator]);
 await db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,status,payer_type,payer_organization_id,storage_quota_bytes) VALUES($1,'DIMPRO_ONE','UOL-OWNERAA','ONE_BASIC','PENDING_APPROVAL','ORGANIZATION',$2,0)",[userA,company]);
 await db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,status,payer_type,payer_user_id,storage_quota_bytes) VALUES($1,'DRIVE','UDL-OWNERBB','DRIVE_PERSONAL_10G','PENDING_APPROVAL','USER',$1,10737418240)",[userB]);
 r=await db.query("SELECT count(*)::integer AS n FROM public.auth_user_product_license_audit");
 assert.equal(r.rows[0].n,3,"three create audit rows");
 await assert.rejects(()=>db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,payer_type,payer_user_id,storage_quota_bytes) VALUES($1,'DRIVE','UDL-OWNERXX','DRIVE_PERSONAL_START','USER',$1,5368709120)",[userA]),/duplicate key/i,"one personal Drive per identity");
 await assert.rejects(()=>db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,payer_type,payer_user_id,storage_quota_bytes) VALUES($1,'PROJECT_GATE','UDL-OWNERYY','GATE_BASIC','USER',$1,5368709120)",[userB]),/check constraint/i,"project plan cannot become personal");
 await assert.rejects(()=>db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,payer_type,payer_user_id,storage_quota_bytes) VALUES($1,'DIMPRO_ONE','UOL-OWNERZZ','ONE_BASIC','USER',$1,5368709120)",[userB]),/check constraint/i,"DIMPROONE does not mint second Drive quota");
 await assert.rejects(()=>db.query("INSERT INTO public.auth_user_product_licenses(owner_user_id,product_code,license_code,plan_code,status,payer_type,payer_user_id,storage_quota_bytes) VALUES($1,'DIMPRO_ONE','UOL-OWNERWW','ONE_BASIC','ACTIVE','USER',$1,0)",[userB]),/check constraint/i,"ACTIVE requires approval");
 await assert.rejects(()=>db.query("UPDATE public.auth_user_product_licenses SET owner_user_id=$1,revision=2 WHERE license_code='UDL-OWNERAA'",[operator]),/AUTH_USER_LICENSE_OWNER_IMMUTABLE/i);
 await assert.rejects(()=>db.query("UPDATE public.auth_user_product_licenses SET plan_code='DRIVE_PERSONAL_50G' WHERE license_code='UDL-OWNERAA'"),/REVISION_INVALID/i);
 await assert.rejects(()=>db.query("DELETE FROM public.auth_user_product_licenses WHERE license_code='UDL-OWNERAA'"),/DELETE_DENIED/i);
 await db.query("UPDATE public.auth_user_product_licenses SET plan_code='DRIVE_PERSONAL_50G',revision=2 WHERE license_code='UDL-OWNERAA'");
 r=await db.query("SELECT operation FROM public.auth_user_product_license_audit ORDER BY id");
 assert.deepEqual(r.rows.map(x=>x.operation),["CREATE","CREATE","CREATE","CHANGE"],"updates audited");
 await db.exec("RESET ROLE;SET ROLE dimpro_auth_app_dev;");
 // Migration 004 grants SELECT on auth_users to app role.
 await db.exec("RESET ROLE;GRANT SELECT ON public.auth_users TO dimpro_auth_app_dev;SET ROLE dimpro_auth_app_dev;");
 const a=await db.query(query,[userA]);
 assert.equal(a.rows.length,2,"self returns own two products");
 assert.ok(a.rows.every(x=>x.plan_code!=="DRIVE_PERSONAL_10G"),"another user never leaks");
 const b=await db.query(query,[userB]);
 assert.equal(b.rows.length,1);
 assert.equal(b.rows[0].plan_code,"DRIVE_PERSONAL_10G");
 const status=resolveUserCommercialReadiness(a.rows,{sourceAvailable:true,now:Date.parse("2026-10-11T11:00:00Z")});
 assert.deepEqual(status.map(x=>x.status),["ACTIVE_RECORD_ONLY","PENDING_APPROVAL"]);
 assert.ok(status.every(x=>!x.effectiveEntitlementActive&&!x.effectiveQuotaChanged));
 await assert.rejects(()=>db.query("UPDATE public.auth_user_product_licenses SET plan_code='BAD'"),/permission denied/i,"app cannot alter plans");
 await assert.rejects(()=>db.query("SELECT * FROM public.auth_user_product_license_audit"),/permission denied/i,"audit not exposed");
 await db.exec("RESET ROLE;");
 console.log("DIMPRO V0.9.44 USER LICENSE PGLITE ISOLATION PASS");
}finally{await db.close();}
