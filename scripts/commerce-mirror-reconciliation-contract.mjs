import fs from "node:fs";
import assert from "node:assert/strict";
const migration=fs.readFileSync("supabase/migrations/20260819073000_dimpro_commerce_order_mirror_reconciliation_m1.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback/DIMPRO_COMMERCE_ORDER_MIRROR_RECONCILIATION_M1_ROLLBACK.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/order/mirrorReconciliation.ts","utf8");
const mirror=fs.readFileSync("app/lib/aruter/commerceMirror.ts","utf8");
const listRoute=fs.readFileSync("app/api/v1/commerce/mirror/reconciliation/route.ts","utf8");
const retryRoute=fs.readFileSync("app/api/v1/commerce/mirror/reconciliation/[attemptId]/retry/route.ts","utf8");
const perms=fs.readFileSync("app/lib/commerce/core/permissions.ts","utf8");
const types=fs.readFileSync("app/lib/commerce/core/types.ts","utf8");
const checks=[
 ["01 mirror attempt table is organization scoped",migration.includes("commerce_order_mirror_attempts")&&migration.includes("organization_id uuid not null")],
 ["02 legacy order id is unique per organization",migration.includes("unique (organization_id, legacy_order_id)")],
 ["03 mirror states are constrained",migration.includes("'PENDING','SUCCEEDED','FAILED'")],
 ["04 retry index exists",migration.includes("commerce_order_mirror_attempts_retry_idx")],
 ["05 authenticated direct table access is revoked",migration.includes("revoke all on table public.commerce_order_mirror_attempts from anon, authenticated, service_role")],
 ["06 service role receives explicit table access",migration.includes("grant select, insert, update on table public.commerce_order_mirror_attempts to service_role")],
 ["07 record RPC is service-only",migration.includes("grant execute on function public.commerce_order_mirror_record")&&migration.includes("to service_role")],
 ["08 record RPC uses advisory transaction lock",migration.includes("pg_advisory_xact_lock")&&migration.includes("legacy-order-mirror")],
 ["09 final mirror state writes audit event",migration.includes("LEGACY_ORDER_MIRROR_SUCCEEDED")&&migration.includes("LEGACY_ORDER_MIRROR_FAILED")&&migration.includes("commerce_audit_events")],
 ["10 final mirror state writes outbox event",migration.includes("commerce_outbox_events")&&migration.includes("legacy-order-mirror:")],
 ["11 failure has a retry timestamp",migration.includes("next_retry_at")&&migration.includes("interval '5 minutes'")],
 ["12 schema advances to 0.1.8 / 9",migration.includes("schema_version='0.1.8'")&&migration.includes("migration_count=9")],
 ["13 rollback returns to 0.1.7 / 8",rollback.includes("schema_version='0.1.7'")&&rollback.includes("migration_count=8")],
 ["14 reconciliation permission is explicit",types.includes('"commerce.order.reconcile"')&&perms.includes('"commerce.order.reconcile"')],
 ["15 list repository always scopes organization",repo.includes('.eq("organization_id", context.organizationId)')],
 ["16 retry lookup always scopes organization",repo.includes('.eq("organization_id", context.organizationId).eq("id", attemptId)')],
 ["17 reconciliation list requires dedicated permission",repo.includes('hasCommercePermission(context.permissions, "commerce.order.reconcile")')],
 ["18 mirror records PENDING before Commerce work",mirror.indexOf('state: "PENDING"')<mirror.indexOf("const resolved = await resolveLegacyAruterOrderForCommerce")],
 ["19 success persistence records mapped and unresolved counts",mirror.includes('state: "SUCCEEDED"')&&mirror.includes("mappedItemCount")&&mirror.includes("unresolvedItemCount")],
 ["20 failure persistence remains fail-open",mirror.includes('state: "FAILED"')&&mirror.includes("FAILED_FAIL_OPEN")],
 ["21 retry reuses stored legacy snapshot",mirror.includes("attempt.legacyOrderPayload")&&mirror.includes("getCommerceMirrorAttempt")],
 ["22 successful attempts cannot be retried",mirror.includes("COMMERCE_MIRROR_ALREADY_SUCCEEDED")],
 ["23 fresh pending attempts are protected from parallel retry",mirror.includes("COMMERCE_MIRROR_ATTEMPT_IN_PROGRESS")&&mirror.includes("120_000")],
 ["24 list API resolves authenticated Commerce context",listRoute.includes("resolveCommerceContext")&&listRoute.includes("listCommerceMirrorAttempts")],
 ["25 retry API resolves authenticated Commerce context",retryRoute.includes("resolveCommerceContext")&&retryRoute.includes("retryAruterOrderCommerceMirror")],
 ["26 retry API reports a failed retry without claiming success",retryRoute.includes("status: data.mirrored ? 200 : 409")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
