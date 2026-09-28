#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = "app/lib/drive-core/projectProvisioning.ts";
const source = fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

check("Canonical incoming name retained", source.includes('DRIVE_INCOMING_DROP_FOLDER_NAME = "Beérkező Drop"'));
check("Canonical pilot name retained", source.includes('DRIVE_PILOT_FOLDER_NAME = "PILOT"'));
check("Provisioning resolves human folder identity", source.includes("folderMatchesCanonicalName") && source.includes("folder.originalName") && source.includes("folder.displayName") && source.includes("folder.name"));
check("Incoming lookup uses canonical helper", source.includes("folderMatchesCanonicalName(folder, DRIVE_INCOMING_DROP_FOLDER_NAME)"));
check("Pilot lookup uses canonical helper", source.includes("folderMatchesCanonicalName(folder, DRIVE_PILOT_FOLDER_NAME)"));
check("Provisioning returns human incoming name", source.includes("humanFolderName(incoming)"));
check("Provisioning returns human pilot name", source.includes("humanFolderName(pilot)"));
check("Legacy technical name remains fallback", source.includes("folder.displayName || folder.originalName || folder.name"));
check("Existing bootstrap remains idempotent", source.includes("bootstrapDriveProject(projectId, actorUserId)") && source.includes("if (!state.incomingDropFolder)"));

const failed = checks.filter((item) => !item.ok);
checks.forEach((item, index) => console.log(`${item.ok ? "PASS" : "FAIL"} ${String(index + 1).padStart(2, "0")} ${item.name}`));
console.log(JSON.stringify({ total: checks.length, pass: checks.length - failed.length, fail: failed.length }, null, 2));
if (failed.length) process.exit(1);
