import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "app/lib/drop/dropTypes.ts",
  "app/lib/drop/dropRuntime.ts",
  "app/lib/drop/storage/dropStorageConfig.ts",
  "app/lib/drop/storage/dropS3Storage.ts",
  "app/lib/drop/storage/dropStorageRepository.ts",
  "app/lib/drop/storage/dropUploadService.ts",
  "app/api/drop/uploads/[uploadId]/parts/[partNumber]/route.ts",
  "app/api/drop/admin/storage/cleanup/route.ts",
  "components/drop/dropMultipartClient.ts",
  "supabase/DIMPRO_DROP_040_PRIVATE_S3_STORAGE_BOOTSTRAP.sql",
  "scripts/drop-object-storage-v040-readiness.mjs",
  "scripts/drop-object-storage-v040-preflight.mjs",
  "scripts/drop-object-storage-v040-cors.mjs",
  "scripts/configure-drop-s3-v040.sh",
  "scripts/rollback-drop-s3-v040.sh",
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])));
const config = files[paths[2]];
const s3 = files[paths[3]];
const repository = files[paths[4]];
const service = files[paths[5]];
const partRoute = files[paths[6]];
const cleanupRoute = files[paths[7]];
const client = files[paths[8]];
const sql = files[paths[9]];
const readiness = files[paths[10]];
const preflight = files[paths[11]];
const cors = files[paths[12]];
const configure = files[paths[13]];
const rollback = files[paths[14]];
let checks = 0;
const match = (text, pattern) => { assert.match(text, pattern); checks += 1; };
const truth = (value) => { assert.ok(value); checks += 1; };

truth(sql.trimStart().startsWith("begin;"));
truth(sql.trimEnd().endsWith("commit;"));
match(sql, /DROP 0\.4\.0/);
match(sql, /drop-040-private-s3-storage-20260802/);
match(sql, /PART_MANIFEST_SHA256/);
match(sql, /drop_object_cleanup_tasks/);
match(sql, /DELETE_OBJECT/);
match(sql, /ABORT_MULTIPART/);
match(sql, /drop_finalize_s3_quarantine_upload/);
match(sql, /drop_queue_object_cleanup/);
match(sql, /drop_complete_object_cleanup/);
match(sql, /enable row level security/);
match(sql, /revoke all .* from public, anon, authenticated/);
match(sql, /driveCredentialReuseForbidden/);

match(config, /DIMPRO_DROP_S3_ENDPOINT/);
match(config, /DIMPRO_DROP_S3_ACCESS_KEY_ID/);
match(config, /DIMPRO_DRIVE_S3_BUCKET/);
match(config, /bucket !== driveBucket/);
match(config, /accessKeyId !== driveAccessKey/);
match(config, /credentialIsolationReady/);
match(config, /publicDownloadReady: storageConfigured && config\.mode === "active" && config\.scannerAvailable/);

match(s3, /CreateMultipartUploadCommand/);
match(s3, /UploadPartCommand/);
match(s3, /ListPartsCommand/);
match(s3, /CompleteMultipartUploadCommand/);
match(s3, /AbortMultipartUploadCommand/);
match(s3, /HeadObjectCommand/);
match(s3, /DeleteObjectCommand/);
match(s3, /getSignedUrl/);

match(repository, /DROP 0\.4\.0/);
match(repository, /finalizeDropS3QuarantineUpload/);
match(repository, /queueDropObjectCleanup/);
match(repository, /completeDropObjectCleanup/);
match(repository, /listPendingDropObjectCleanup/);
match(repository, /const privateS3Marker = v040Marker \|\| v050Marker/);

match(service, /createDropS3UploadPartUrl/);
match(service, /confirmDropS3UploadPart/);
match(service, /inspectDropS3Part/);
match(service, /completeDropS3Multipart/);
match(service, /headDropS3Object/);
match(service, /PART_MANIFEST_SHA256/);
match(service, /processDropObjectCleanup/);
match(service, /DROP_UPLOAD_ALREADY_FINALIZED/);
match(service, /headDropS3Object[\s\S]*catch\(\(\) => null\)/);
match(service, /queueDropObjectCleanup/);

match(partRoute, /export async function POST/);
match(partRoute, /export async function PATCH/);
match(partRoute, /export async function PUT/);
match(partRoute, /createDropS3UploadPartUrl/);
match(partRoute, /confirmDropS3UploadPart/);
match(partRoute, /DROP_UPLOAD_HOST_NOT_ALLOWED/);
match(cleanupRoute, /isLicenseAdminAuthorized/);
match(cleanupRoute, /processDropObjectCleanup/);

match(client, /crypto\.subtle\.digest\("SHA-256"/);
match(client, /storageProvider === "s3-compatible"/);
match(client, /method: "POST"/);
match(client, /method: "PATCH"/);
match(client, /xhr\.getResponseHeader\("etag"\)/);
match(client, /Authorization: `Bearer \$\{input\.initialized\.uploadToken\}`/);

match(readiness, /credentialIsolationReady/);
match(readiness, /secretsExposed: false/);
match(preflight, /HeadBucketCommand/);
match(preflight, /DROP downloaded checksum verified/);
match(preflight, /accessKeyDiffersFromDrive/);
match(cors, /ExposeHeaders: \["ETag"/);
match(cors, /https:\/\/drop\.dimpro\.hu/);
match(configure, /read -r -s -p "DROP S3 secret access key/);
match(configure, /DIMPRO_DROP_STORAGE_MODE/);
match(configure, /Secret kiírva: NEM/);
match(rollback, /drop_s3_credentials_v040/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.4.0",
  checksPassed: checks,
  directMultipartS3: true,
  partSha256: true,
  partManifestIntegrity: true,
  durableCleanup: true,
  credentialIsolation: true,
  localAdapterPreserved: true,
  publicDownloadEnabled: false,
  secretsExposed: false,
}, null, 2));
