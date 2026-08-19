import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const worker=fs.readFileSync("scripts/run-commerce-reservation-expiry-worker.mjs","utf8");
const readiness=fs.readFileSync("scripts/commerce-reservation-expiry-worker-readiness.mjs","utf8");
const service=fs.readFileSync("ops/systemd/dimpro-commerce-reservation-expiry-worker.service","utf8");
const timer=fs.readFileSync("ops/systemd/dimpro-commerce-reservation-expiry-worker.timer","utf8");
const disabled=spawnSync(process.execPath,["scripts/run-commerce-reservation-expiry-worker.mjs"],{
  encoding:"utf8",
  env:{...process.env,DIMPRO_COMMERCE_EXPIRY_WORKER_ENABLED:"false",NEXT_PUBLIC_SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:""},
});
let disabledPayload={};try{disabledPayload=JSON.parse((disabled.stderr||disabled.stdout||"").trim());}catch{}
const checks=[
 ["01 worker is disabled by default",worker.includes('env("DIMPRO_COMMERCE_EXPIRY_WORKER_ENABLED","false")')],
 ["02 explicit true flag is required",worker.includes('toLowerCase()==="true"')&&worker.includes("COMMERCE_EXPIRY_WORKER_DISABLED")],
 ["03 disabled worker exits before database access",disabled.status===2&&disabledPayload.code==="COMMERCE_EXPIRY_WORKER_DISABLED"],
 ["04 service-role configuration is required",worker.includes("SUPABASE_SERVICE_ROLE_KEY")&&worker.includes("serviceKey.length<32")],
 ["05 worker refuses schema older than 0.1.10 / 11",worker.includes('semverAtLeast(meta.data.schema_version,"0.1.10")')&&worker.includes("migration_count")&&worker.includes("<11")],
 ["06 only active organizations are scanned",worker.includes('from("dimpro_organizations")')&&worker.includes('.eq("status","active")')],
 ["07 organization scan is bounded",worker.includes("DIMPRO_COMMERCE_EXPIRY_WORKER_ORG_LIMIT")&&worker.includes("1,1000")],
 ["08 reservation batch is bounded to 100 per organization",worker.includes("DIMPRO_COMMERCE_EXPIRY_WORKER_LIMIT")&&worker.includes("1,100")],
 ["09 optional organization filter exists for controlled runs",worker.includes("DIMPRO_COMMERCE_EXPIRY_WORKER_ORGANIZATION_ID")&&worker.includes('.eq("id",organizationFilter)')],
 ["10 organizations are processed sequentially",worker.includes("for(const organization of organizations.data)")],
 ["11 worker calls the service-only expiry RPC",worker.includes('admin.rpc("commerce_inventory_expire_due_reservations"')],
 ["12 RPC always receives explicit tenant id",worker.includes("p_organization_id:organizationId")],
 ["13 RPC receives bounded per-organization limit",worker.includes("p_limit:perOrganizationLimit")],
 ["14 worker records explicit cleanup timestamp",worker.includes("p_now:new Date().toISOString()")],
 ["15 one organization failure does not hide other results",worker.includes("failureCount++")&&worker.includes("results.push({organizationId,ok:false")&&worker.includes("continue;")],
 ["16 partial failure exits non-zero",worker.includes("if(failureCount>0)process.exit(1)")],
 ["17 worker output explicitly declares secretsExposed false",worker.includes("secretsExposed:false")&&!worker.includes("console.log(serviceKey")&&!worker.includes("serviceKey:serviceKey")],
 ["18 readiness never prints the service key",readiness.includes("serviceRoleConfigured:serviceKey.length>=32")&&!readiness.includes("console.log(serviceKey")&&!readiness.includes("serviceKey:serviceKey")],
 ["19 readiness checks live Commerce schema",readiness.includes('from("commerce_schema_meta")')&&readiness.includes('schemaVersion==="0.1.10"')],
 ["20 readiness checks service and timer templates",readiness.includes("serviceTemplatePresent")&&readiness.includes("timerTemplatePresent")],
 ["21 service uses a root path configurable by DIMPRO_APP_ROOT",service.includes("DIMPRO_APP_ROOT:-/root/dimprover")],
 ["22 service loads project env without exposing it",service.includes("scripts/load-next-env.cjs")&&service.includes("UMask=0077")],
 ["23 service applies process hardening",service.includes("NoNewPrivileges=true")&&service.includes("ProtectKernelTunables=true")&&service.includes("ProtectControlGroups=true")],
 ["24 service is oneshot and time bounded",service.includes("Type=oneshot")&&service.includes("TimeoutStartSec=300")],
 ["25 timer runs every two minutes",timer.includes("OnUnitActiveSec=2min")],
 ["26 timer has boot delay and jitter",timer.includes("OnBootSec=3min")&&timer.includes("RandomizedDelaySec=15")],
 ["27 timer is persistent",timer.includes("Persistent=true")],
 ["28 timer points to the exact Commerce worker service",timer.includes("Unit=dimpro-commerce-reservation-expiry-worker.service")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
