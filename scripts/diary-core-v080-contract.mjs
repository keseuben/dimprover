import fs from "node:fs";
import crypto from "node:crypto";

const files = {
  sql: "supabase/DIMPRO_PROJEKTKAPU_DIARY_CORE_V080_BOOTSTRAP.sql",
  migration: "supabase/migrations/20260802_diary_core_v080.sql",
  types: "app/lib/diary-core/types.ts",
  schema: "app/lib/diary-core/schema.ts",
  repository: "app/lib/diary-core/repository.ts",
  service: "app/lib/diary-core/service.ts",
  permissions: "app/lib/project-core/permissions.ts",
  projectTypes: "app/lib/project-core/types.ts",
  health: "app/api/projects/[projectId]/diary/health/route.ts",
  entries: "app/api/projects/[projectId]/diary/entries/route.ts",
  entry: "app/api/projects/[projectId]/diary/entries/[entryId]/route.ts",
  close: "app/api/projects/[projectId]/diary/entries/[entryId]/close/route.ts",
  events: "app/api/projects/[projectId]/diary/entries/[entryId]/events/route.ts",
  event: "app/api/projects/[projectId]/diary/entries/[entryId]/events/[eventId]/route.ts",
  workspace: "components/project-gate/DiaryWorkspace.tsx",
  workspaceCss: "components/project-gate/DiaryWorkspace.module.css",
  shell: "components/project-gate/ProjectGateShell.tsx",
  modules: "app/lib/project-gate/d6Modules.ts",
  structure: "app/admin/dev/rendszerstruktura/data.ts",
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const sql = content.sql;
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

check("SQL begins transaction", sql.trimStart().startsWith("begin;"));
check("SQL commits transaction", sql.trimEnd().endsWith("commit;"));
check("Migration copy equals bootstrap", content.sql === content.migration);
check("Schema version 0.8.0", sql.includes("'diary-core','0.8.0',1,'diary-core-v080-20260802'"));
check("Project Core prerequisite", sql.includes("PROJECT_CORE_V020_REQUIRED"));
check("Project Calendar prerequisite", sql.includes("PROJECT_CALENDAR_V050_REQUIRED"));

for (const table of [
  "diary_core_schema_meta",
  "diary_core_sequences",
  "diary_core_entries",
  "diary_core_events",
]) {
  check(`Table ${table}`, sql.includes(`create table if not exists public.${table}`));
  check(`RLS ${table}`, sql.includes(`alter table public.${table} enable row level security`));
  check(`Service role ${table}`, sql.includes(`grant select, insert, update, delete on table public.${table} to service_role`));
}

check("Project date unique", sql.includes("diary_entry_project_date_unique unique (project_id, diary_date)"));
check("Project code unique", sql.includes("diary_entry_project_code_unique unique (project_id, code)"));
check("Event sequence unique", sql.includes("diary_event_entry_sequence_unique unique (entry_id, sequence_number)"));
check("Entry statuses constrained", sql.includes("status in ('DRAFT','OPEN','CLOSED','CANCELLED')"));
check("Weather values constrained", sql.includes("PARTLY_CLOUDY") && sql.includes("STORM") && sql.includes("FOG"));
check("Temperature range constrained", sql.includes("temperature_min_c <= temperature_max_c"));
check("Workforce constrained", sql.includes("workforce_total between 0 and 100000"));
check("Event types constrained", sql.includes("WORK_PROGRESS") && sql.includes("OBSTACLE") && sql.includes("INSPECTION") && sql.includes("SAFETY"));
check("Event statuses constrained", sql.includes("status in ('OPEN','RESOLVED','CANCELLED')"));
check("Severity constrained", sql.includes("severity in ('INFO','MEDIUM','HIGH','CRITICAL')"));
check("Audit entity types extended", sql.includes("'diary_entry','diary_event'"));

for (const rpc of [
  "diary_core_create_entry_atomic",
  "diary_core_update_entry_atomic",
  "diary_core_close_entry_atomic",
  "diary_core_add_event_atomic",
  "diary_core_update_event_atomic",
]) {
  check(`RPC ${rpc}`, sql.includes(`function public.${rpc}`));
}
check("RPCs security definer", (sql.match(/security definer/g) || []).length >= 5);
check("RPC execution restricted", sql.includes("revoke all on function public.diary_core_create_entry_atomic") && sql.includes("to service_role"));
check("Annual sequential diary number", sql.includes("v_code := 'NAP-' || v_year::text") && sql.includes("next_number = public.diary_core_sequences.next_number + 1"));
check("Daily duplicate rejected", sql.includes("DIARY_ENTRY_DATE_CONFLICT") && sql.includes("where project_id = p_project_id and diary_date = v_date"));
check("Terminal diary protected", sql.includes("DIARY_ENTRY_TERMINAL") && sql.includes("v_current.status in ('CLOSED','CANCELLED')"));
check("Optimistic entry version", sql.includes("DIARY_ENTRY_VERSION_CONFLICT") && sql.includes("version = p_expected_version"));
check("Close RPC audited", sql.includes("DIARY_ENTRY_CLOSED") && sql.includes("closing_note"));
check("Cancellation cascades events", sql.includes("A napi naplóbejegyzés visszavonva") && sql.includes("set status = 'CANCELLED'"));
check("Event sequence generated", sql.includes("v_code := v_entry.code || '/E-'"));
check("Closed entry blocks new event", sql.includes("DIARY_EVENT_ENTRY_CLOSED"));
check("Event optimistic version", sql.includes("DIARY_EVENT_VERSION_CONFLICT"));
check("Resolved event requires text", sql.includes("DIARY_EVENT_RESOLUTION_REQUIRED"));
check("Calendar create", sql.includes("'DIARY','PLANNED'") && sql.includes("'diary_event'"));
check("Calendar type mapping", sql.includes("when v_event.event_type = 'INSPECTION' then 'INSPECTION'") && sql.includes("then 'DEADLINE'"));
check("Calendar update sync", sql.includes("when v_event.status = 'RESOLVED' then 'COMPLETED'") && sql.includes("when v_event.status = 'CANCELLED'"));
check("Calendar audits", sql.includes("PROJECT_CALENDAR_EVENT_CREATED") && sql.includes("PROJECT_CALENDAR_EVENT_UPDATED"));
check("Diary audits", sql.includes("DIARY_ENTRY_CREATED") && sql.includes("DIARY_ENTRY_UPDATED") && sql.includes("DIARY_EVENT_CREATED") && sql.includes("DIARY_EVENT_RESOLVED"));

check("Types expose weather", content.types.includes("DiaryWeatherCondition") && content.types.includes('"PARTLY_CLOUDY"'));
check("Types expose daily entry", content.types.includes("DiaryEntry") && content.types.includes("workforceBreakdown") && content.types.includes("inspectionSummary"));
check("Types expose events", content.types.includes("DiaryEvent") && content.types.includes("calendarEventId") && content.types.includes("decideRequestId"));
check("Schema table list complete", content.schema.includes("diary_core_entries") && content.schema.includes("diary_core_events"));
check("Repository normalizes missing schema", content.repository.includes("DIARY_CORE_SCHEMA_NOT_READY") && content.repository.includes("PGRST205"));
check("Repository uses atomic RPCs", content.repository.includes('rpc("diary_core_create_entry_atomic"') && content.repository.includes('rpc("diary_core_update_event_atomic"'));
check("Service validates diary date", content.service.includes("dateOnly") && content.service.includes("DIARY_DATE_REQUIRED"));
check("Service validates temperature", content.service.includes("DIARY_TEMPERATURE_RANGE_INVALID"));
check("Service requires resolution", content.service.includes("DIARY_EVENT_RESOLUTION_REQUIRED"));
check("Service Budapest day", content.service.includes('timeZone: "Europe/Budapest"'));
check("Service summary", content.service.includes("summarizeDiaryEntries") && content.service.includes("criticalEvents"));

check("Project permission diary.close", content.projectTypes.includes('"diary.close"'));
check("Owner can close", /OWNER:[\s\S]*?"diary\.close"/.test(content.permissions));
check("Manager can close", /PROJECT_MANAGER:[\s\S]*?"diary\.close"/.test(content.permissions));
check("Contributor can write", /CONTRIBUTOR:[\s\S]*?"diary\.write"/.test(content.permissions));
check("Contributor cannot close", !/CONTRIBUTOR:[\s\S]*?"diary\.close"/.test(content.permissions));
check("Reviewer read only", /REVIEWER:[\s\S]*?"diary\.read"/.test(content.permissions) && !/REVIEWER:[\s\S]*?"diary\.write"/.test(content.permissions));
check("Viewer read only", /VIEWER:[\s\S]*?"diary\.read"/.test(content.permissions) && !/VIEWER:[\s\S]*?"diary\.write"/.test(content.permissions));
check("Project audit types include diary", content.projectTypes.includes('"diary_entry"') && content.projectTypes.includes('"diary_event"'));

check("Health API protected", content.health.includes('requireProjectPermission(request, projectId, "diary.read")'));
check("Create API protected", content.entries.includes('requireProjectPermission(request, projectId, "diary.write")'));
check("Update API protected", content.entry.includes('requireProjectPermission(request, projectId, "diary.write")'));
check("Close API protected", content.close.includes('requireProjectPermission(request, projectId, "diary.close")'));
check("Event create protected", content.events.includes('requireProjectPermission(request, projectId, "diary.write")'));
check("Event update protected", content.event.includes('requireProjectPermission(request, projectId, "diary.write")'));
check("Health disclaimer", content.health.includes("nem helyettesíti a hivatalos e-építési naplót"));

check("DIARY workspace connected", content.shell.includes("<DiaryWorkspace") && content.shell.includes('activeModule.id === "diary"'));
check("DIARY module active", /id: "diary"[\s\S]*?state: "active"/.test(content.modules));
check("Structure marks development", content.structure.includes("DIMPRO DIARY – Projektnapló") && content.structure.includes('status: "in_development"'));
check("Workspace pre-SQL state", content.workspace.includes("DIARY PROJECT LOG CORE 0.8.0") && content.workspace.includes("DIMPRO_PROJEKTKAPU_DIARY_CORE_V080_BOOTSTRAP.sql"));
check("Workspace active header", content.workspace.includes("DIMPRO DIARY · PROJEKTNAPLÓ 0.8.0"));
check("Workspace disclaimer", content.workspace.includes("nem helyettesíti a hivatalos e-építési naplót"));
check("Workspace daily form", content.workspace.includes("Új napi projektnapló") && content.workspace.includes("Létszámbontás") && content.workspace.includes("Munkavédelem"));
check("Workspace event workflow", content.workspace.includes("Napi események") && content.workspace.includes("Project Calendar") && content.workspace.includes("DIALOG témakártya ID") && content.workspace.includes("DECIDE kérelem ID"));
check("Workspace close action", content.workspace.includes("Napló lezárása") && content.workspace.includes("diary.close"));
check("Workspace responsive layout", content.workspaceCss.includes("@media (max-width: 860px)") && content.workspaceCss.includes("grid-template-columns: 1fr"));
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
