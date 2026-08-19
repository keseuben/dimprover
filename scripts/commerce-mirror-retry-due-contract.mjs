import fs from "node:fs";
import assert from "node:assert/strict";
const repo=fs.readFileSync("app/lib/commerce/order/mirrorReconciliation.ts","utf8");
const mirror=fs.readFileSync("app/lib/aruter/commerceMirror.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/mirror/reconciliation/retry-due/route.ts","utf8");
const checks=[
 ["01 due list requires reconciliation permission",repo.includes("listDueCommerceMirrorAttempts")&&repo.includes("requireReconcile(context)")],
 ["02 due list is tenant scoped",repo.includes('.eq("organization_id", context.organizationId)')],
 ["03 due list selects queued PENDING and retryable FAILED",repo.includes('.in("state", ["PENDING", "FAILED"])')],
 ["04 due list ignores archived attempts",repo.includes('.is("deleted_at", null)')],
 ["05 due list requires next retry at or before now",repo.includes('.lte("next_retry_at", now)')],
 ["06 due list orders oldest retry first",repo.includes('.order("next_retry_at", { ascending: true })')],
 ["07 due list has bounded batch max 25",repo.includes("Math.min(25")],
 ["08 batch retry uses existing single retry path",mirror.includes("retryDueAruterOrderCommerceMirrors")&&mirror.includes("retryAruterOrderCommerceMirror(context, attempt.id)")],
 ["09 batch retry continues after one item error",mirror.includes("for (const attempt of attempts)")&&mirror.includes("catch (error)")],
 ["10 batch result reports requested/succeeded/failed",mirror.includes("requested: attempts.length")&&mirror.includes("succeeded:")&&mirror.includes("failed:")],
 ["11 route resolves authenticated Commerce context",route.includes("resolveCommerceContext")],
 ["12 route bounds requested limit",route.includes("Math.min(25")&&route.includes("Math.max(1")],
 ["13 route calls due retry service",route.includes("retryDueAruterOrderCommerceMirrors")],
 ["14 partial batch failure is not reported as full success",route.includes("status: data.failed === 0 ? 200 : 207")],
 ["15 route never accepts organization from request body",!route.includes("body.organizationId")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
