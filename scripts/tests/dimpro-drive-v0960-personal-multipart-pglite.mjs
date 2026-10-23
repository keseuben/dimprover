import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** All tests run in a brand-new in-memory PostgreSQL WASM engine. NEVER DSN. */
const modulePath = process.env.DIMPRO_TEST_PGLITE_MODULE_PATH;
if (!modulePath || !modulePath.includes("/tmp/dimpro-drive-v0960-isolated-pglite/")) {
  throw new Error("Isolated PGlite only: set DIMPRO_TEST_PGLITE_MODULE_PATH to the disposable v0960 sandbox module.");
}
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const root = "supabase/migrations/";
const migration = async file => {
  await db.exec(readFileSync(root + file, "utf8"));
  console.log("MIGRATION_PASS", file);
};
const query = (sql, params=[]) => db.query(sql,params);
const one = async (sql,params=[]) => (await query(sql,params)).rows[0];
const GB = 1024**3;
const A="14544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const B="24544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const folder="44544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const ownObject="64544d2c-4fe1-4c09-82f3-935d5a8b4b45";
const req = n => `b0000000-0000-4000-a000-${String(n).padStart(12,"0")}`;
const base = (owner,id, sizeBytes) => ({
 id, folder_id: owner===A?folder:null,file_name:"Műszaki terv.ifc",
 mime_type:"application/octet-stream",size_bytes:sizeBytes,
 expected_sha256:"a".repeat(64),chunk_size_bytes:64*1024**2,
 total_parts:Math.ceil(sizeBytes/(64*1024**2)),
 storage_bucket:"dimpro-drive-dev",
 storage_key:`users/${owner}/multipart/${id}.ifc`,
 expires_at:new Date(Date.now()+23*3600e3).toISOString(),
});
const reserve= async (owner,id,bytes,def=2*GB) => (await one(
 "select public.dimpro_personal_multipart_create_atomic($1::uuid,$2::uuid,$3::jsonb,$4::bigint) as result",
 [owner,id,JSON.stringify(base(owner,id,bytes)),def])).result;
const quota= async owner => (await one(
 "select public.dimpro_personal_drive_quota_summary_v011($1::uuid,$2::bigint) as result",
 [owner,2*GB])).result;
try {
  await db.exec("CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;");
  await db.exec("CREATE TABLE public.dimpro_users (id uuid primary key); CREATE TABLE public.project_core_projects (id text primary key);");
  for(const file of [
    "20260818183500_dimpro_content_core_user_drive_v010.sql",
    "20261006123000_dimpro_content_personal_folders_v010.sql",
    "20261007_personal_drive_storage_v010.sql",
    "20261023_personal_drive_multipart_foundation_v010.sql",
    "20261023_personal_drive_multipart_quota_v011.sql",
  ]) await migration(file);

  let marker=await one("select schema_version from public.dimpro_personal_drive_multipart_schema_meta where component='personal-drive-multipart'");
  assert.equal(marker.schema_version,"0.1.1");
  await query("INSERT INTO public.dimpro_users (id) VALUES ($1),($2)",[A,B]);
  await query("INSERT INTO public.dimpro_content_personal_folders(id,owner_user_id,name) VALUES ($1,$2,'Tervek')",[folder,A]);
  await query("INSERT INTO public.dimpro_personal_drive_storage_limits(owner_user_id,quota_bytes,hard_limit,source) VALUES ($1,$2,true,'PLAN')",[A,GB]);

  // 100 MiB existing, deduplicated by content_object_id and counted even if
  // the second USER ref is REMOVED (recycle bin retains quota ownership).
  await query(`INSERT INTO public.dimpro_content_objects(
    id,sha256,size_bytes,mime_type,display_name,storage_bucket,storage_key,source_system,source_object_id
  ) VALUES ($1,$2,$3,'application/pdf','existing.pdf','dimpro-drive-dev','existing/ref',
    'DRIVE','old-version')`,[ownObject,"f".repeat(64),100*1024**2]);
  const ensure=(ref)=>query("select id from public.dimpro_personal_drive_ensure_ref_atomic($1::uuid,$2::uuid,'DRIVE',$3,'existing.pdf',$4::bigint)",
    [ownObject,A,ref,2*GB]);
  await ensure("old-file-1");
  await ensure("old-file-2");
  await query("UPDATE public.dimpro_content_refs SET status='REMOVED' WHERE source_ref='old-file-2'");
  let q=await quota(A);
  assert.equal(Number(q.usedBytes),100*1024**2);
  assert.equal(Number(q.reservedBytes),0);

  // Two 400 MiB uploads fit under 1 GiB alongside 100 MiB used.
  const x=await reserve(A,req(1),400*1024**2);
  assert.equal(x.status,"INITIATED");
  const same=await reserve(A,req(1),400*1024**2);
  assert.equal(same.id,x.id,"idempotent reservation");
  await assert.rejects(()=>reserve(A,req(1),500*1024**2),/PERSONAL_MULTIPART_IDEMPOTENCY_CONFLICT/);
  const y=await reserve(A,req(2),400*1024**2);
  assert.equal(y.owner_user_id,A);
  await assert.rejects(()=>reserve(A,req(3),400*1024**2),/PERSONAL_DRIVE_QUOTA_EXCEEDED/);
  q=await quota(A);
  assert.equal(Number(q.reservedBytes),800*1024**2);
  assert.equal(Number(q.occupiedBytes),900*1024**2);
  assert.equal(Number(q.remainingBytes),124*1024**2);

  // Exactly the same advisory quota guard now protects older direct USER refs.
  const anotherObj="74544d2c-4fe1-4c09-82f3-935d5a8b4b45";
  await query(`INSERT INTO public.dimpro_content_objects(
    id,sha256,size_bytes,mime_type,display_name,storage_bucket,storage_key,source_system,source_object_id
  ) VALUES ($1,$2,$3,'application/pdf','new.pdf','dimpro-drive-dev','new/ref',
    'DRIVE','new-version')`,[anotherObj,"b".repeat(64),200*1024**2]);
  await assert.rejects(()=>query("select id from public.dimpro_personal_drive_ensure_ref_atomic($1::uuid,$2::uuid,'DRIVE','new-file','new.pdf',$3::bigint)",
    [anotherObj,A,2*GB]),/PERSONAL_DRIVE_QUOTA_EXCEEDED/);

  // ABORTING, COMPLETING and QUARANTINED remain fully reserved.
  for(const status of ["ABORTING","COMPLETING","QUARANTINED","SCANNING"]) {
    await query("UPDATE public.dimpro_personal_drive_multipart_sessions SET status=$1 WHERE id=$2::uuid",[status,x.id]);
    q=await quota(A);
    assert.equal(Number(q.reservedBytes),800*1024**2,status);
  }
  // Never free a reservation without ABORTED being durable.
  await query("UPDATE public.dimpro_personal_drive_multipart_sessions SET status='ABORTED' WHERE id=$1::uuid",[x.id]);
  q=await quota(A);
  assert.equal(Number(q.reservedBytes),400*1024**2);

  // The other user is isolated and quota reads cannot traverse ownership.
  const other=await reserve(B,req(4),400*1024**2);
  assert.equal(other.owner_user_id,B);
  q=await quota(B);
  assert.equal(Number(q.usedBytes),0);
  assert.equal(Number(q.reservedBytes),400*1024**2);

  // Cross-owner folder FK is rejected even by service-role writes.
  const bad=base(B,req(5),256*1024**2);
  bad.folder_id=folder;
  await assert.rejects(()=>query(
    "select public.dimpro_personal_multipart_create_atomic($1::uuid,$2::uuid,$3::jsonb,$4::bigint)",
    [B,req(5),JSON.stringify(bad),2*GB]),/PERSONAL_MULTIPART_FOLDER_NOT_OWNED/);
  // Both roles denied session access because migration RLS grants only service_role.
  for(const role of ["anon","authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(()=>query("SELECT * FROM public.dimpro_personal_drive_multipart_sessions"),/permission denied/i);
    await db.exec("RESET ROLE");
  }
  const denied=await one("select relrowsecurity as rls from pg_class where oid='public.dimpro_personal_drive_multipart_sessions'::regclass");
  assert.equal(denied.rls,true);
  console.log("DIMPRO Drive V0.9.60 isolated PGlite migration, quota, RLS, ownership PASS");
} finally {
  await db.close();
}

// A missing base schema may NEVER partially install the v011 SQL.
const negativeDB = new PGlite();
try {
  await assert.rejects(() => negativeDB.exec(readFileSync(
    root + "20261023_personal_drive_multipart_quota_v011.sql", "utf8",
  )), /PERSONAL_MULTIPART_V011_BASE_SCHEMA_MISSING/);
  // A failed migration has an aborted transaction until explicit rollback.
  await negativeDB.exec("ROLLBACK;");
  const absent=await negativeDB.query(
    "SELECT to_regclass('public.dimpro_personal_drive_multipart_sessions') as table_name",
  );
  assert.equal(absent.rows[0].table_name,null);
  console.log("DIMPRO Drive V0.9.60 isolated missing-base rollback gate PASS");
} finally {
  await negativeDB.close();
}
