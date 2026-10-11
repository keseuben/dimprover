import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolveProjectCommercialReadiness}
  from "../../app/lib/license/projectCommercialReadinessCore.ts";
const modulePath=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!modulePath)throw Error("Isolated PostgreSQL test module required");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
const owner="14544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const org="5f7b8696-3019-4c63-a5ef-a491565cc001";
const p1="4f7b8696-3019-4c63-a5ef-a491565cc001";
const p2="4f7b8696-3019-4c63-a5ef-a491565cc002";
const query=
 "SELECT l.product_code,l.status,l.plan_code,"+
 " l.storage_quota_bytes::text AS storage_quota_bytes,l.max_project_members,"+
 " l.starts_at,l.expires_at,l.approved_at,l.approved_by_user_id"+
 " FROM public.auth_project_product_licenses l"+
 " JOIN public.auth_projects ap ON ap.id=l.auth_project_id"+
 " WHERE ap.external_project_id=$1 AND ap.status='ACTIVE'"+
 " AND l.product_code IN ('DRIVE','PROJECT_GATE')";
try{
 await db.exec("CREATE ROLE dimpro_auth_migrator_dev;CREATE ROLE dimpro_auth_app_dev;GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev;GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev;SET ROLE dimpro_auth_migrator_dev;");
 await db.exec("CREATE TABLE public.auth_users(id uuid PRIMARY KEY);CREATE TABLE public.auth_organizations(id uuid PRIMARY KEY);CREATE TABLE public.auth_projects(id uuid PRIMARY KEY,external_project_id text,status text);");
 await db.query("INSERT INTO public.auth_users(id) VALUES($1)",[owner]);
 await db.query("INSERT INTO public.auth_organizations(id) VALUES($1)",[org]);
 await db.query("INSERT INTO public.auth_projects(id,external_project_id,status) VALUES($1,'project-A','ACTIVE'),($2,'project-B','ACTIVE')",[p1,p2]);
 for(const file of ["014_auth_v051_drive_project_licenses.sql","015_auth_v052_project_product_licenses.sql"])
  await db.exec(readFileSync("db/auth/migrations/"+file,"utf8"));
 const args=(proj,product,code,quota)=>[proj,product,code,product==="DRIVE"?"DRIVE_PROJECT_25G":"GATE_PROJECT_BASIC",org,quota];
 await db.query(
  "INSERT INTO public.auth_project_product_licenses(auth_project_id,product_code,license_code,plan_code,payer_type,payer_organization_id,storage_quota_bytes,status,starts_at,expires_at,approved_at,approved_by_user_id)"+
  " VALUES($1,$2,$3,$4,'ORGANIZATION',$5,$6,'ACTIVE','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z','2026-10-01T00:00:00Z',$7)",
  [...args(p1,"DRIVE","DPL-OWN100",25*1024**3),owner]
 );
 await db.query(
  "INSERT INTO public.auth_project_product_licenses(auth_project_id,product_code,license_code,plan_code,payer_type,payer_organization_id,storage_quota_bytes,status,starts_at,expires_at,approved_at,approved_by_user_id)"+
  " VALUES($1,$2,$3,$4,'ORGANIZATION',$5,$6,'ACTIVE','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z','2026-10-01T00:00:00Z',$7)",
  [...args(p1,"PROJECT_GATE","PGL-OWN100",0),owner]
 );
 await db.query(
  "INSERT INTO public.auth_project_product_licenses(auth_project_id,product_code,license_code,plan_code,payer_type,payer_organization_id,storage_quota_bytes,status)"+
  " VALUES($1,$2,$3,$4,'ORGANIZATION',$5,$6,'PENDING_APPROVAL')",
  args(p2,"DRIVE","DPL-OTHER100",25*1024**3)
 );
 // Migration 004 grants app SELECT on auth_projects (and similar core tables).
 await db.exec("GRANT SELECT ON public.auth_projects TO dimpro_auth_app_dev;");
 await db.exec("RESET ROLE;SET ROLE dimpro_auth_app_dev;");
 const own=await db.query(query,["project-A"]);
 assert.equal(own.rows.length,2,"only requested project returned");
 assert.ok(own.rows.every(x=>x.status==="ACTIVE"));
 assert.ok(own.fields.every(f=>!f.name.startsWith("payer")&&!f.name.includes("license_code")),"payer and license ID not read");
 const summary=resolveProjectCommercialReadiness(own.rows,{now:Date.parse("2026-10-11T10:00:00Z"),sourceAvailable:true});
 assert.equal(summary[0].recordStatus,"ACTIVE_RECORD_ONLY");
 assert.equal(summary[1].recordStatus,"ACTIVE_RECORD_ONLY");
 assert.ok(summary.every(row=>!row.canGrantAccess&&!row.enforcementActive));
 const other=await db.query(query,["project-B"]);
 assert.equal(other.rows.length,1);
 assert.equal(other.rows[0].status,"PENDING_APPROVAL");
 assert.equal(resolveProjectCommercialReadiness(other.rows,{now:Date.now(),sourceAvailable:true})[1].recordStatus,"NOT_ASSIGNED");
 const unknown=await db.query(query,["project-C"]);
 assert.equal(unknown.rows.length,0,"no cross-project fallback");
 await assert.rejects(()=>db.query("UPDATE public.auth_project_product_licenses SET status='ACTIVE'"),/permission denied/i);
 await db.exec("RESET ROLE");
 console.log("DIMPRO PROJECT READINESS POSTGRES TENANT ISOLATION 10/10 PASS");
}finally{await db.close();}
