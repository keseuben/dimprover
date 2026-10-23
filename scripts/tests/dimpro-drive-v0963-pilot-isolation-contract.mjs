import assert from "node:assert/strict";
import { assessPersonalPilotIsolation }
  from "../../app/lib/content-core/personalPilotIsolation.ts";

const env = Object.freeze({
  productionAccess:"DENY", authEnvironment:"DEV",
  personalUploadEnabled:"true", storageMode:"active",
  storageEndpoint:"https://s3.testing.invalid",
  storageBucket:"dimpro-drive-isolated-dev",storageRegion:"eu-test-1",
  storageAccessKeyPresent:true,storageSecretKeyPresent:true,
  databaseUrl:"https://dev-db.testing.invalid",
  databaseServiceKeyPresent:true,maxUploadMiB:100,
});
const evidence = Object.freeze({
  approvalId:"DEV-PILOT-ISOLATED-20261023",
  independentlyVerified:true,
  approvedDevStorageEndpoint:"https://s3.testing.invalid",
  approvedDevBucket:"dimpro-drive-isolated-dev",
  approvedDevDatabaseUrl:"https://dev-db.testing.invalid",
  productionStorageBucket:"dimpro-drive-prod",
  productionDatabaseUrl:"https://prod-db.testing.invalid",
  dedicatedSyntheticTestUser:true,
  approvedSyntheticObjectPrefix:"_dimpro_e2e/personal/synthetic-20261023/",
});
const result=assessPersonalPilotIsolation(env,evidence);
assert.deepEqual(result,{eligibleForIsolatedE2E:true,findings:[]});
const deny = (changedEnv,changedEvidence,expected) => {
  const got=assessPersonalPilotIsolation({...env,...changedEnv},
    changedEvidence===null?null:{...evidence,...changedEvidence});
  assert.equal(got.eligibleForIsolatedE2E,false,JSON.stringify({changedEnv,changedEvidence}));
  for (const code of expected) assert.ok(got.findings.includes(code),code);
};
deny({},null,["INDEPENDENT_EVIDENCE_MISSING"]);
deny({productionAccess:"ALLOW"},{},["PROD_ACCESS_NOT_DENIED"]);
deny({authEnvironment:"PROD"},{},["AUTH_NOT_DEV"]);
deny({personalUploadEnabled:"false"},{},["PERSONAL_UPLOAD_NOT_ENABLED"]);
deny({storageMode:"quarantine"},{},["S3_NOT_ACTIVE"]);
deny({storageEndpoint:"http://s3.testing.invalid"},{},["S3_CONNECTION_INCOMPLETE"]);
deny({storageAccessKeyPresent:false},{},["S3_CONNECTION_INCOMPLETE"]);
deny({storageSecretKeyPresent:false},{},["S3_CONNECTION_INCOMPLETE"]);
deny({storageBucket:""},{},["S3_CONNECTION_INCOMPLETE","STORAGE_NOT_ATTESTED"]);
deny({storageRegion:""},{},["S3_CONNECTION_INCOMPLETE"]);
deny({databaseUrl:"http://dev-db.testing.invalid"},{},["DB_CONNECTION_INCOMPLETE"]);
deny({databaseServiceKeyPresent:false},{},["DB_CONNECTION_INCOMPLETE"]);
deny({maxUploadMiB:16},{},["UPLOAD_CAP_UNSAFE"]);
deny({maxUploadMiB:5000},{},["UPLOAD_CAP_UNSAFE"]);
deny({},{independentlyVerified:false},["APPROVAL_NOT_VERIFIED"]);
deny({},{approvalId:"unapproved"},["APPROVAL_NOT_VERIFIED"]);
deny({},{productionStorageBucket:env.storageBucket},["PRODUCTION_STORAGE_NOT_SEPARATED"]);
deny({storageBucket:"dimpro-drive-prod"},{},["PRODUCTION_STORAGE_NOT_SEPARATED","STORAGE_NOT_ATTESTED"]);
deny({},{approvedDevBucket:"dimpro-drive-prod"},["PRODUCTION_STORAGE_NOT_SEPARATED","STORAGE_NOT_ATTESTED"]);
deny({},{productionDatabaseUrl:env.databaseUrl},["PRODUCTION_DATABASE_NOT_SEPARATED"]);
deny({databaseUrl:"https://prod-db.testing.invalid"},{},["PRODUCTION_DATABASE_NOT_SEPARATED"]);
deny({},{approvedDevDatabaseUrl:"https://prod-db.testing.invalid"},["PRODUCTION_DATABASE_NOT_SEPARATED","DATABASE_NOT_ATTESTED"]);
deny({storageEndpoint:"https://evil.example/"},{},["STORAGE_NOT_ATTESTED"]);
deny({databaseUrl:"https://wrong-db.testing.invalid"},{},["DATABASE_NOT_ATTESTED"]);
deny({},{dedicatedSyntheticTestUser:false},["SYNTHETIC_IDENTITY_MISSING"]);
deny({},{approvedSyntheticObjectPrefix:"users/real-user/objects/"},["SYNTHETIC_PREFIX_INVALID"]);
deny({storageEndpoint:"https://s3.testing.invalid/?secret=abc"},{},["S3_CONNECTION_INCOMPLETE"]);
console.log("DIMPRO Drive V0.9.63 independent DEV/PROD isolation gate – 28 positive/negative cases PASS");
