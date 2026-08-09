#!/usr/bin/env node
import fs from "node:fs";

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const s3 = fs.readFileSync("app/lib/drive-core/s3ObjectStorage.ts", "utf8");
const storageService = fs.readFileSync("app/lib/drive-core/storageService.ts", "utf8");
const storageRepository = fs.readFileSync("app/lib/drive-core/storageRepository.ts", "utf8");
const workspaceRepository = fs.readFileSync("app/lib/drive-core/workspaceRepository.ts", "utf8");
const healthRoute = fs.readFileSync("app/api/projects/[projectId]/drive/health/route.ts", "utf8");
const detailsRoute = fs.readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/details/route.ts", "utf8");
const metadataRoute = fs.readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/metadata/route.ts", "utf8");
const noteRoute = fs.readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/note/route.ts", "utf8");
const qrRoute = fs.readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/qr/route.ts", "utf8");
const sql = fs.readFileSync("supabase/DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql", "utf8");

check("S3 SHA-256 stream function", s3.includes("calculateDriveObjectSha256") && s3.includes('createHash("sha256")') && s3.includes("for await"));
check("Upload complete hashes before finalization", storageService.indexOf("calculateDriveObjectSha256") < storageService.indexOf("finalizeDriveUploadSessionRecord"));
check("Verified SHA passed to repository", storageService.includes("verifiedSha256: checksum.sha256"));
check("Checksum mismatch blocks activation", storageService.includes("DRIVE_UPLOAD_CHECKSUM_MISMATCH") && storageRepository.includes("DRIVE_UPLOAD_CHECKSUM_REQUIRED"));
check("Checksum persisted before RPC", storageRepository.indexOf("sha256: verifiedSha256") < storageRepository.indexOf('client.rpc("drive_core_finalize_upload_atomic"'));
check("Checksum audit reconciled", storageRepository.includes("checksumVerified: true") && storageRepository.includes("project_core_audit_events"));
check("Workspace health feature gate", healthRoute.includes("getDriveWorkspaceDatabaseHealth") && healthRoute.includes("DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql"));
check("Project read permission on details", detailsRoute.includes('requireProjectPermission(request, projectId, "document.read")'));
check("Project write permission on metadata", metadataRoute.includes('requireProjectPermission(request, projectId, "document.write")'));
check("Project write permission on note", noteRoute.includes('requireProjectPermission(request, projectId, "document.write")'));
check("Project write permission on QR", qrRoute.includes('requireProjectPermission(request, projectId, "document.write")'));
check("Workspace repository uses atomic metadata RPC", workspaceRepository.includes("drive_workspace_upsert_metadata_atomic"));
check("Workspace repository uses atomic note RPC", workspaceRepository.includes("drive_workspace_upsert_note_atomic"));
check("Workspace repository uses atomic QR RPC", workspaceRepository.includes("drive_workspace_ensure_qr_atomic"));
check("Workspace SQL marker", sql.includes("drive-workspace-v100-20260807") && sql.includes("'drive-workspace','1.0.0',1"));
check("Engineering metadata table", sql.includes("create table if not exists public.drive_core_document_metadata"));
check("File note table", sql.includes("create table if not exists public.drive_core_file_notes"));
check("QR table", sql.includes("create table if not exists public.drive_core_qr_codes"));
check("CsomagBOX tables", sql.includes("create table if not exists public.drive_core_boxes") && sql.includes("create table if not exists public.drive_core_box_items"));
check("Saved views table", sql.includes("create table if not exists public.drive_core_saved_views"));
check("RLS enabled", ["drive_core_document_metadata","drive_core_file_notes","drive_core_qr_codes","drive_core_boxes","drive_core_box_items","drive_core_saved_views"].every((table) => sql.includes(`alter table public.${table} enable row level security`)));
check("Atomic RPC restricted to service role", sql.includes("grant execute on function public.drive_workspace_upsert_metadata_atomic") && sql.includes("to service_role"));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
console.log(`\n${checks.length - failed.length}/${checks.length} ellenőrzés PASS`);
if (failed.length) process.exit(1);
