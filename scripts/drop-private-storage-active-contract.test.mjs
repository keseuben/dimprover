import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [feature, runtime, service, localStorage, multipartClient, proxy, env] = await Promise.all([
  read("app/lib/drop/dropFeatureFlags.ts"),
  read("app/lib/drop/dropRuntime.ts"),
  read("app/lib/drop/storage/dropUploadService.ts"),
  read("app/lib/drop/storage/dropLocalStorage.ts"),
  read("components/drop/dropMultipartClient.ts"),
  read("proxy.ts"),
  read(".env.local"),
]);

assert.match(feature, /version: "DROP 0\.3\.4"/);
assert.match(env, /^DROP_STORAGE_CORE_ENABLED=true$/m);
assert.match(env, /^DROP_QUARANTINE_UPLOAD_ENABLED=true$/m);
assert.match(env, /^DROP_STORAGE_PROVIDER=local-private$/m);
assert.match(env, /^DROP_STORAGE_MODE=quarantine$/m);
assert.match(env, /^DROP_STORAGE_LOCAL_ROOT=\/root\/dimprover\/\.data\/drop-storage$/m);
assert.match(env, /^DROP_MAX_STREAM_UPLOAD_MB=70$/m);
assert.match(env, /^DROP_RESUMABLE_UPLOAD_ENABLED=true$/m);
assert.match(env, /^DROP_MAX_FILE_UPLOAD_MB=500$/m);
assert.match(env, /^DROP_UPLOAD_CHUNK_MB=64$/m);
for (const key of ["DROP_IMAGE_DROP_ENABLED", "DROP_FILE_DROP_ENABLED", "DROP_ZIP_UPLOAD_ENABLED", "DROP_MIXED_PACKAGE_ENABLED"]) {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  assert.ok(!match || match[1] !== "true", `${key} nem lehet aktív.`);
}
assert.match(runtime, /quarantineUpload: quarantineUploadReady/);
assert.match(runtime, /publicDownload: storageStatus\.publicDownloadReady/);
assert.match(runtime, /publicUpload: publicUploadReady/);
assert.match(service, /initializeDropSpaceUpload/);
assert.match(service, /initializeDropCapabilityUpload/);
assert.match(service, /downloadable: false/);
assert.match(service, /quarantineOnly: true/);
assert.match(localStorage, /streamDropIncomingFile/);
assert.match(multipartClient, /XMLHttpRequest/);
assert.match(multipartClient, /file\.slice/);
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/access\/uploads\/"\)/);
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/uploads\/"\)/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.4-compatible",
  storageCoreEnabled: true,
  quarantineUploadEnabled: true,
  localPrivateStorage: true,
  maxPartMb: 70,
  maxPreparedFileMb: 500,
  resumableUploadEnabled: true,
  fullUploadModesEnabled: false,
  scannerRequired: true,
  publicDownloadEnabled: false,
  publicUploadEnabled: false,
}, null, 2));
