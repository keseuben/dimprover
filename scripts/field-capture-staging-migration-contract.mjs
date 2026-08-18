#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20260818221500_field_capture_staging_package_v010.sql","utf8");
const gate=readFileSync("scripts/field-capture-staging-migration-gate.mjs","utf8");
let pass=0;
function check(name,fn){try{fn();pass++;console.log(`PASS ${pass}: ${name}`)}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1}}

check("dedicated staging table",()=>assert.match(migration,/create table if not exists public\.field_capture_staging_packages/));
check("one package per capture session",()=>{assert.match(migration,/unique \(session_id\)/);assert.match(migration,/unique \(drop_package_id\)/)});
check("entitlement user project ownership",()=>{assert.match(migration,/user_id uuid not null references public\.dimpro_users/);assert.match(migration,/entitlement_id uuid not null references public\.dimpro_send_entitlements/);assert.match(migration,/project_id text null references public\.project_core_projects/)});
check("technical Drop package FK",()=>assert.match(migration,/drop_package_id uuid not null references public\.drop_packages/));
check("approved retention set only",()=>assert.match(migration,/retention_days in \(1,3,5,7,14,30\)/));
check("raw capabilities impossible to persist",()=>{assert.match(migration,/raw_capabilities_persisted boolean not null default false check \(raw_capabilities_persisted = false\)/);assert.doesNotMatch(migration,/upload_token|view_token|download_token|report_token|pin_raw/i)});
check("separate staging schema marker",()=>{assert.match(migration,/field-capture-staging/);assert.match(migration,/field-capture-staging-v010-20260818/)});
check("server-only RLS",()=>{assert.match(migration,/enable row level security/);assert.match(migration,/revoke all on table public\.field_capture_staging_packages from anon/);assert.match(migration,/revoke all on table public\.field_capture_staging_packages from authenticated/);assert.match(migration,/grant all on table public\.field_capture_staging_packages to service_role/)});
check("no browser policy",()=>{assert.doesNotMatch(migration,/create policy/i);assert.doesNotMatch(migration,/grant .* to anon/i);assert.doesNotMatch(migration,/grant .* to authenticated/i)});
check("fixed DEV target",()=>{assert.ok(gate.includes("pbgyuznivqvestuksvif"));assert.ok(gate.includes("aws-0-eu-central-1.pooler.supabase.com"));assert.ok(!gate.includes("hlgntizemijaemphleiw"))});
check("root-only pgpass",()=>{assert.ok(gate.includes("/root/.pgpass"));assert.ok(gate.includes("0o600"));assert.ok(!gate.includes("PGPASSWORD"))});
check("backup before apply",()=>{assert.ok(gate.indexOf("pg_dump")<gate.indexOf('const applied=run("psql"'));assert.ok(gate.includes("pg_restore"));assert.ok(gate.includes("backup.sha256"))});
check("real transactional rollback",()=>{assert.ok(gate.includes("rollbackBody()"));assert.ok(gate.includes("const script=`begin;"));assert.ok(gate.includes("rollback;"))});
check("explicit DEV approval",()=>{assert.ok(gate.includes("DEV_ONLY_FIELD_CAPTURE_STAGING_APPLY_APPROVED"));assert.ok(gate.includes("FIELD_CAPTURE_STAGING_MIGRATION_APPROVED"))});
check("RLS verified after apply",()=>{assert.ok(gate.includes("assertSecurity"));assert.ok(gate.includes("FIELD_CAPTURE_STAGING_SECURITY_NOT_READY"))});

if(process.exitCode)process.exit(process.exitCode);
console.log(`FIELD_CAPTURE_STAGING_MIGRATION_CONTRACT ${pass}/15 PASS`);
