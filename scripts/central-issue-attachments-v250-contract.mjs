import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
let pass = 0;
let fail = 0;
function check(name, value) {
  if (value) { pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}`); }
}

const auditRepo = read("app/lib/project-core/issueAuditRepository.ts");
const auditRoute = read("app/api/projects/[projectId]/issues/[issueId]/audit/route.ts");
const workspace = read("components/minutes/shared/IssueAttachmentWorkspace.tsx");
const register = read("components/minutes/pages/IssueRegisterPage.tsx");
const previewRoute = read("app/api/projects/[projectId]/drive/documents/[documentId]/preview/route.ts");
const downloadRoute = read("app/api/projects/[projectId]/drive/documents/[documentId]/download/route.ts");
const unlinkRoute = read("app/api/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]/route.ts");
const v040 = read("supabase/migrations/20260815190500_project_issue_core_v040.sql");
const migrationOrder = read("supabase/DIMPRO_MIGRATION_ORDER_V1.txt");

check("V0.5 audit repository exists", exists("app/lib/project-core/issueAuditRepository.ts"));
check("V0.5 audit API exists", exists("app/api/projects/[projectId]/issues/[issueId]/audit/route.ts"));
check("V0.5 workspace component exists", exists("components/minutes/shared/IssueAttachmentWorkspace.tsx"));
check("Audit client identity V0.5", auditRepo.includes('dimpro-project-issue-audit/0.5.0'));
check("Audit is project scoped", auditRepo.includes('.eq("project_id", projectId)'));
check("Audit is issue entity scoped", auditRepo.includes('.eq("entity_type", "issue")') && auditRepo.includes('.eq("entity_id", issueId)'));
check("Audit newest first", auditRepo.includes('.order("created_at", { ascending: false })'));
check("Audit limit capped", auditRepo.includes("Math.min(100"));
check("Audit schema errors fail closed", auditRepo.includes("PROJECT_ISSUE_AUDIT_SCHEMA_NOT_READY"));
check("Audit API requires issue.read", auditRoute.includes('requireProjectPermission(request, projectId, "issue.read")'));
check("Audit API no-store", auditRoute.includes('"cache-control": "no-store"'));
check("Audit API limit query supported", auditRoute.includes('searchParams.get("limit")'));
check("Workspace marker 0.5.0", workspace.includes('data-issue-attachment-workspace="0.5.0"'));
check("Audit history marker 0.5.0", workspace.includes('data-issue-audit-history="0.5.0"'));
check("Photo group supported", workspace.includes('data-issue-attachment-group={kind}') && workspace.includes('"PHOTO"'));
check("Plan group supported", workspace.includes('"PLAN"'));
check("Document group supported", workspace.includes('"DOCUMENT"'));
check("Workspace loads attachment API", workspace.includes('`${base}/attachments`'));
check("Workspace loads issue audit API", workspace.includes('`${base}/audit?limit=80`'));
check("Preview uses Drive preview route", workspace.includes('/drive/documents/${encodeURIComponent(attachment.driveDocumentId)}/preview'));
check("Preview sends exact Drive version", workspace.includes('versionId: attachment.driveVersionId'));
check("Preview renders same-origin iframe", workspace.includes('<iframe src={preview.url}'));
check("Download uses Drive download route", workspace.includes('/drive/documents/${encodeURIComponent(attachment.driveDocumentId)}/download'));
check("Download opens returned URL", workspace.includes('window.open(url, "_blank", "noopener,noreferrer")'));
check("Preview gated by document.read", workspace.includes('if (!canReadDocuments || actionId) return'));
check("Download gated by document.read", workspace.split("async function downloadAttachment")[1]?.includes('if (!canReadDocuments || actionId) return'));
check("Read-only warning exists", workspace.includes('`document.read` jogosultság szükséges'));
check("Unlink gated by issue write prop", workspace.includes('if (!canWrite || actionId) return'));
check("Unlink confirms Drive preservation", workspace.includes("A DIMPRO Drive dokumentum nem törlődik"));
check("Unlink uses DELETE", workspace.includes('method: "DELETE"'));
check("Unlink sends expectedVersion", workspace.includes('expectedVersion: attachment.version'));
check("Unlink refreshes workspace", workspace.includes('await load()'));
check("Unlink refreshes parent counters", workspace.includes('await onChanged?.()'));
check("Workspace shows relation type", workspace.includes('{attachment.relationType}'));
check("Workspace shows attachment version", workspace.includes('v{attachment.version}'));
check("Workspace shows Drive document identity", workspace.includes('attachment.driveDocumentId.slice(-10)'));
check("Workspace shows Drive version identity", workspace.includes('attachment.driveVersionId.slice(-10)'));
check("Workspace shows audit actor mapping", workspace.includes('memberNames[event.actorUserId]'));
check("Issue Register imports workspace", register.includes('IssueAttachmentWorkspace from "@/components/minutes/shared/IssueAttachmentWorkspace"'));
check("Issue Register marker 0.5.0", register.includes('data-project-issue-register="0.5.0"'));
check("Issue Register checks document.read", register.includes('permissions.includes("document.read")'));
check("Issue Register builds member name map", register.includes('const memberNames = useMemo'));
check("Issue Register compact summary marker 0.5.0", register.includes('data-issue-attachment-summary="0.5.0"'));
check("Issue Register full workspace below detail grid", register.includes('<div className="mt-4"><IssueAttachmentWorkspace'));
check("Issue Register parent refresh wired", register.includes('onChanged={() => loadProjectIssues(projectId)}'));
check("Drive preview route still requires document.read", previewRoute.includes('requireProjectPermission(request, projectId, "document.read")'));
check("Drive download route still requires document.read", downloadRoute.includes('requireProjectPermission(request, projectId, "document.read")'));
check("Drive preview still delegates security service", previewRoute.includes("initDriveObjectPreview"));
check("Drive download still delegates security service", downloadRoute.includes("initDriveObjectDownload"));
check("Unlink API still requires issue.write", unlinkRoute.includes('requireProjectPermission(request, projectId, "issue.write")'));
check("Unlink API still uses optimistic version", unlinkRoute.includes('Number(input.expectedVersion)'));
check("Unlink route does not delete Drive document", !unlinkRoute.includes("deleteDriveObject") && !unlinkRoute.includes("drive/documents") && !unlinkRoute.includes("DELETE_DOCUMENT"));
check("V0.4 unlink migration preserves Drive storage", !v040.slice(v040.indexOf("project_issue_attachment_unlink_atomic")).includes("drive_core_documents set deleted_at"));
check("No V0.5 DB migration introduced", !migrationOrder.includes("project_issue_core_v050") && !fs.readdirSync(path.join(root, "supabase/migrations")).some((name) => name.includes("project_issue_core_v050")));
check("Migration order still ends V0.4", migrationOrder.trim().endsWith("supabase/migrations/20260815190500_project_issue_core_v040.sql"));

console.log(`\nCentral Issue Attachments V2.5 contract: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
