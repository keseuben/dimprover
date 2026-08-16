#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const files = {
  provision: "app/lib/drive-core/projectProvisioning.ts",
  provisionRoute: "app/api/projects/[projectId]/drive/provision/route.ts",
  projectsRoute: "app/api/projects/route.ts",
  store: "app/lib/drive-core/store.ts",
  driveUi: "components/project-gate/DriveWorkspace.tsx",
  driveCss: "components/project-gate/DriveWorkspace.module.css",
  projectList: "components/project-gate/ProjectListClient.tsx",
  projectListCss: "components/project-gate/ProjectListClient.module.css",
  folderRoute: "app/api/projects/[projectId]/drive/folders/route.ts",
  uploadInit: "app/api/projects/[projectId]/drive/uploads/init/route.ts",
  storageService: "app/lib/drive-core/storageService.ts",
  uploadComplete: "app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts",
  migrationOrder: "supabase/DIMPRO_MIGRATION_ORDER_V1.txt",
};
for (const file of Object.values(files)) if (!exists(file)) throw new Error(`Hiányzó fájl: ${file}`);
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

check("Provisioning V1.1 marker", source.provision.includes('DRIVE_PROJECT_PROVISIONING_VERSION = "1.1.0"'));
check("Beérkező Drop canonical name", source.provision.includes('DRIVE_INCOMING_DROP_FOLDER_NAME = "Beérkező Drop"'));
check("Beérkező Drop root folder", source.provision.includes("folder.parentId === null") && source.provision.includes("parentId: null"));
check("Beérkező Drop deterministic sort", source.provision.includes("DRIVE_INCOMING_DROP_FOLDER_SORT_ORDER = 70"));
check("Existing Drive bootstrap reused", source.provision.includes("bootstrapDriveProject(projectId, actorUserId)"));
check("Existing Drive folder path reused", source.provision.includes("createDriveFolder(projectId") && source.folderRoute.includes("createDriveFolder"));
check("Provisioning state uses real Drive tree", source.provision.includes("listDriveTree(projectId)"));
check("Provisioning is idempotent", source.provision.includes("if (!state.incomingDropFolder)") && source.provision.includes("state = await readProvisioningState(projectId)"));
check("Purpose-bound provisioning error", source.provision.includes("DRIVE_PROJECT_PROVISIONING_INCOMING_FOLDER_FAILED") && source.provision.includes("DriveCoreRepositoryError"));
check("Provisioning exported through store", source.store.includes("provisionProjectDrive") && source.store.includes("getProjectDriveProvisioningState"));
check("Provision GET requires project.read", source.provisionRoute.includes('requireProjectPermission(request, projectId, "project.read")'));
check("Provision POST requires project.update", source.provisionRoute.includes('requireProjectPermission(request, projectId, "project.update")'));
check("Provision route no-store", source.provisionRoute.includes('"cache-control": "no-store"'));
check("Project create auto-provisions Drive", source.projectsRoute.includes("await provisionProjectDrive(result.project.id, authResult.actor.userId)"));
check("Project create survives provisioning failure", source.projectsRoute.includes("retryRequired: true") && source.projectsRoute.includes("status: 201"));
check("Project UI reports Drive ready", source.projectList.includes("A projekt és a DIMPRO Drive létrejött") && source.projectList.includes("Beérkező Drop célmappa"));
check("Project UI reports provisioning retry", source.projectList.includes("Drive inicializálása újrapróbálást igényel"));
check("Project success notice styled", source.projectListCss.includes(".successBox"));
check("Existing folder creation remains", source.driveUi.includes("submitFolder") && source.driveUi.includes("Új projektmappa"));
check("Upload input supports multiple", source.driveUi.includes('type="file" multiple required'));
check("External OS drag guard", source.driveUi.includes('includes("Files")') && source.driveUi.includes("event.dataTransfer.files"));
check("External drop copy semantics", source.driveUi.includes('event.dataTransfer.dropEffect = "copy"'));
check("External drop target required", source.driveUi.includes("behúzott fájlok feltöltése előtt válassz ki egy célmappát"));
check("Upload queue marker", source.driveUi.includes('data-drive-upload-queue="1.1.0"'));
check("Upload workspace marker", source.driveUi.includes('data-drive-upload-v110="1.1.0"'));
check("Queue explicit states", ["QUEUED", "UPLOADING", "VERIFYING", "DONE", "ERROR"].every((value) => source.driveUi.includes(`"${value}"`)));
check("XHR upload progress", source.driveUi.includes("new XMLHttpRequest()") && source.driveUi.includes("request.upload.onprogress"));
check("Signed upload preserved", source.driveUi.includes("/drive/uploads/init") && source.driveUi.includes("initPayload.signedUpload"));
check("Complete endpoint preserved", source.driveUi.includes("initPayload.completeUrl"));
check("Abort endpoint preserved", source.driveUi.includes("initPayload.abortUrl") && source.driveUi.includes("abortUrl"));
check("No storage credential in client", !/S3_SECRET|AWS_SECRET|service_role/.test(source.driveUi));
check("WEB source metadata", source.driveUi.includes('source: "WEB"'));
check("Per-file max size gate", source.driveUi.includes("maxUploadBytes") && source.driveUi.includes("maxUploadMb"));
check("Empty files ignored", source.driveUi.includes("file.size > 0"));
check("Bounded two-worker concurrency", source.driveUi.includes("Promise.all([worker(), worker()])") && source.driveUi.includes("maximum 2 párhuzamos feltöltés"));
check("Per-file retry", source.driveUi.includes("function retryUpload") && source.driveUi.includes("Újra"));
check("Queue refreshes Drive tree", source.driveUi.includes("await load();"));
check("Security verification visible", source.driveUi.includes("SHA-256 és biztonsági ellenőrzés") && source.driveUi.includes("securityScan"));
check("Upload API permission unchanged", source.uploadInit.includes('requireProjectPermission(request, projectId, "document.write")'));
check("Checksum/security source unchanged", source.storageService.includes("calculateDriveObjectSha256") && source.uploadComplete.includes("scanDriveQuarantinedVersion") && source.uploadComplete.includes("completeDriveObjectUpload"));
check("External drop overlay styled", source.driveCss.includes(".externalDropOverlay") && source.driveCss.includes(".workspaceDragActive"));
check("Queue/progress styled", source.driveCss.includes(".uploadQueue") && source.driveCss.includes(".uploadProgress"));
check("Responsive queue", source.driveCss.includes("@media (max-width: 700px)") && source.driveCss.includes(".uploadQueueList article"));
const migrationStatus = execFileSync("git", ["status", "--porcelain", "--", "supabase/migrations", "supabase/DIMPRO_MIGRATION_ORDER_V1.txt"], { cwd: root, encoding: "utf8" }).trim();
check("No V1.1 DB migration", migrationStatus === "");
check("Migration order unchanged", source.migrationOrder.includes("20260815190500_project_issue_core_v040.sql"));
check("SmartSync not introduced", ![source.provision, source.provisionRoute, source.driveUi].some((text) => /CfConnectSyncRoot|Cloud Files API|SmartSync/i.test(text)));
check("Private Vault not introduced", ![source.provision, source.provisionRoute, source.driveUi].some((text) => /Private Vault|SECRET_VAULT/i.test(text)));

const failed = checks.filter((item) => !item.ok);
checks.forEach((item, index) => console.log(`${item.ok ? "PASS" : "FAIL"} ${String(index + 1).padStart(2, "0")} ${item.name}`));
console.log(`\nDrive Project Provisioning + Web Upload V1.1 contract: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
