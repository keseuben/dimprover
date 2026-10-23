import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";

const read = (file) => readFileSync(file, "utf8");
const build = read("components/drive/driveBuildInfo.ts");
const config = read("app/lib/drive-core/storageConfig.ts");
const s3 = read("app/lib/drive-core/s3ObjectStorage.ts");
const repo = read("app/lib/drive-core/storageRepository.ts");
const service = read("app/lib/drive-core/storageService.ts");
const scanner = read("app/lib/drive-core/securityScanService.ts");
const store = read("app/lib/drive-core/store.ts");
const initRoute = read("app/api/projects/[projectId]/drive/uploads/init/route.ts");
const partRoute = read("app/api/projects/[projectId]/drive/uploads/[uploadId]/parts/[partNumber]/route.ts");
const checkpointRoute = read("app/api/projects/[projectId]/drive/uploads/[uploadId]/checkpoint/route.ts");
const abortRoute = read("app/api/projects/[projectId]/drive/uploads/[uploadId]/abort/route.ts");
const completeRoute = read("app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts");

assert.ok(["0.9.52", "0.9.53", "0.9.54", "0.9.55", "0.9.56", "0.9.57"].includes(TRANSFER_CORE_VERSION));
assert.match(build, /DRIVE_DEVELOPMENT_VERSION = "0\.9\.(52|53|54|55|56|57)"/);

for (const symbol of [
  "CreateMultipartUploadCommand",
  "UploadPartCommand",
  "ListPartsCommand",
  "CompleteMultipartUploadCommand",
  "AbortMultipartUploadCommand",
]) assert.ok(s3.includes(symbol), `missing ${symbol}`);

assert.match(config, /DIMPRO_DRIVE_MULTIPART_CHUNK_MB/);
assert.match(config, /multipartChunkSizeBytes/);
assert.match(scanner, /DIMPRO_DRIVE_MAX_SCAN_MB", "100"/);
assert.doesNotMatch(scanner, /DIMPRO_DRIVE_MAX_SCAN_MB", env\("DIMPRO_DROP_MAX_SCAN_MB"/);
assert.match(s3, /MaxParts: 1000/);
assert.match(s3, /NextPartNumberMarker/);
assert.match(s3, /DRIVE_S3_PART_LIST_PAGINATION_FAILED/);

assert.match(service, /input\.body\.uploadProtocol === "multipart"/);
assert.match(service, /DRIVE_MULTIPART_SHA256_REQUIRED/);
assert.match(service, /24 \* 60 \* 60_000/);
assert.match(service, /DRIVE_MULTIPART_TOO_MANY_PARTS/);
assert.match(service, /signedUploadVersion: uploadProtocol === "multipart" \? "0\.9\.52-multipart"/);
assert.match(service, /createDriveS3Multipart\(/);
assert.match(service, /partUrlTemplate:/);
assert.match(service, /checkpointUrl:/);
assert.match(service, /DRIVE_MULTIPART_SINGLE_PUT_FORBIDDEN/);

assert.match(repo, /mutateDriveUploadSessionMetadataRecord/);
assert.match(repo, /\.eq\("updated_at", current\.updated_at\)/);
assert.match(repo, /DRIVE_UPLOAD_METADATA_CONFLICT/);

assert.match(service, /requireOwnedDriveUploadSession/);
assert.match(service, /session\.createdBy !== input\.actorUserId/);
assert.match(service, /requireDriveUploadSessionAccess\(input\.projectId, session, input\.access\)/);
assert.match(service, /signDriveMultipartUploadPart/);
assert.match(service, /confirmDriveMultipartUploadPart/);
assert.match(service, /DRIVE_MULTIPART_PART_SHA256_REQUIRED/);
assert.match(service, /DRIVE_MULTIPART_PART_ETAG_MISMATCH/);
assert.match(service, /inspectDriveS3MultipartPart/);
assert.match(service, /getDriveMultipartUploadCheckpoint/);
assert.match(service, /uploadedPartNumbers:/);
assert.match(service, /completedPartNumbers: confirmedPartNumbers/);
assert.match(service, /alreadyUploaded: true/);
assert.match(service, /requiresConfirmation: !alreadyCompleted/);
assert.match(service, /listDriveS3MultipartParts/);

assert.match(service, /DRIVE_MULTIPART_PARTS_UNCONFIRMED/);
assert.match(service, /DRIVE_MULTIPART_PART_CONFIRMATION_MISMATCH/);
assert.match(service, /completeDriveS3Multipart\(/);
assert.match(service, /calculateDriveObjectSha256\(/);
assert.match(service, /isNoSuchMultipartUpload/);
assert.match(service, /abortDriveS3Multipart\(/);

assert.match(initRoute, /requireProjectPermission\(request, projectId, "document\.write"\)/);
assert.match(partRoute, /export async function POST/);
assert.match(partRoute, /export async function PATCH/);
assert.match(partRoute, /requireProjectPermission\(request, projectId, "document\.write"\)/);
assert.match(checkpointRoute, /export async function GET/);
assert.doesNotMatch(checkpointRoute, /export async function POST/);
assert.match(checkpointRoute, /requireProjectPermission\(request, projectId, "document\.write"\)/);
assert.match(abortRoute, /access: access\.access/);
assert.match(completeRoute, /completeDriveObjectUpload/);
assert.ok(store.includes("getDriveMultipartUploadCheckpoint"));
assert.ok(store.includes("signDriveMultipartUploadPart"));
assert.ok(store.includes("confirmDriveMultipartUploadPart"));

console.log("DIMPRO Transfer Center V0.9.52 Drive multipart server lifecycle contract PASS");
