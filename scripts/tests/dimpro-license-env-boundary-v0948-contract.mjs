import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  evaluateLicenseWriteState,DIMPRO_LICENSE_PROD_WRITES_RELEASED,
} from "../../app/lib/license/licenseEnvironmentPolicy.ts";
assert.equal(DIMPRO_LICENSE_PROD_WRITES_RELEASED,false,"PROD cannot be enabled via runtime env only");
const deny=[
  [{}, "LICENSE_ENV_MISSING_OR_INVALID"],
  [{runtimeEnv:"prod",dataEnv:"PROD"}, "LICENSE_ENV_MISSING_OR_INVALID"],
  [{runtimeEnv:"DEV",dataEnv:"PROD"}, "LICENSE_ENV_MISMATCH"],
  [{runtimeEnv:"PROD",dataEnv:"DEV"}, "LICENSE_ENV_MISMATCH"],
  [{runtimeEnv:"DEV",dataEnv:"DEV"}, "LICENSE_DEV_DATA_BOUNDARY_NOT_VERIFIED"],
  [{runtimeEnv:"DEV",dataEnv:"DEV",dataBoundaryAttestation:"VERIFIED_DEV_ISOLATED"}, "LICENSE_DEV_TEST_WRITES_NOT_RELEASED"],
  [{runtimeEnv:"DEV",dataEnv:"DEV",dataBoundaryAttestation:"VERIFIED_PROD_CANONICAL",
    devTestWriteRelease:"DEV_TEST_ONLY_APPROVED"}, "LICENSE_DEV_DATA_BOUNDARY_NOT_VERIFIED"],
  [{runtimeEnv:"PROD",dataEnv:"PROD",dataBoundaryAttestation:"VERIFIED_DEV_ISOLATED",
    devTestWriteRelease:"DEV_TEST_ONLY_APPROVED"}, "LICENSE_PROD_WRITES_NOT_RELEASED"],
];
for(const [input,expected] of deny){
  const state=evaluateLicenseWriteState(input);
  assert.equal(state.writeAllowed,false,JSON.stringify(input));
  assert.equal(state.reason,expected);
  assert.equal(state.mode,"LOCKED");
}
const dev=evaluateLicenseWriteState({
  runtimeEnv:"DEV",dataEnv:"DEV",dataBoundaryAttestation:"VERIFIED_DEV_ISOLATED",
  devTestWriteRelease:"DEV_TEST_ONLY_APPROVED",
});
assert.equal(dev.writeAllowed,true,"only explicitly approved DEV test path");
assert.equal(dev.mode,"DEV_TEST");
const boundary=readFileSync("app/lib/license/licenseEnvironmentPolicy.ts","utf8");
assert.ok(boundary.includes("process.env.DIMPRO_LICENSE_DATA_ENV"));
assert.ok(boundary.includes("process.env.DIMPRO_LICENSE_RUNTIME_ENV"));
assert.ok(boundary.includes("process.env.DIMPRO_LICENSE_DATA_BOUNDARY_ATTESTATION"));
assert.ok(!boundary.includes("process.env.NODE_ENV"),"NODE_ENV cannot distinguish dev/prod releases");
assert.ok(!boundary.includes('request.headers.get("host")'),"Host header not authorization");
assert.ok(boundary.includes("status:423"));
assert.ok(boundary.includes('cache-control":"private, no-store'));
const guarded=[
 "app/api/dimpro-identity/admin/licenses/route.ts",
 "app/api/dimpro-identity/admin/send-entitlements/route.ts",
 "app/api/dimpro-identity/admin/organization-invitations/route.ts",
 "app/api/dimpro-identity/admin/membership-ai-policy/route.ts",
 "app/api/dimpro-identity/admin/project-product-licenses/route.ts",
 "app/api/license/admin-billing/route.ts",
 "app/api/license/admin-contacts/route.ts",
 "app/api/license/admin-devices/route.ts",
 "app/api/license/expiry-reminders/route.ts",
 "app/api/license/admin/route.ts",
 "app/api/license/admin-mail/route.ts",
 "app/api/license/mail-settings/route.ts",
];
for(const name of guarded){
  const source=readFileSync(name,"utf8");
  assert.ok(source.includes("denyUnauthorizedLicenseMutation"),name+" has server guard");
  const starting=source.indexOf("export async function POST")>=0?
    source.indexOf("export async function POST"):source.indexOf("export async function PATCH");
  const authorization=source.indexOf("isLicenseAdminAuthorized",starting);
  const denied=source.indexOf("denyUnauthorizedLicenseMutation()",starting);
  assert.ok(denied>authorization,name+" must authenticate first");
  assert.ok(denied<source.length,name+" mutation protected");
}
for(const name of guarded){
  const source=readFileSync(name,"utf8");
  const sections=[...source.matchAll(/export async function (POST|PATCH|PUT|DELETE)\(/g)];
  const count=(source.match(/const mutationDenied=denyUnauthorizedLicenseMutation\(\);/g)||[]).length;
  assert.equal(count,sections.length,name+" every writing method guarded");
}
const environmentVariables=[
  "DIMPRO_LICENSE_RUNTIME_ENV","DIMPRO_LICENSE_DATA_ENV",
  "DIMPRO_LICENSE_DATA_BOUNDARY_ATTESTATION",
  "DIMPRO_LICENSE_DEV_TEST_WRITES_RELEASED",
];
const originalEnv=Object.fromEntries(environmentVariables.map(name=>[name,process.env[name]]));
try {
  const policy=await import("../../app/lib/license/licenseEnvironmentPolicy.ts");
  for(const key of environmentVariables)delete process.env[key];
  const response=policy.denyUnauthorizedLicenseMutation();
  assert.ok(response instanceof Response,"default must return a denial response");
  assert.equal(response.status,423,"locked status");
  assert.equal(response.headers.get("cache-control"),"private, no-store");
  const body=await response.json();
  assert.equal(body.code,"LICENSE_ENV_MISSING_OR_INVALID");
  assert.ok(!JSON.stringify(body).includes("DIMPRO_LICENSE_DEV_TEST_WRITES_RELEASED"),"do not leak server configuration");
  process.env.DIMPRO_LICENSE_RUNTIME_ENV="DEV";
  process.env.DIMPRO_LICENSE_DATA_ENV="DEV";
  process.env.DIMPRO_LICENSE_DATA_BOUNDARY_ATTESTATION="VERIFIED_DEV_ISOLATED";
  process.env.DIMPRO_LICENSE_DEV_TEST_WRITES_RELEASED="DEV_TEST_ONLY_APPROVED";
  assert.equal(policy.denyUnauthorizedLicenseMutation(),null,"explicit isolated DEV test allowed");
  process.env.DIMPRO_LICENSE_RUNTIME_ENV="PROD";
  process.env.DIMPRO_LICENSE_DATA_ENV="PROD";
  assert.equal(policy.denyUnauthorizedLicenseMutation()?.status,423,"PROD remains blocked even with DEV flags");
}finally{
  for(const [name,value] of Object.entries(originalEnv)){
    if(value===undefined)delete process.env[name];
    else process.env[name]=value;
  }
}
const licenseRoute=readFileSync(guarded[0],"utf8");
assert.ok(licenseRoute.includes("licenseEnvironment: publicLicenseEnvironmentStatus()"));
const ui=readFileSync("app/admin/licenckozpont/page.tsx","utf8");
assert.ok(ui.includes('data-testid="license-environment-status"'));
assert.ok(ui.includes("disabled={!licenseEnvironment?.writesAllowed}"));
assert.ok(ui.includes("KÖRNYEZET NINCS IGAZOLVA"));
assert.ok(!ui.includes("NEXT_PUBLIC_LICENSE_PROD_WRITES_RELEASED"),"browser cannot unlock server");
console.log("DIMPRO V0.9.48 DEV PROD LICENSE MUTATION BOUNDARY CONTRACT PASS");
