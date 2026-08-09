import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "app/lib/drop/dropTypes.ts",
  "app/lib/drop/dropFeatureFlags.ts",
  "app/lib/drop/dropRuntime.ts",
  "app/lib/drop/storage/dropStorageConfig.ts",
  "app/lib/drop/storage/dropLocalStorage.ts",
  "app/lib/drop/storage/dropFileSecurity.ts",
  "app/lib/drop/storage/dropUploadToken.ts",
  "app/lib/drop/storage/dropStorageRepository.ts",
  "app/lib/drop/storage/dropUploadService.ts",
  "app/api/drop/spaces/packages/[packageId]/files/route.ts",
  "app/api/drop/access/uploads/init/route.ts",
  "app/api/drop/spaces/packages/[packageId]/uploads/init/route.ts",
  "app/api/drop/uploads/[uploadId]/content/route.ts",
  "app/api/drop/uploads/[uploadId]/complete/route.ts",
  "app/api/drop/uploads/[uploadId]/route.ts",
  "components/drop/DropPackageQuarantineUpload.tsx",
  "components/drop/DropCapabilityQuarantineUpload.tsx",
  "components/drop/DropValidatedAccessPage.tsx",
  "components/drop/DropSpacePackagePanel.tsx",
  "proxy.ts",
  ".env.local",
];
const files = Object.fromEntries(await Promise.all(paths.map(async (file) => [file, await readFile(file, "utf8")])));

const types = files["app/lib/drop/dropTypes.ts"];
const flags = files["app/lib/drop/dropFeatureFlags.ts"];
const runtime = files["app/lib/drop/dropRuntime.ts"];
const config = files["app/lib/drop/storage/dropStorageConfig.ts"];
const local = files["app/lib/drop/storage/dropLocalStorage.ts"];
const security = files["app/lib/drop/storage/dropFileSecurity.ts"];
const token = files["app/lib/drop/storage/dropUploadToken.ts"];
const repository = files["app/lib/drop/storage/dropStorageRepository.ts"];
const service = files["app/lib/drop/storage/dropUploadService.ts"];
const contentRoute = files["app/api/drop/uploads/[uploadId]/content/route.ts"];
const completeRoute = files["app/api/drop/uploads/[uploadId]/complete/route.ts"];
const capabilityInitRoute = files["app/api/drop/access/uploads/init/route.ts"];
const uploadPanel = files["components/drop/DropPackageQuarantineUpload.tsx"];
const capabilityPanel = files["components/drop/DropCapabilityQuarantineUpload.tsx"];
const validatedAccessPage = files["components/drop/DropValidatedAccessPage.tsx"];
const env = files[".env.local"];
const proxy = files["proxy.ts"];

assert.match(types, /storageCoreEnabled: boolean/);
assert.match(types, /quarantineUploadEnabled: boolean/);
assert.match(flags, /DROP_STORAGE_CORE_ENABLED/);
assert.match(flags, /DROP_QUARANTINE_UPLOAD_ENABLED/);
assert.match(env, /^DROP_STORAGE_CORE_ENABLED=false$/m);
assert.match(env, /^DROP_QUARANTINE_UPLOAD_ENABLED=false$/m);
assert.match(env, /^DROP_STORAGE_PROVIDER=local-private$/m);
assert.match(env, /^DROP_STORAGE_MODE=quarantine$/m);
assert.match(env, /^DROP_STORAGE_LOCAL_ROOT=\/var\/lib\/dimpro\/drop$/m);
assert.match(runtime, /storageSchema/);
assert.match(runtime, /quarantineUpload/);
assert.match(runtime, /virusScanner/);
assert.match(runtime, /quarantinedFilesDownloadable: false/);
assert.match(config, /local-private/);
assert.match(config, /s3-compatible/);
assert.match(config, /mode: 0o700/);
assert.match(config, /publicDownloadReady: config\.mode === "active" && config\.scannerAvailable/);
assert.match(local, /Readable\.fromWeb/);
assert.match(local, /pipeline\(source, counter, destination\)/);
assert.match(local, /createHash\("sha256"\)/);
assert.match(local, /flags: "wx", mode: 0o600/);
assert.match(local, /DROP_STORAGE_PATH_ESCAPE/);
assert.match(security, /blockedExtensions/);
assert.match(security, /unzip/);
assert.match(security, /zipinfo/);
assert.match(security, /DROP_ZIP_PATH_TRAVERSAL/);
assert.match(security, /DROP_ZIP_COMPRESSION_RATIO/);
assert.match(token, /dup_s_1/);
assert.match(token, /timingSafeEqual/);
assert.match(token, /DROP_UPLOAD_TOKEN_EXPIRED/);
assert.match(repository, /drop_initialize_upload_atomic/);
assert.match(repository, /drop_mark_upload_received/);
assert.match(repository, /drop_finalize_quarantine_upload/);
assert.match(repository, /drop_abort_upload_atomic/);
assert.match(service, /assertDropSpacePackageUploadAccess/);
assert.match(service, /streamDropIncomingFile/);
assert.match(service, /inspectDropIncomingFile/);
assert.match(service, /moveDropFileToQuarantine/);
assert.match(service, /sendDropUploadCompleteNotifications/);
assert.match(service, /downloadable: false/);
assert.match(capabilityInitRoute, /validateDropAccessToken/);
assert.match(capabilityInitRoute, /expectedPurpose: "upload"/);
assert.match(capabilityInitRoute, /initializeDropCapabilityUpload/);
assert.match(contentRoute, /request\.body/);
assert.match(contentRoute, /readDropUploadBearerToken/);
assert.match(completeRoute, /completeDropUpload/);
assert.match(uploadPanel, /XMLHttpRequest/);
assert.match(uploadPanel, /xhr\.upload\.onprogress/);
assert.match(uploadPanel, /multiple/);
assert.match(uploadPanel, /Karanténban/);
assert.match(capabilityPanel, /Authorization: `Bearer \${rawToken}`/);
assert.match(capabilityPanel, /XMLHttpRequest/);
assert.match(capabilityPanel, /xhr\.upload\.onprogress/);
assert.match(validatedAccessPage, /DropCapabilityQuarantineUpload/);
assert.match(validatedAccessPage, /runtimeHealth\.readiness\.quarantineUpload/);
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/access\/uploads\/"\)/);
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/uploads\/"\)/);
assert.doesNotMatch(service, /public\/uploads|public\/drop/i);
assert.doesNotMatch(local, /process\.cwd\(\).*public/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.3-staged",
  featureFlagsClosed: true,
  localPrivateAdapter: true,
  s3AdapterPrepared: true,
  streamingUpload: true,
  sha256Required: true,
  mimeDetectionRequired: true,
  zipSafetyRequired: true,
  shortLivedUploadToken: true,
  atomicQuotaRepository: true,
  multiFileProgressUi: true,
  capabilityUploadPrepared: true,
  quarantineOnly: true,
  publicDownloadEnabled: false,
  virusScannerAvailable: false,
  databaseWritesPerformed: false,
}, null, 2));
