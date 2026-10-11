import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const modulePath=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!modulePath)throw Error("isolated PGlite required");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
const admin="24544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const user="24544d2c-4fe1-4c09-82f3-935d5a8b4b46";
const org="5f7b8696-3019-4c63-a5ef-a491565cc001";
const project="4f7b8696-3019-4c63-a5ef-a491565cc001";
const callCreate=(product,quota,operator=admin)=>db.query(
 "SELECT public.auth_issue_project_product_license_pending($1,$2,$3,$4,$5::uuid,$6,$7,$8::uuid,$9) AS id",
 ["p001",product,product==="DRIVE"?"DRIVE_PRO":"GATE_PRO","ORGANIZATION",org,quota,25,operator,"Indoklás a tesztprojekt számára"]);
try{
 await db.exec("CREATE ROLE dimpro_auth_migrator_dev; CREATE ROLE dimpro_auth_app_dev; GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev; GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev; SET ROLE dimpro_auth_migrator_dev;");
 await db.exec("CREATE TABLE public.auth_users(id uuid PRIMARY KEY, security_level text, status text,login_enabled boolean);CREATE TABLE public.auth_organizations(id uuid PRIMARY KEY,status text);CREATE TABLE public.auth_projects(id uuid PRIMARY KEY,external_project_id text,status text);");
 await db.query("INSERT INTO public.auth_users(id,security_level,status,login_enabled) VALUES ($1,'SUPERADMIN','ACTIVE',true),($2,'SIMPLE','ACTIVE',true)",[admin,user]);
 await db.query("INSERT INTO public.auth_organizations(id,status) VALUES($1,'ACTIVE')",[org]);
 await db.query("INSERT INTO public.auth_projects(id,external_project_id,status) VALUES($1,'p001','ACTIVE')",[project]);
 for(const filename of ["014_auth_v051_drive_project_licenses.sql","015_auth_v052_project_product_licenses.sql","016_auth_v053_project_product_license_issuance.sql"])
   await db.exec(readFileSync("db/auth/migrations/"+filename,"utf8"));
 await db.exec("RESET ROLE;SET ROLE dimpro_auth_app_dev;");
 await assert.rejects(()=>callCreate("DRIVE",10737418240,user),/OPERATOR_UNAUTHORIZED/);
 await assert.rejects(()=>callCreate("PROJECT_GATE",1000),/QUOTA_INVALID/);
 await assert.rejects(()=>callCreate("DRIVE",0),/QUOTA_INVALID/);
 let create=await callCreate("DRIVE",10737418240);
 assert.equal(create.rows.length,1);
 const driveId=create.rows[0].id;
 create=await callCreate("PROJECT_GATE",0);
 assert.equal(create.rows.length,1);
 const gateId=create.rows[0].id;
 await assert.rejects(()=>callCreate("DRIVE",10737418240),/ALREADY_EXISTS/,"no duplicate issue");
 let r=await db.query("SELECT product_code,status,approved_at,issued_by_user_id FROM public.auth_project_product_licenses ORDER BY product_code");
 assert.deepEqual(r.rows.map(row=>row.product_code),["DRIVE","PROJECT_GATE"]);
 assert.ok(r.rows.every(row=>row.status==="PENDING_APPROVAL"&&!row.approved_at),"never auto-active");
 assert.ok(r.rows.every(row=>row.issued_by_user_id===admin),"issuer always audited");
 await assert.rejects(()=>db.query("SELECT public.auth_approve_project_product_license($1,$2::uuid,$3::timestamptz,$4)",[gateId,user,"2027-10-11T09:00:00Z","Admin approval reason"]),/OPERATOR_UNAUTHORIZED/);
 let approved=await db.query("SELECT public.auth_approve_project_product_license($1,$2::uuid,$3::timestamptz,$4) AS ok",[gateId,admin,"2027-10-11T09:00:00Z","Admin approval reason"]);
 assert.equal(approved.rows[0].ok,true);
 approved=await db.query("SELECT public.auth_approve_project_product_license($1,$2::uuid,$3::timestamptz,$4) AS ok",[gateId,admin,"2027-10-11T09:00:00Z","Admin approval reason"]);
 assert.equal(approved.rows[0].ok,false,"cannot approve twice");
 r=await db.query("SELECT product_code,status,revision FROM public.auth_project_product_licenses ORDER BY product_code");
 assert.deepEqual(r.rows.map(row=>row.status),["PENDING_APPROVAL","ACTIVE"],"product licenses independent");
 assert.deepEqual(r.rows.map(row=>row.revision),[1,2]);
 await assert.rejects(()=>db.query("SELECT * FROM public.auth_project_product_license_audit"),/permission denied/);
 await db.exec("RESET ROLE;");
 r=await db.query("SELECT operation FROM public.auth_project_product_license_audit ORDER BY id");
 assert.deepEqual(r.rows.map(row=>row.operation),["CREATE","CREATE","CHANGE"]);
 console.log("DIMPRO PROJECT DRIVE + PROJEKTKAPU ISSUANCE PGLITE 15/15 PASS");
}finally{await db.close();}
