import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {LICENSE_OPERATOR_ROLES,LICENSE_OPERATOR_PERMISSIONS}
  from "../../app/lib/license/licenseOperatorPolicy.ts";
const modulePath=process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if(!modulePath)throw Error("Isolated PostgreSQL engine required");
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
const requester="14544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const finance="24544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const security="34544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const owner="44544d2c-4fe1-4c09-82f3-935d5a8b4b45";
try{
 await db.exec("CREATE ROLE dimpro_auth_migrator_dev;CREATE ROLE dimpro_auth_app_dev;"+
  "GRANT USAGE,CREATE ON SCHEMA public TO dimpro_auth_migrator_dev;"+
  "GRANT USAGE ON SCHEMA public TO dimpro_auth_app_dev;"+
  "SET ROLE dimpro_auth_migrator_dev;");
 await db.exec(
 "CREATE TABLE public.auth_users(id uuid PRIMARY KEY);"+
 "CREATE TABLE public.auth_organizations(id uuid PRIMARY KEY);"+
 "CREATE TABLE public.auth_projects(id uuid PRIMARY KEY);"+
 "CREATE TABLE public.auth_products(code text PRIMARY KEY);"+
 "CREATE TABLE public.auth_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"+
 "code text NOT NULL UNIQUE,name text NOT NULL,security_level text NOT NULL "+
 "CHECK(security_level IN ('SIMPLE','STAFF','PROJECT_MANAGER','ORG_ADMIN','SUPERADMIN')));"+
 "CREATE TABLE public.auth_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"+
 "code text NOT NULL UNIQUE,description text NOT NULL);"+
 "CREATE TABLE public.auth_role_permissions(role_id uuid NOT NULL REFERENCES public.auth_roles(id),"+
 "permission_id uuid NOT NULL REFERENCES public.auth_permissions(id),"+
 "PRIMARY KEY(role_id,permission_id));"+
 "CREATE TABLE public.auth_access_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"+
 "user_id uuid NOT NULL REFERENCES public.auth_users(id),role_id uuid NOT NULL REFERENCES public.auth_roles(id));"+
 "INSERT INTO public.auth_products(code) VALUES('DRIVE'),('DIMPRO_ONE'),('PROJECT_GATE');"
 );
 await db.query("INSERT INTO public.auth_users(id) VALUES($1),($2),($3),($4)",[
  requester,finance,security,owner,
 ]);
 await db.exec(readFileSync("db/auth/migrations/022_auth_v059_license_operator_approval_review.sql","utf8"));
 const roles=await db.query("SELECT code FROM public.auth_roles ORDER BY code");
 assert.deepEqual(roles.rows.map(row=>row.code).sort(),
   [...LICENSE_OPERATOR_ROLES.map(row=>row.code)].sort(),"six central AUTH roles");
 const perms=await db.query("SELECT code FROM public.auth_permissions ORDER BY code");
 assert.deepEqual(perms.rows.map(row=>row.code).sort(),
   [...LICENSE_OPERATOR_PERMISSIONS].sort(),"eight permissions");
 for(const role of LICENSE_OPERATOR_ROLES){
  const p=await db.query(
   "SELECT p.code FROM public.auth_role_permissions rp "+
   "JOIN public.auth_roles r ON r.id=rp.role_id "+
   "JOIN public.auth_permissions p ON p.id=rp.permission_id WHERE r.code=$1",[role.code]);
  assert.deepEqual(p.rows.map(row=>row.code).sort(),[...role.permissions].sort(),role.code);
 }
 for(const table of ["auth_access_grants","auth_license_approval_requests","auth_license_approval_audit"]){
  const result=await db.query("SELECT count(*)::integer AS n FROM public."+table);
  assert.equal(result.rows[0].n,0,table+" no automatic access or requests");
 }
 await assert.rejects(()=>db.query(
  "INSERT INTO public.auth_license_approval_requests("+
  "requester_user_id,owner_user_id,product_code,license_scope,payer_type,payer_user_id,plan_code,reason,"+
  "proposed_expires_at,status,action_actor_user_id,action_reason) VALUES("+
  "$1,$2,'DRIVE','USER','USER',$2,'DRIVE_PERSONAL_PRO','Valid test request',"+
  "'2027-01-01T00:00:00Z','READY_FOR_RELEASE',$1,'Attempt to skip all approvals')",
  [requester,owner]),
  /INSERT_MUST_BE_DRAFT|check constraint/i,"no READY_FOR_RELEASE inserted directly");
 const insert=await db.query(
  "INSERT INTO public.auth_license_approval_requests("+
   "requester_user_id,owner_user_id,product_code,license_scope,payer_type,payer_user_id,plan_code,reason,proposed_expires_at,action_actor_user_id,action_reason)"+
   "VALUES($1,$2,'DRIVE','USER','USER',$2,'DRIVE_PERSONAL_PRO','Valid commercial request for test', '2027-01-01T00:00:00Z',$1,'Test operator submits a drafted request') "+
  "RETURNING id,revision,status",[requester,owner]);
 const id=insert.rows[0].id;
 assert.equal(insert.rows[0].status,"DRAFT");
 assert.equal(insert.rows[0].revision,1);
 let log=await db.query("SELECT operation,new_status FROM public.auth_license_approval_audit WHERE request_id=$1",[id]);
 assert.equal(log.rows.length,1);assert.equal(log.rows[0].operation,"CREATE");
 await assert.rejects(()=>db.query(
  "UPDATE public.auth_license_approval_requests SET status='READY_FOR_RELEASE',revision=2 WHERE id=$1",[id]),
 /TRANSITION_DENIED|check constraint/i,"skip states blocked");
 await assert.rejects(()=>db.query(
  "UPDATE public.auth_license_approval_requests SET owner_user_id=$2,revision=2 WHERE id=$1",[id,security]),
 /IMMUTABLE/i,"cannot switch owner");
 await assert.rejects(()=>db.query(
  "UPDATE public.auth_license_approval_requests SET status='PENDING_BILLING' WHERE id=$1",[id]),
 /REVISION_REQUIRED/i,"monotonic revision required");
 await db.query( "UPDATE public.auth_license_approval_requests SET status='PENDING_BILLING',revision=2,"+
  "action_actor_user_id=$2,action_reason='Submit draft into billing review' WHERE id=$1",[id,requester]);
 await assert.rejects(()=>db.query(
  "UPDATE public.auth_license_approval_requests SET status='PENDING_SECURITY',revision=3,"+
   "billing_evidence_ref='INV-2026-TEST',finance_reviewer_id=$2,finance_approved_at=now(),"+
  "action_actor_user_id=$2,action_reason='Evidence reviewed and approved' WHERE id=$1",[id,requester]),
 /check constraint/i,"self approval blocked");
 await db.query(
  "UPDATE public.auth_license_approval_requests SET status='PENDING_SECURITY',revision=3,"+
   "billing_evidence_ref='INV-2026-TEST',finance_reviewer_id=$2,finance_approved_at=now(),"+
  "action_actor_user_id=$2,action_reason='Evidence reviewed and approved' WHERE id=$1",[id,finance]);
 await assert.rejects(()=>db.query(
  "UPDATE public.auth_license_approval_requests SET status='READY_FOR_RELEASE',revision=4,"+
   "security_reviewer_id=$2,security_approved_at=now(),"+
  "action_actor_user_id=$2,action_reason='Security reviewer accepted identity' WHERE id=$1",[id,finance]),
 /check constraint/i,"same finance and security reviewer blocked");
 await db.query(
  "UPDATE public.auth_license_approval_requests SET status='READY_FOR_RELEASE',revision=4,"+
   "security_reviewer_id=$2,security_approved_at=now(),"+
  "action_actor_user_id=$2,action_reason='Security reviewer accepted identity' WHERE id=$1",[id,security]);
 const completed=await db.query("SELECT status,revision FROM public.auth_license_approval_requests WHERE id=$1",[id]);
 assert.equal(completed.rows[0].status,"READY_FOR_RELEASE");
 assert.equal(completed.rows[0].revision,4);
 await assert.rejects(()=>db.query(
  "UPDATE public.auth_license_approval_requests SET status='CANCELLED',revision=5 WHERE id=$1",[id]),
 /TRANSITION_DENIED/i,"no mutation from terminal state");
 await assert.rejects(()=>db.query(
  "DELETE FROM public.auth_license_approval_requests WHERE id=$1",[id]),
 /DELETE_DENIED/i,"immutable request");
 await assert.rejects(()=>db.exec("DELETE FROM public.auth_license_approval_audit"),/AUDIT_IMMUTABLE/i);
 log=await db.query("SELECT operation,new_status,new_revision,action_actor_user_id,action_reason FROM public.auth_license_approval_audit WHERE request_id=$1 ORDER BY id",[id]);
 assert.deepEqual(log.rows.map(row=>row.new_status),
  ["DRAFT","PENDING_BILLING","PENDING_SECURITY","READY_FOR_RELEASE"]);
 assert.deepEqual(log.rows.map(row=>row.action_actor_user_id),
  [requester,requester,finance,security],"audit records each initiating actor");
 assert.ok(log.rows.every(row=>row.action_reason.trim().length>=12),"all changes have reason");
 await db.exec("RESET ROLE; SET ROLE dimpro_auth_app_dev;");
 await assert.rejects(()=>db.query("SELECT * FROM public.auth_license_approval_requests"),
  /permission denied/i,"app role cannot read protected requests");
 await assert.rejects(()=>db.query("INSERT INTO public.auth_license_approval_requests DEFAULT VALUES"),
  /permission denied/i,"app role cannot create request");
 await assert.rejects(()=>db.query("UPDATE public.auth_license_approval_requests SET status='DRAFT'"),
  /permission denied/i,"app role cannot update request");
 await assert.rejects(()=>db.query("SELECT * FROM public.auth_license_approval_audit"),
  /permission denied/i,"app role cannot read audit");
 await db.exec("RESET ROLE;");
 console.log("DIMPRO V0.9.49 LICENSE OPERATOR PGLITE RBAC + FOUR-EYES AUDIT PASS");
}finally{await db.close();}
