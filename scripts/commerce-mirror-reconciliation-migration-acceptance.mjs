import fs from "node:fs";
import assert from "node:assert/strict";
const migration=fs.readFileSync("supabase/migrations/20260819073000_dimpro_commerce_order_mirror_reconciliation_m1.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback/DIMPRO_COMMERCE_ORDER_MIRROR_RECONCILIATION_M1_ROLLBACK.sql","utf8");
const checks=[
 ["01 migration creates reconciliation table",migration.includes("create table if not exists public.commerce_order_mirror_attempts")],
 ["02 migration enables RLS",migration.includes("alter table public.commerce_order_mirror_attempts enable row level security")],
 ["03 direct authenticated writes are not granted",!migration.includes("grant insert")||!migration.includes("to authenticated")],
 ["04 record function is security definer",migration.includes("commerce_order_mirror_record")&&migration.includes("security definer")],
 ["05 function validates organization",migration.includes("COMMERCE_ORGANIZATION_REQUIRED")],
 ["06 function validates legacy order id",migration.includes("COMMERCE_MIRROR_LEGACY_ORDER_ID_REQUIRED")],
 ["07 function validates state",migration.includes("COMMERCE_MIRROR_STATE_INVALID")],
 ["08 function checks Commerce order tenant scope",migration.includes("COMMERCE_MIRROR_ORDER_SCOPE_MISMATCH")],
 ["09 function serializes by legacy order",migration.includes("pg_advisory_xact_lock")],
 ["10 retry backoff timestamp is persisted",migration.includes("next_retry_at")&&migration.includes("interval '5 minutes'")],
 ["11 failure/success audit is persisted",migration.includes("LEGACY_ORDER_MIRROR_FAILED")&&migration.includes("LEGACY_ORDER_MIRROR_SUCCEEDED")],
 ["12 outbox idempotency is attempt/version based",migration.includes("v_attempt.attempt_count::text")&&migration.includes("on conflict (organization_id,idempotency_key) do nothing")],
 ["13 only service role can execute RPC",migration.includes("revoke all on function public.commerce_order_mirror_record")&&migration.includes("to service_role")],
 ["14 schema marker advances to 0.1.8",migration.includes("schema_version='0.1.8'")&&migration.includes("migration_count=9")],
 ["15 rollback drops RPC",rollback.includes("drop function if exists public.commerce_order_mirror_record")],
 ["16 rollback drops table",rollback.includes("drop table if exists public.commerce_order_mirror_attempts cascade")],
 ["17 rollback restores schema marker",rollback.includes("schema_version='0.1.7'")&&rollback.includes("migration_count=8")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
