import fs from "node:fs";
import crypto from "node:crypto";

const sqlPath = "supabase/DIMPRO_PROJEKTKAPU_DRIVE_QUARANTINE_REVIEW_V041_BOOTSTRAP.sql";
const migrationPath = "supabase/migrations/20260802_drive_quarantine_review_v041.sql";
const shaPath = `${sqlPath}.sha256`;
const sql = fs.readFileSync(sqlPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");
const sha = fs.readFileSync(shaPath, "utf8").trim();
const actualSha = crypto.createHash("sha256").update(sql).digest("hex");
const permissions = fs.readFileSync("app/lib/project-core/permissions.ts", "utf8");
const permissionTypes = fs.readFileSync("app/lib/project-core/types.ts", "utf8");
const reviewRoute = fs.readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/review/route.ts", "utf8");
const cleanupRoute = fs.readFileSync("app/api/projects/[projectId]/drive/storage/cleanup/route.ts", "utf8");
const healthRoute = fs.readFileSync("app/api/projects/[projectId]/drive/health/route.ts", "utf8");
const reviewService = fs.readFileSync("app/lib/drive-core/reviewService.ts", "utf8");
const ui = fs.readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = fs.readFileSync("components/project-gate/DriveWorkspace.module.css", "utf8");

function roleBlock(role, nextRole) {
  const start = permissions.indexOf(`  ${role}: [`);
  const end = nextRole ? permissions.indexOf(`  ${nextRole}: [`, start + 1) : permissions.indexOf("};", start + 1);
  return permissions.slice(start, end);
}

const checks = [
  ["SQL begins with begin", sql.trimStart().startsWith("begin;")],
  ["SQL ends with commit", sql.trimEnd().endsWith("commit;")],
  ["Migration copy identical", sql === migration],
  ["SHA-256 matches", sha === actualSha],
  ["Cleanup table present", sql.includes("create table if not exists public.drive_core_object_cleanup_tasks")],
  ["Cleanup task unique per version", sql.includes("drive_core_cleanup_project_version_unique")],
  ["Cleanup RLS enabled", sql.includes("alter table public.drive_core_object_cleanup_tasks enable row level security")],
  ["Direct table access revoked", sql.includes("revoke all on table public.drive_core_object_cleanup_tasks from public, anon, authenticated")],
  ["Review atomic RPC present", sql.includes("drive_core_review_quarantined_version_atomic")],
  ["Cleanup completion RPC present", sql.includes("drive_core_complete_cleanup_task")],
  ["Only quarantined versions reviewable", sql.includes("DRIVE_REVIEW_NOT_QUARANTINED")],
  ["Reject requires note", sql.includes("DRIVE_REVIEW_NOTE_REQUIRED")],
  ["Review audit events present", sql.includes("v_event_type := 'DOCUMENT_VERSION_APPROVED'") && sql.includes("v_event_type := 'DOCUMENT_VERSION_REJECTED'") && sql.includes("'DRIVE_' || v_event_type")],
  ["Cleanup audit events present", sql.includes("DRIVE_OBJECT_CLEANUP_COMPLETED") && sql.includes("DRIVE_OBJECT_CLEANUP_FAILED")],
  ["Review marker 0.4.1", sql.includes("'drive-quarantine-review','0.4.1',1,'drive-quarantine-review-v041-20260802'")],
  ["document.approve permission type", permissionTypes.includes('| "document.approve"')],
  ["OWNER can approve", roleBlock("OWNER", "PROJECT_MANAGER").includes('"document.approve"')],
  ["PROJECT_MANAGER can approve", roleBlock("PROJECT_MANAGER", "CONTRIBUTOR").includes('"document.approve"')],
  ["REVIEWER can approve", roleBlock("REVIEWER", "VIEWER").includes('"document.approve"')],
  ["CONTRIBUTOR cannot approve", !roleBlock("CONTRIBUTOR", "REVIEWER").includes('"document.approve"')],
  ["VIEWER cannot approve", !roleBlock("VIEWER", null).includes('"document.approve"')],
  ["Review API uses strict permission", reviewRoute.includes('requireProjectPermission(request, projectId, "document.approve")')],
  ["Cleanup API uses strict permission", cleanupRoute.includes('requireProjectPermission(request, projectId, "document.approve")')],
  ["Health exposes review state", healthRoute.includes("getDriveQuarantineReviewHealth") && healthRoute.includes("pendingCleanupCount")],
  ["Cleanup checks schema before storage", (() => { const block = reviewService.slice(reviewService.indexOf("export async function processDriveObjectCleanup")); return block.indexOf("getDriveQuarantineReviewDatabaseHealth") < block.indexOf("getDriveObjectStorageSafeStatus"); })()],
  ["UI exposes review controls", ui.includes('reviewDocumentVersion(document, "APPROVE")') && ui.includes('reviewDocumentVersion(document, "REJECT")')],
  ["UI requires document.approve", ui.includes('effectivePermissions.includes("document.approve")')],
  ["UI shows review readiness", ui.includes("Karanténellenőrzés · 0.4.1")],
  ["CSS has no explicit font below 12px", !/font-size:\s*(?:[0-9](?:\.[0-9]+)?|1[01](?:\.[0-9]+)?)px/.test(css)],
];
const result = { pass: checks.filter(([, pass]) => pass).length, total: checks.length, checks: checks.map(([name, pass]) => ({ name, pass })), sha256: actualSha };
console.log(JSON.stringify(result, null, 2));
if (checks.some(([, pass]) => !pass)) process.exit(1);
