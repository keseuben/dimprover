import fs from "node:fs";
import assert from "node:assert/strict";
const source=fs.readFileSync("scripts/commerce-legacy-mirror-http-e2e.mjs","utf8");
const checks=[
 ["01 E2E requires explicit candidate base",source.includes('required("COMMERCE_MIRROR_E2E_BASE")')],
 ["02 E2E creates isolated auth user",source.includes("admin.auth.admin.createUser")],
 ["03 E2E creates active DIMPRO identity",source.includes('from("dimpro_users").insert')&&source.includes('status:"active"')],
 ["04 E2E creates ADMIN organization membership",source.includes('from("dimpro_organization_memberships").insert')&&source.includes('role_code:"ADMIN"')],
 ["05 E2E builds SSR Supabase cookie",source.includes("createServerClient")&&source.includes("ssr.auth.setSession")],
 ["06 E2E validates Commerce context",source.includes('"/api/v1/commerce/context"')],
 ["07 E2E creates order through legacy HTTP API",source.includes('"/api/aruter/orders"')&&source.includes('method:"POST"')],
 ["08 E2E waits for Next after reconciliation",source.includes('waitFor("sent mirror"')&&source.includes('state==="SUCCEEDED"')],
 ["09 E2E verifies external order in cashier queue",source.includes("EXTERNAL_MARKETPLACE")&&source.includes("cashierQueue=true")],
 ["10 E2E drives legacy paid status",source.includes('body:{status:"paid"}')],
 ["11 E2E drives legacy issued status",source.includes('body:{status:"issued"}')],
 ["12 E2E verifies unresolved item is non-blocking",source.includes('inventoryStatus==="UNRESOLVED"')],
 ["13 E2E verifies terminal order leaves queue",source.includes("issued mirrored order leaves Commerce cashier queue")],
 ["14 E2E verifies reconciliation UI route",source.includes('"/aruter/admin/egyeztetes"')],
 ["15 E2E verifies legacy cashier route",source.includes('"/aruter/penztar"')],
 ["16 E2E archives Commerce QA fixtures",source.includes('from("commerce_order_mirror_attempts").update({archived_at:now})')&&source.includes('from("commerce_orders").update({archived_at:now})')],
 ["17 E2E deletes identity/auth fixtures",source.includes('from("dimpro_users").delete()')&&source.includes("admin.auth.admin.deleteUser")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
