#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration=readFileSync("supabase/migrations/20260818183500_dimpro_content_core_user_drive_v010.sql","utf8");
const gate=readFileSync("scripts/content-core-p8-migration-gate.mjs","utf8");
let pass=0;
function check(name,fn){try{fn();pass++;console.log(`PASS ${pass}: ${name}`)}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1}}
check("three Content Core tables",()=>["dimpro_content_schema_meta","dimpro_content_objects","dimpro_content_refs"].forEach(t=>assert.ok(migration.includes(`public.${t}`))));
check("content object hash and storage uniqueness",()=>{assert.match(migration,/unique \(sha256, size_bytes\)/);assert.match(migration,/unique \(storage_provider, storage_bucket, storage_key\)/)});
check("USER and future PROJECT ownership types",()=>{assert.match(migration,/owner_user_id uuid null references public\.dimpro_users/);assert.match(migration,/owner_project_id text null references public\.project_core_projects/);assert.match(migration,/owner_type in \('USER','PROJECT'\)/)});
check("ownership XOR",()=>{assert.match(migration,/owner_type = 'USER'.*owner_user_id is not null.*owner_project_id is null/s);assert.match(migration,/owner_type = 'PROJECT'.*owner_user_id is null.*owner_project_id is not null/s)});
check("independent retention explicit",()=>{assert.match(migration,/retained_independently boolean not null default true/);assert.match(migration,/must not remove this ownership reference/i)});
check("personal Drive root until folder core",()=>{assert.match(migration,/folder_id text null/);assert.match(migration,/personal Drive root/i)});
check("server-only RLS grants",()=>["dimpro_content_schema_meta","dimpro_content_objects","dimpro_content_refs"].forEach(t=>{assert.ok(migration.includes(`alter table public.${t} enable row level security`));assert.ok(migration.includes(`revoke all on table public.${t} from anon`));assert.ok(migration.includes(`revoke all on table public.${t} from authenticated`));assert.ok(migration.includes(`grant all on table public.${t} to service_role`))}));
check("no direct browser policy",()=>{assert.doesNotMatch(migration,/create policy/i);assert.doesNotMatch(migration,/grant .* to anon/i);assert.doesNotMatch(migration,/grant .* to authenticated/i)});
check("fixed DEV target",()=>{assert.ok(gate.includes("pbgyuznivqvestuksvif"));assert.ok(gate.includes("aws-0-eu-central-1.pooler.supabase.com"));assert.ok(!gate.includes("hlgntizemijaemphleiw"))});
check("root-only pgpass",()=>{assert.ok(gate.includes("/root/.pgpass"));assert.ok(gate.includes("0o600"));assert.ok(!gate.includes("PGPASSWORD"))});
check("backup before apply",()=>{assert.ok(gate.indexOf("pg_dump")<gate.indexOf('const a=run("psql"'));assert.ok(gate.includes("pg_restore"));assert.ok(gate.includes("backup.sha256"))});
check("real transactional rollback",()=>{assert.ok(gate.includes("rollbackBody()"));assert.ok(gate.includes("replace(/^\\s*begin;"));assert.ok(gate.includes("replace(/\\s*commit;"));assert.ok(gate.includes("const script=`begin;"));assert.ok(gate.includes("rollback;"))});
check("explicit DEV approval",()=>{assert.ok(gate.includes("DEV_ONLY_CONTENT_CORE_P8_APPLY_APPROVED"));assert.ok(gate.includes("CONTENT_CORE_P8_MIGRATION_APPROVED"))});
check("security verified after apply",()=>{assert.ok(gate.includes("assertSecurity(s)"));assert.ok(gate.includes("CONTENT_CORE_P8_SECURITY_NOT_READY"))});
if(process.exitCode)process.exit(process.exitCode);
console.log(`CONTENT_CORE_P8_MIGRATION_CONTRACT ${pass}/14 PASS`);
