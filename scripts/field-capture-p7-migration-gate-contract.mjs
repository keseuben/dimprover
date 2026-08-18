#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20260818074500_field_capture_p7_server_session_v010.sql","utf8");
const gate=readFileSync("scripts/field-capture-p7-migration-gate.mjs","utf8");
let pass=0;
function check(name,fn){try{fn();pass++;console.log(`PASS ${pass}: ${name}`)}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1}}

const tables=["field_capture_sessions","field_capture_items","field_capture_asset_refs","field_capture_locations","field_capture_orientations","field_capture_voice_notes","field_capture_destinations","field_capture_events","field_capture_sync_queue"];
check("nine P7 domain tables",()=>tables.forEach(t=>assert.ok(migration.includes(`public.${t}`))));
check("schema marker",()=>assert.ok(migration.includes("field_capture_schema_meta")&&migration.includes("field-capture-p7-v010-20260818")));
check("project and Drive folder IDs use text",()=>{assert.match(migration,/project_id text null references public\.project_core_projects/);assert.match(migration,/folder_id text null/);});
check("idempotent client identity",()=>{assert.ok(migration.includes("unique(user_id, client_session_id)"));assert.ok(migration.includes("unique(session_id, client_item_id)"));assert.ok(migration.includes("unique(session_id, device_local_id, operation)"));});
check("structured sensitive records",()=>["latitude","heading_degrees","transcript_raw","payload_meta"].forEach(x=>assert.ok(migration.includes(x))));
check("server-only RLS and grants",()=>{tables.forEach(t=>{assert.ok(migration.includes(`alter table public.${t} enable row level security`));assert.ok(migration.includes(`revoke all on public.${t} from anon, authenticated`));assert.ok(migration.includes(`grant select, insert, update, delete on public.${t} to service_role`));});});
check("no browser direct policy",()=>{assert.ok(!/create policy/i.test(migration));assert.ok(!/grant .* to anon/i.test(migration));assert.ok(!/grant .* to authenticated/i.test(migration));});
check("fixed DEV database target",()=>{assert.ok(gate.includes("pbgyuznivqvestuksvif"));assert.ok(gate.includes("aws-0-eu-central-1.pooler.supabase.com"));assert.ok(!gate.includes("hlgntizemijaemphleiw"));});
check("root-only pgpass without password logging",()=>{assert.ok(gate.includes("/root/.pgpass"));assert.ok(gate.includes("0o600"));assert.ok(!gate.includes("PGPASSWORD"));assert.ok(!/console\.(log|error)\([^)]*password/i.test(gate));});
check("backup before apply",()=>{assert.ok(gate.indexOf('pg_dump')<gate.indexOf('const a=run("psql"'));assert.ok(gate.includes("pg_restore"));assert.ok(gate.includes("backup.sha256"));});
check("transaction rollback test",()=>{assert.ok(gate.includes('mode==="rollback-test"'));assert.ok(gate.includes("begin;"));assert.ok(gate.includes("rollback;"));});
check("explicit DEV approval",()=>{assert.ok(gate.includes("DEV_ONLY_FIELD_CAPTURE_P7_APPLY_APPROVED"));assert.ok(gate.includes("FIELD_CAPTURE_P7_MIGRATION_APPROVED"));});
check("security verified after apply",()=>{assert.ok(gate.includes("assertSecurity(s)"));assert.ok(gate.includes("FIELD_CAPTURE_P7_SECURITY_NOT_READY"));});

if(process.exitCode) process.exit(process.exitCode);
console.log(`FIELD_CAPTURE_P7_MIGRATION_CONTRACT ${pass}/${13} PASS`);
