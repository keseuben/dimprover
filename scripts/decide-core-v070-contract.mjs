import fs from "node:fs";
import crypto from "node:crypto";

const files = {
  sql: "supabase/DIMPRO_PROJEKTKAPU_DECIDE_CORE_V070_BOOTSTRAP.sql",
  migration: "supabase/migrations/20260802_decide_core_v070.sql",
  types: "app/lib/decide-core/types.ts",
  schema: "app/lib/decide-core/schema.ts",
  repository: "app/lib/decide-core/repository.ts",
  service: "app/lib/decide-core/service.ts",
  permissions: "app/lib/project-core/permissions.ts",
  projectTypes: "app/lib/project-core/types.ts",
  health: "app/api/projects/[projectId]/decide/health/route.ts",
  requests: "app/api/projects/[projectId]/decide/requests/route.ts",
  request: "app/api/projects/[projectId]/decide/requests/[requestId]/route.ts",
  respond: "app/api/projects/[projectId]/decide/requests/[requestId]/respond/route.ts",
  notes: "app/api/projects/[projectId]/decide/requests/[requestId]/notes/route.ts",
  workspace: "components/project-gate/DecideWorkspace.tsx",
  workspaceCss: "components/project-gate/DecideWorkspace.module.css",
  shell: "components/project-gate/ProjectGateShell.tsx",
  modules: "app/lib/project-gate/d6Modules.ts",
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const sql = content.sql;
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

check("SQL begins transaction", sql.trimStart().startsWith("begin;"));
check("SQL commits transaction", sql.trimEnd().endsWith("commit;"));
check("Migration copy equals bootstrap", content.sql === content.migration);
check("Schema version 0.7.0", sql.includes("'decide-core','0.7.0',1,'decide-core-v070-20260802'"));
check("Project Core prerequisite", sql.includes("PROJECT_CORE_V020_REQUIRED"));
check("Project Calendar prerequisite", sql.includes("PROJECT_CALENDAR_V050_REQUIRED"));

for (const table of [
  "decide_core_schema_meta",
  "decide_core_sequences",
  "decide_core_requests",
  "decide_core_approvers",
  "decide_core_notes",
]) {
  check(`Table ${table}`, sql.includes(`create table if not exists public.${table}`));
  check(`RLS ${table}`, sql.includes(`alter table public.${table} enable row level security`));
  check(`Service role ${table}`, sql.includes(`grant select, insert, update, delete on table public.${table} to service_role`));
}

check("Request types constrained", sql.includes("PLAN_APPROVAL") && sql.includes("PRODUCT_SUBSTITUTION") && sql.includes("TECHNICAL_DECISION"));
check("Request statuses constrained", sql.includes("CHANGES_REQUESTED") && sql.includes("CANCELLED"));
check("Stage modes constrained", sql.includes("stage_mode in ('ALL','ANY')"));
check("Approver statuses constrained", sql.includes("'WAITING','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','SKIPPED'"));
check("Project code unique", sql.includes("decide_request_project_code_unique unique (project_id, code)"));
check("Approver stage user unique", sql.includes("decide_approver_stage_user_unique unique (request_id, stage_number, approver_user_id)"));
check("Audit entity types extended", sql.includes("'decide_request','decide_approver','decide_note'"));

for (const rpc of [
  "decide_core_create_request_atomic",
  "decide_core_update_request_atomic",
  "decide_core_respond_atomic",
  "decide_core_add_note_atomic",
]) {
  check(`RPC ${rpc}`, sql.includes(`function public.${rpc}`));
}
check("RPCs security definer", (sql.match(/security definer/g) || []).length >= 4);
check("RPC execution restricted", sql.includes("revoke all on function public.decide_core_create_request_atomic") && sql.includes("to service_role"));
check("Sequential decision number", sql.includes("v_code := 'DEC-' || extract(year from now())") && sql.includes("next_number = public.decide_core_sequences.next_number + 1"));
check("Approvers required", sql.includes("DECIDE_APPROVERS_REQUIRED"));
check("Continuous stages required", sql.includes("DECIDE_STAGE_SEQUENCE_INVALID"));
check("Stage mode consistency", sql.includes("DECIDE_STAGE_MODE_MISMATCH"));
check("First stage activated", sql.includes("then 'PENDING' else 'WAITING'"));
check("Actor assignment enforced", sql.includes("DECIDE_APPROVER_ACTOR_MISMATCH") && sql.includes("v_approver.approver_user_id <> p_actor_user_id"));
check("Current stage enforced", sql.includes("DECIDE_APPROVER_NOT_ACTIVE") && sql.includes("v_approver.stage_number <> v_request.current_stage"));
check("Duplicate response blocked", sql.includes("DECIDE_APPROVER_ALREADY_RESPONDED"));
check("ALL stage logic", sql.includes("v_stage_mode = 'ALL'") && sql.includes("v_pending = 0 and v_approved > 0"));
check("ANY stage logic", sql.includes("v_stage_mode = 'ANY' and v_approved > 0") && sql.includes("set status = 'SKIPPED'"));
check("Next stage activated", sql.includes("set status = 'PENDING'") && sql.includes("current_stage = v_next_stage"));
check("Final approval", sql.includes("set status = 'APPROVED'"));
check("Rejection stops workflow", sql.includes("v_next_status in ('REJECTED','CHANGES_REQUESTED')"));
check("Calendar create", sql.includes("'DEADLINE', 'DECIDE', 'PLANNED'") && sql.includes("'decide_request'"));
check("Calendar response sync", sql.includes("when v_request.status = 'APPROVED' then 'COMPLETED'") && sql.includes("then 'CANCELLED'"));
check("Calendar audits", sql.includes("PROJECT_CALENDAR_EVENT_CREATED") && sql.includes("PROJECT_CALENDAR_EVENT_UPDATED"));
check("Decision audits", sql.includes("DECIDE_REQUEST_SUBMITTED") && sql.includes("DECIDE_APPROVER_RESPONDED") && sql.includes("DECIDE_REQUEST_APPROVED"));
check("Cancellation skips remaining", sql.includes("DECIDE_REQUEST_CANCELLED") && sql.includes("status in ('WAITING','PENDING')"));

check("Types expose serial parallel workflow", content.types.includes("DecideStageMode") && content.types.includes('"ALL" | "ANY"'));
check("Types expose impacts", content.types.includes("costImpactMinor") && content.types.includes("scheduleImpactDays"));
check("Schema table list complete", content.schema.includes("decide_core_approvers") && content.schema.includes("decide_core_notes"));
check("Repository normalizes missing schema", content.repository.includes("DECIDE_CORE_SCHEMA_NOT_READY") && content.repository.includes("PGRST205"));
check("Repository uses atomic RPCs", content.repository.includes('rpc("decide_core_create_request_atomic"') && content.repository.includes('rpc("decide_core_respond_atomic"'));
check("Service validates approvers", content.service.includes("normalizeApprovers") && content.service.includes("DECIDE_APPROVER_DUPLICATE"));
check("Service requires response reasons", content.service.includes("DECIDE_RESPONSE_COMMENT_REQUIRED"));
check("Service limits manual status to cancel", content.service.includes("DECIDE_CANCEL_ONLY"));
check("Service summary", content.service.includes("summarizeDecideRequests") && content.service.includes("changesRequested"));

check("Project permission approval.write", content.projectTypes.includes('"approval.write"'));
check("Owner has approval.write/respond", content.permissions.includes('OWNER: [') && content.permissions.includes('"approval.write"') && content.permissions.includes('"approval.respond"'));
check("Contributor can create", /CONTRIBUTOR:[\s\S]*?"approval\.write"/.test(content.permissions));
check("Reviewer can respond", /REVIEWER:[\s\S]*?"approval\.respond"/.test(content.permissions));
check("Viewer read only", /VIEWER:[\s\S]*?"approval\.read"/.test(content.permissions) && !/VIEWER:[\s\S]*?"approval\.write"/.test(content.permissions));

check("Health API protected", content.health.includes('requireProjectPermission(request, projectId, "approval.read")'));
check("Create API protected", content.requests.includes('requireProjectPermission(request, projectId, "approval.write")'));
check("Update API protected", content.request.includes('requireProjectPermission(request, projectId, "approval.write")'));
check("Respond API protected", content.respond.includes('requireProjectPermission(request, projectId, "approval.respond")'));
check("Notes API protected", content.notes.includes('requireProjectPermission(request, projectId, "approval.write")'));
check("Actor identity returned", content.health.includes("actorUserId") && content.request.includes("actorUserId"));

check("DECIDE workspace connected", content.shell.includes("<DecideWorkspace") && content.shell.includes('activeModule.id === "decide"'));
check("DECIDE module active", /id: "decide"[\s\S]*?state: "active"/.test(content.modules));
check("Workspace pre-SQL state", content.workspace.includes("DECIDE WORKFLOW CORE 0.7.0") && content.workspace.includes("DIMPRO_PROJEKTKAPU_DECIDE_CORE_V070_BOOTSTRAP.sql"));
check("Workspace active header", content.workspace.includes("DIMPRO DECIDE · JÓVÁHAGYÁSOK 0.7.0"));
check("Workspace approval chain editor", content.workspace.includes("Jóváhagyási lánc") && content.workspace.includes("Mindenki szükséges") && content.workspace.includes("Egy jóváhagyás elég"));
check("Workspace response actions", content.workspace.includes("Jóváhagyás") && content.workspace.includes("Módosítás") && content.workspace.includes("Elutasítás"));
check("Workspace impact cards", content.workspace.includes("Költséghatás") && content.workspace.includes("Határidőhatás") && content.workspace.includes("DIALOG-kapcsolat"));
check("Workspace responsive layout", content.workspaceCss.includes("@media (max-width: 1100px)") && content.workspaceCss.includes("grid-template-columns: 1fr"));
check("Workspace minimum font rule", ![...content.workspaceCss.matchAll(/font-size:\s*([0-9.]+)px/g)].some((match) => Number(match[1]) < 12));

const sha256 = crypto.createHash("sha256").update(content.sql).digest("hex");
const expectedSha = fs.readFileSync(`${files.sql}.sha256`, "utf8").trim();
check("SQL SHA file matches", sha256 === expectedSha);

const report = {
  pass: checks.filter((item) => item.pass).length,
  total: checks.length,
  failures: checks.filter((item) => !item.pass),
  sha256,
};
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
