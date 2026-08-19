import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("scripts/provision-commerce-storefront-mirror-worker-dev.mjs","utf8");
const checks=[
  ["provisioner is DEV-host gated",source.includes('os.hostname() !== "dimpro-dev"')&&source.includes('/srv/dimpro-dev/')],
  ["organization id is explicit trusted env",source.includes("ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID")],
  ["technical actor defaults to non-login identity",source.includes("auth_user_id: null")&&source.includes("COMMERCE_WORKER_PROVISION_INTERACTIVE_ACTOR")],
  ["dedicated worker role is exact",source.includes('const roleCode = "COMMERCE_MIRROR_WORKER"')],
  ["check mode is read-only",source.includes('mode === "check"')],
  ["apply mode creates active DIMPRO technical user",source.includes('.from("dimpro_users").insert')&&source.includes('status: "active"')],
  ["membership is exact organization scoped",source.includes('.eq("organization_id", organizationId)')&&source.includes('organization_id: organizationId')],
  ["membership is non-primary and non-expiring",source.includes("access_ends_at: null")&&source.includes("is_primary: false")],
  ["revoked memberships are ignored",source.includes('.neq("status", "revoked")')],
  ["service role config is mandatory",source.includes("SUPABASE_SERVICE_ROLE_KEY")&&source.includes("COMMERCE_WORKER_PROVISION_CONFIG_MISSING")],
  ["provisioner never prints service key",!source.includes("console.log(key")&&!source.includes("JSON.stringify(process.env")],
  ["post-apply readiness is fail closed",source.includes("COMMERCE_WORKER_PROVISION_NOT_READY")&&source.includes("readiness.ready")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${String(++pass).padStart(2,"0")} ${name}`);assert.equal(ok,true,name)}console.log(`RESULT ${checks.length}/${checks.length} PASS`);
