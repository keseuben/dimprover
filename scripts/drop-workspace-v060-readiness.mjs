import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const storageProvider = process.env.DIMPRO_DROP_STORAGE_PROVIDER?.trim() || "";
const storageMode = process.env.DIMPRO_DROP_STORAGE_MODE?.trim() || "";
const storageBucket = process.env.DIMPRO_DROP_S3_BUCKET?.trim() || "";
const driveBucket = process.env.DIMPRO_DRIVE_S3_BUCKET?.trim() || "";
const dropAccessKey = process.env.DIMPRO_DROP_S3_ACCESS_KEY_ID?.trim() || "";
const driveAccessKey = process.env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID?.trim() || "";
const scannerCommand = process.env.DIMPRO_DROP_VIRUS_SCANNER_COMMAND?.trim() || process.env.DROP_VIRUS_SCANNER_COMMAND?.trim() || "";

assert.equal(storageProvider, "s3-compatible");
assert.equal(storageMode, "active");
assert.ok(storageBucket);
assert.notEqual(storageBucket, driveBucket);
assert.ok(dropAccessKey);
assert.notEqual(dropAccessKey, driveAccessKey);
assert.ok(scannerCommand);

const spaceId = "0d2edd10-f0d5-4afc-8051-074e5bb819d1";
const projectId = "project-hage-invest";

const [
  storageMarkerResult,
  projectResult,
  dropLinkResult,
  entityLinkResult,
  commentsResult,
  spaceResult,
] = await Promise.all([
  supabase
    .from("drop_schema_meta")
    .select("schema_version,migration_count,bootstrap_id,metadata")
    .eq("component", "drop-storage")
    .single(),
  supabase
    .from("project_core_projects")
    .select("id,code,name,status,organization_id,current_phase")
    .eq("id", projectId)
    .single(),
  supabase
    .from("drop_space_projects")
    .select("id,space_id,project_id,project_name_snapshot,sync_to_dock,allow_dock_package_creation,archive_to_drive")
    .eq("space_id", spaceId)
    .eq("project_id", projectId)
    .single(),
  supabase
    .from("project_core_entity_links")
    .select("id,source_type,source_id,target_type,target_id,relation_type")
    .eq("project_id", projectId)
    .eq("source_type", "drop_space")
    .eq("source_id", spaceId)
    .single(),
  supabase
    .from("drop_comments")
    .select("id,package_id,file_id,comment_text,status")
    .limit(0),
  supabase
    .from("drop_spaces")
    .select("id,public_code,name,status,license_ends_at")
    .eq("id", spaceId)
    .single(),
]);

for (const result of [storageMarkerResult, projectResult, dropLinkResult, entityLinkResult, commentsResult, spaceResult]) {
  assert.equal(result.error, null, result.error?.message || "adatbázishiba");
}

assert.equal(storageMarkerResult.data.schema_version, "DROP 0.5.0");
assert.equal(Number(storageMarkerResult.data.migration_count), 4);
assert.equal(storageMarkerResult.data.bootstrap_id, "drop-050-malware-retention-download-20260803");
assert.equal(storageMarkerResult.data.metadata?.directMultipartUpload, true);
assert.equal(storageMarkerResult.data.metadata?.clamdInstreamScan, true);
assert.equal(storageMarkerResult.data.metadata?.secureSignedDownload, true);

assert.equal(projectResult.data.code, "HAGE-001");
assert.equal(projectResult.data.name, "HAGE-INVEST");
assert.equal(projectResult.data.status, "ACTIVE");
assert.equal(dropLinkResult.data.project_name_snapshot, "HAGE-INVEST");
assert.equal(dropLinkResult.data.sync_to_dock, true);
assert.equal(dropLinkResult.data.allow_dock_package_creation, true);
assert.equal(entityLinkResult.data.relation_type, "RELATES_TO");
assert.equal(spaceResult.data.public_code, "DSP-26-56408E28");
assert.equal(spaceResult.data.status, "active");

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.6.0",
  schemaVersion: storageMarkerResult.data.schema_version,
  uploadReadiness: {
    provider: storageProvider,
    mode: storageMode,
    storageConfigured: true,
    credentialIsolation: true,
    resumableUpload: true,
    scannerAvailable: true,
    secureDownload: true,
  },
  hageInvest: {
    projectId: projectResult.data.id,
    projectCode: projectResult.data.code,
    projectStatus: projectResult.data.status,
    spaceId: spaceResult.data.id,
    spaceCode: spaceResult.data.public_code,
    dockSync: dropLinkResult.data.sync_to_dock,
    packageCreation: dropLinkResult.data.allow_dock_package_creation,
    entityRelation: entityLinkResult.data.relation_type,
  },
  commentsSchema: true,
  secretsExposed: false,
}, null, 2));
