import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * Explicit standalone DEV smoke probe. No customer data, network request, DB
 * writes, S3 writes, or filesystem changes. Feeds deterministic benign bytes
 * to the already running local ClamAV Unix socket.
 */
if (process.env.DIMPRO_PRODUCTION_ACCESS !== "DENY"
    || process.env.DIMPRO_CLAMD_PROBE_DEV !== "true") {
  throw new Error("PERSONAL_CLAMD_TEST_DEV_ONLY");
}
const { getClamdHealth, scanAsyncIterableWithClamd } = await import(pathToFileURL(
  resolve("app/lib/drop/worker/clamdInstream.ts"),
).href);
const MiB=1024**2;
const config={
  enabled:true,scannerMode:"clamd-instream",
  clamdSocket:"/var/run/clamav/clamd.ctl",
  scanTimeoutMs:180_000,maxScanBytes:100*MiB,
  workerId:"drive-dev-v0961-readonly-probe",
  secret:"not-a-secret-test-only", claimLimit:1, leaseSeconds:1200,
  retrySeconds:300, signedDownloadTtlSeconds:180,reportDeletionGateEnabled:true,
};
const health=await getClamdHealth(config);
assert.equal(health.ping,"PONG");
console.log("CLAMD_HEALTH_PASS",health.version.engineVersion,health.version.signatureVersion);

const chunk=Buffer.alloc(MiB,0x41);
const sizes=[1,17,100];
for(const sizeMiB of sizes) {
  const hash=createHash("sha256");
  const gen=async function* () {
    for(let i=0;i<sizeMiB;i++) {
      hash.update(chunk);
      yield chunk;
    }
  };
  const got=await scanAsyncIterableWithClamd(gen(),sizeMiB*MiB,config);
  assert.equal(got.status,"clean",`unexpected scanner status for ${sizeMiB} MiB`);
  assert.equal(got.bytesScanned,sizeMiB*MiB);
  assert.equal(got.sha256,hash.digest("hex"));
  console.log("CLAMD_STREAM_CLEAN_SHA256_PASS",sizeMiB,"MiB");
}
// Official harmless antivirus test signature is assembled at runtime and
// streamed directly; no sample file or customer content is written to disk.
const harmlessSignature = [
  "X5O!P%@AP", String.raw`[4\PZX54(P^)7CC)7}`,
  "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
].join("");
const probe = Buffer.from(harmlessSignature,"ascii");
const flagged = await scanAsyncIterableWithClamd((async function*(){yield probe;})(),probe.length,config);
assert.equal(flagged.status,"infected","standard harmless AV test marker must be rejected");
assert.equal(flagged.bytesScanned,probe.length);
console.log("CLAMD_STANDARD_AV_TEST_REJECTION_PASS");
console.log("DIMPRO DRIVE V0.9.61 REAL CLAMD CLEAN AND REJECTION PASS");
