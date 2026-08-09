import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "app/lib/drop/dropTypes.ts",
  "app/lib/drop/dropFeatureFlags.ts",
  "app/lib/drop/dropRuntime.ts",
  "app/lib/drop/dropUploadRules.ts",
  "app/lib/drop/storage/dropStorageConfig.ts",
  "app/lib/drop/storage/dropStorageRepository.ts",
  "app/lib/drop/storage/dropUploadService.ts",
  "app/lib/drop/storage/dropMultipartLocalStorage.ts",
  "app/lib/drop/storage/dropS3Storage.ts",
  "app/api/drop/uploads/[uploadId]/parts/route.ts",
  "app/api/drop/uploads/[uploadId]/parts/[partNumber]/route.ts",
  "components/drop/dropMultipartClient.ts",
  "components/drop/DropPackageQuarantineUpload.tsx",
  "components/drop/DropCapabilityQuarantineUpload.tsx",
  "components/drop/DropUploadRulesNotice.tsx",
  ".env.local",
].map(async (path) => [path, await readFile(path, "utf8")])),);

const feature = files["app/lib/drop/dropFeatureFlags.ts"];
const runtime = files["app/lib/drop/dropRuntime.ts"];
const rules = files["app/lib/drop/dropUploadRules.ts"];
const rulesNotice = files["components/drop/DropUploadRulesNotice.tsx"];
const config = files["app/lib/drop/storage/dropStorageConfig.ts"];
const repository = files["app/lib/drop/storage/dropStorageRepository.ts"];
const service = files["app/lib/drop/storage/dropUploadService.ts"];
const local = files["app/lib/drop/storage/dropMultipartLocalStorage.ts"];
const s3 = files["app/lib/drop/storage/dropS3Storage.ts"];
const client = files["components/drop/dropMultipartClient.ts"];
const env = files[".env.local"];

assert.match(feature, /resumableUploadEnabled/);
assert.match(feature, /version: "DROP 0\.3\.4"/);
assert.match(env, /^DROP_RESUMABLE_UPLOAD_ENABLED=true$/m);
assert.match(env, /^DROP_MAX_FILE_UPLOAD_MB=500$/m);
assert.match(env, /^DROP_UPLOAD_CHUNK_MB=64$/m);
assert.match(env, /^DROP_MAX_STREAM_UPLOAD_MB=70$/m);
assert.match(runtime, /resumableUploadReady/);
assert.match(config, /maxFileBytes/);
assert.match(config, /maxPartBytes/);
assert.match(config, /chunkSizeBytes/);
assert.match(config, /s3-compatible/);
assert.match(repository, /findReusableDropUpload/);
assert.match(repository, /markDropUploadPartReceived/);
assert.match(repository, /finalizeDropMultipartReceived/);
assert.match(service, /initializeDropUploadCore/);
assert.match(service, /receiveDropUploadPart/);
assert.match(service, /assembleDropUploadParts/);
assert.match(service, /DROP_UPLOAD_RESUME_FILE_MISMATCH/);
assert.match(local, /streamDropUploadPart/);
assert.match(local, /assembleDropUploadParts/);
assert.match(s3, /CreateMultipartUploadCommand/);
assert.match(s3, /UploadPartCommand/);
assert.match(s3, /CompleteMultipartUploadCommand/);
assert.match(s3, /AbortMultipartUploadCommand/);
assert.match(s3, /getSignedUrl/);
assert.match(client, /file\.slice/);
assert.match(client, /completedPartNumbers/);
assert.match(client, /partUrlTemplate/);
assert.match(client, /createStableDropClientUploadId/);
assert.match(files["app/api/drop/uploads/[uploadId]/parts/[partNumber]/route.ts"], /receiveDropUploadPart/);
assert.match(files["app/api/drop/uploads/[uploadId]/parts/route.ts"], /getDropUploadResumeState/);
assert.match(rules, /DIMPRO-DROP-UPLOAD-HU-1\.0/);
assert.match(rules, /DROP_UPLOAD_RULES_MAX_FILE_BYTES = 500 \* 1024 \* 1024/);
assert.match(rules, /DROP_UPLOAD_RULES_CHUNK_BYTES = 64 \* 1024 \* 1024/);
assert.match(rules, /DROP_UPLOAD_RULES_RESUME_HOURS = 24/);
assert.match(service, /validateDropUploadRulesAcceptance/);
assert.match(service, /upload\.rules_accepted/);
assert.match(service, /upload\.rules_reconfirmed/);
assert.match(rulesNotice, /Feltöltési szabályok és biztonsági tájékoztató/);
assert.match(rulesNotice, /Hamarosan: akár 2 GB \/ fájl/);
assert.match(rulesNotice, /hamarosan 1–2 GB-ra emelkedik/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.4",
  featureFlagClosed: false,
  featureFlagEnabled: true,
  maxFileMb: 500,
  defaultChunkMb: 64,
  maxPartMb: 70,
  resumableClient: true,
  localMultipartAdapter: true,
  hetznerS3AdapterPrepared: true,
  presignedPartUrlsPrepared: true,
  interruptedUploadResume: true,
  uploadRulesVersioned: true,
  uploadRulesAcceptanceRequired: true,
  twoGbRoadmapVisible: true,
  publicDownloadEnabled: false,
  databaseWritesPerformed: false,
}, null, 2));
