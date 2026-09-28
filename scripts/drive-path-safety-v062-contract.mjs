#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const normalizer = readFileSync("app/lib/drive-core/nameNormalizer.ts", "utf8");
const storage = readFileSync("app/lib/drive-core/storageService.ts", "utf8");
const workspace = readFileSync("app/lib/drive-core/workspaceRepository.ts", "utf8");
const complete = readFileSync("app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts", "utf8");
const drop = readFileSync("components/drive/externalFileDrop.ts", "utf8");
const main = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const project = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const zip = readFileSync("app/lib/drive-core/folderDownloadService.ts", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("global safe relative path target is 180 characters", () => { assert.match(normalizer, /DRIVE_SAFE_PATH_TARGET_MAX = 180/); });
check("safe folder path has deterministic compaction", () => { assert.match(normalizer, /buildDriveSafeArchiveFolderPath/); assert.match(normalizer, /compactDriveSafeFolderName/); assert.match(normalizer, /"P_" \+ shortStableHash/); });
check("safe file path reserves room for filename and bounded fallback", () => { assert.match(normalizer, /folderTarget = Math\.max\(24, maxLength - 73\)/); assert.match(normalizer, /availableFileChars/); assert.match(normalizer, /relativePath: relativePath\.slice\(0, maxLength\)/); });
check("already safe technical file names are preserved", () => { assert.match(normalizer, /export function ensureDriveSafeFileName/); assert.match(normalizer, /stemIsSafe && extensionIsSafe/); });
check("already safe technical folder names are preserved", () => { assert.match(normalizer, /export function ensureDriveSafeFolderName/); assert.match(normalizer, /WINDOWS_RESERVED\.test\(input\)/); });
check("relative path normalization returns compacted audit flag", () => { assert.match(normalizer, /normalizeDriveRelativePath/); assert.match(normalizer, /safeRelativePath: compacted\.relativePath/); assert.match(normalizer, /pathWasCompacted: compacted\.pathWasCompacted/); });
check("server computes relative path itself from original path", () => { assert.match(storage, /requestedRelativePath/); assert.match(storage, /normalizeDriveRelativePath\(requestedRelativePath\)/); assert.match(storage, /originalRelativePath: normalizedRelativePath\.originalRelativePath/); assert.match(storage, /safeRelativePath: normalizedRelativePath\.safeRelativePath/); });
check("server does not trust client supplied safeRelativePath", () => { assert.doesNotMatch(storage, /input\.body\.safeRelativePath/); });
check("path compaction flag is immutable engineering metadata", () => { assert.match(workspace, /"pathWasCompacted"/); assert.match(complete, /pathWasCompacted: Boolean\(sessionMeta\.pathWasCompacted\)/); });
check("Windows Explorer dropped files keep original relative path", () => { assert.match(drop, /originalRelativePaths: string\[\]/); assert.match(drop, /current\.originalRelativePaths\.push\(entry\.relativePath\)/); });
check("main Drive forwards dropped relative path", () => { assert.match(main, /uploadFiles\(group\.files, group\.folder, group\.originalRelativePaths\)/); assert.match(main, /originalRelativePath: originalRelativePaths\?\.\[index\] \|\| file\.name/); });
check("Projectkapu forwards dropped relative path", () => { assert.match(project, /originalRelativePath\?: string/); assert.match(project, /originalRelativePath: group\.originalRelativePaths\?\.\[groupFileIndex\] \|\| file\.name/); assert.match(project, /originalRelativePath: item\.originalRelativePath \|\| item\.file\.name/); });
check("ZIP folder hierarchy uses bounded safe archive paths", () => { assert.match(zip, /buildDriveSafeArchiveFolderPath\(lineage, DRIVE_SAFE_PATH_TARGET_MAX\)/); assert.match(zip, /folderLineage/); });
check("ZIP file entries use bounded safe archive paths", () => { assert.match(zip, /buildDriveSafeArchivePath\(folderSegments, safeFile, DRIVE_SAFE_PATH_TARGET_MAX\)/); assert.match(zip, /uniqueZipEntryName/); });
check("ZIP collision suffix stays technical-safe", () => { assert.match(zip, /const suffix = "_" \+ counter/); assert.doesNotMatch(zip, /\(\$\{counter\}\)/); });
check("ZIP outer filename remains safe", () => { assert.match(zip, /ensureDriveSafeFolderName\(root\.name\)/); });

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
