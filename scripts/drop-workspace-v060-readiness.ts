import assert from "node:assert/strict";
import { getDropGlobalUploadReadiness } from "../app/lib/drop/storage/dropUploadService";
import { getDropSupabaseClient } from "../app/lib/drop/dropRepository";
import { listDropSpaceProjectOptions } from "../app/lib/drop/dropSpaceProjectLinkService";
import { requestDropPinRecovery } from "../app/lib/drop/dropPinRecovery";
import { requestDropSpaceRecovery } from "../app/lib/drop/dropSpaceRecovery";

const spaceId = "0d2edd10-f0d5-4afc-8051-074e5bb819d1";
const readiness = await getDropGlobalUploadReadiness();
assert.equal(readiness.uploadReady, true);
assert.equal(readiness.quarantineUploadReady, true);
assert.equal(readiness.resumableUploadReady, true);
assert.equal(readiness.scannerAvailable, true);
assert.equal(readiness.publicDownloadReady, true);
assert.equal(readiness.storageMode, "active");
assert.equal(readiness.storageProvider, "s3-compatible");

const projectOptions = await listDropSpaceProjectOptions(spaceId);
const hageProject = projectOptions.projects.find((project) => project.id === "project-hage-invest");
assert.ok(hageProject);
assert.equal(hageProject.name, "HAGE-INVEST");
assert.equal(hageProject.code, "HAGE-001");
assert.equal(hageProject.linked, true);
assert.equal(hageProject.link?.sync_to_dock, true);
assert.equal(hageProject.link?.allow_dock_package_creation, true);

const client = getDropSupabaseClient();
const [commentsCheck, projectCheck, linkCheck, entityCheck] = await Promise.all([
  client.from("drop_comments").select("id,package_id,file_id,comment_text,status").limit(0),
  client.from("project_core_projects").select("id,code,name,status").eq("id", "project-hage-invest").single(),
  client.from("drop_space_projects").select("id,space_id,project_id").eq("space_id", spaceId).eq("project_id", "project-hage-invest").single(),
  client.from("project_core_entity_links").select("id,source_type,source_id,target_type,target_id,relation_type").eq("project_id", "project-hage-invest").eq("source_type", "drop_space").eq("source_id", spaceId).single(),
]);
assert.equal(commentsCheck.error, null);
assert.equal(projectCheck.error, null);
assert.equal(projectCheck.data.status, "ACTIVE");
assert.equal(linkCheck.error, null);
assert.equal(entityCheck.error, null);
assert.equal(entityCheck.data.relation_type, "RELATES_TO");

const invalidPinRecovery = await requestDropPinRecovery({ publicCode: "DMP-INVALID", email: "invalid@example.invalid" });
assert.equal(invalidPinRecovery.accepted, true);
assert.equal(invalidPinRecovery.delivered, false);
const invalidSpaceRecovery = await requestDropSpaceRecovery({ spaceCode: "DSP-00-INVALID00", email: "invalid@example.invalid" });
assert.equal(invalidSpaceRecovery.accepted, true);
assert.equal(invalidSpaceRecovery.delivered, false);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.6.0",
  uploadReadiness: {
    provider: readiness.storageProvider,
    mode: readiness.storageMode,
    upload: readiness.uploadReady,
    resumable: readiness.resumableUploadReady,
    scanner: readiness.scannerAvailable,
    download: readiness.publicDownloadReady,
  },
  hageInvest: {
    projectId: hageProject.id,
    projectCode: hageProject.code,
    linkedSpaceId: spaceId,
    dockSync: hageProject.link?.sync_to_dock,
    packageCreation: hageProject.link?.allow_dock_package_creation,
  },
  commentsSchema: true,
  recoveryEnumerationSafe: true,
  secretsExposed: false,
}, null, 2));
