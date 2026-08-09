import crypto from "node:crypto";
import fs from "node:fs";

const sqlPath = "supabase/DIMPRO_PROJEKTKAPU_PROJECT_CALENDAR_CORE_V050_BOOTSTRAP.sql";
const migrationPath = "supabase/migrations/20260802_project_calendar_core_v050.sql";
const shaPath = `${sqlPath}.sha256`;
const sql = fs.readFileSync(sqlPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");
const expectedSha = fs.readFileSync(shaPath, "utf8").trim();
const actualSha = crypto.createHash("sha256").update(sql).digest("hex");
const types = fs.readFileSync("app/lib/project-calendar/types.ts", "utf8");
const schema = fs.readFileSync("app/lib/project-calendar/schema.ts", "utf8");
const repository = fs.readFileSync("app/lib/project-calendar/repository.ts", "utf8");
const service = fs.readFileSync("app/lib/project-calendar/service.ts", "utf8");
const permissions = fs.readFileSync("app/lib/project-core/permissions.ts", "utf8");
const projectTypes = fs.readFileSync("app/lib/project-core/types.ts", "utf8");
const healthApi = fs.readFileSync("app/api/projects/[projectId]/calendar/health/route.ts", "utf8");
const eventsApi = fs.readFileSync("app/api/projects/[projectId]/calendar/events/route.ts", "utf8");
const eventApi = fs.readFileSync("app/api/projects/[projectId]/calendar/events/[eventId]/route.ts", "utf8");
const workspace = fs.readFileSync("components/project-gate/ProjectCalendarWorkspace.tsx", "utf8");
const workspaceCss = fs.readFileSync("components/project-gate/ProjectCalendarWorkspace.module.css", "utf8");
const shell = fs.readFileSync("components/project-gate/ProjectGateShell.tsx", "utf8");

function roleBlock(role) {
  const start = permissions.indexOf(`  ${role}: [`);
  const end = permissions.indexOf("  ],", start);
  return start >= 0 && end >= 0 ? permissions.slice(start, end) : "";
}

const explicitSmallFonts = [...workspaceCss.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)]
  .map((match) => Number(match[1]))
  .filter((value) => value < 12);

const checks = [
  ["SQL begins with begin", sql.trimStart().startsWith("begin;")],
  ["SQL ends with commit", sql.trimEnd().endsWith("commit;")],
  ["Migration copy identical", sql === migration],
  ["SHA-256 matches", actualSha === expectedSha],
  ["Project Core prerequisite", sql.includes("PROJECT_CORE_V020_REQUIRED")],
  ["Schema meta table present", sql.includes("create table if not exists public.project_calendar_schema_meta")],
  ["Calendar events table present", sql.includes("create table if not exists public.project_calendar_events")],
  ["Calendar project foreign key", sql.includes("references public.project_core_projects(id) on delete cascade")],
  ["Event type constraint", sql.includes("'MEETING','DEADLINE','TASK','INSPECTION','MILESTONE','REMINDER'")],
  ["Source module constraint", sql.includes("'DOCK','DIALOG','DECIDE','DIARY','DRIVE','SYSTEM'")],
  ["Status constraint", sql.includes("'PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'")],
  ["Priority constraint", sql.includes("'LOW','MEDIUM','HIGH','CRITICAL'")],
  ["Interval constraint", sql.includes("project_calendar_interval_check") && sql.includes("ends_at >= starts_at")],
  ["Source reference pair constraint", sql.includes("project_calendar_source_reference_check")],
  ["Active source uniqueness", sql.includes("project_calendar_active_source_unique") && sql.includes("status <> 'CANCELLED'")],
  ["Calendar RLS enabled", sql.includes("alter table public.project_calendar_schema_meta enable row level security") && sql.includes("alter table public.project_calendar_events enable row level security")],
  ["Direct calendar table access revoked", sql.includes("revoke all on table public.project_calendar_events from public, anon, authenticated")],
  ["Service role table access", sql.includes("grant select, insert, update, delete on table public.project_calendar_events to service_role")],
  ["Audit constraint preserves existing types", ["project","membership","lifecycle","folder","document","document_version","sync","calendar_event"].every((value) => sql.includes(`'${value}'`))],
  ["Create RPC present", sql.includes("project_calendar_create_event_atomic")],
  ["Update RPC present", sql.includes("project_calendar_update_event_atomic")],
  ["Cancel RPC present", sql.includes("project_calendar_cancel_event_atomic")],
  ["RPC access revoked from clients", sql.includes("revoke all on function public.project_calendar_create_event_atomic") && sql.includes("from public, anon, authenticated")],
  ["RPC service role grants", sql.includes("grant execute on function public.project_calendar_update_event_atomic") && sql.includes("to service_role")],
  ["Create audit event", sql.includes("PROJECT_CALENDAR_EVENT_CREATED") && sql.includes("'calendar_event'")],
  ["Update/completion audit events", sql.includes("PROJECT_CALENDAR_EVENT_UPDATED") && sql.includes("PROJECT_CALENDAR_EVENT_COMPLETED")],
  ["Cancellation audit event", sql.includes("PROJECT_CALENDAR_EVENT_CANCELLED")],
  ["Optimistic version conflict marker", sql.includes("PROJECT_CALENDAR_VERSION_CONFLICT") && !sql.includes("errcode = '40001'")],
  ["Cancellation idempotent", sql.includes("if v_current.status = 'CANCELLED' then") && sql.includes("return to_jsonb(v_current)")],
  ["Schema marker 0.5.0", sql.includes("'project-calendar-core','0.5.0',1,'project-calendar-core-v050-20260802'")],
  ["Schema contract version", schema.includes('PROJECT_CALENDAR_SCHEMA_VERSION = "0.5.0"')],
  ["All event types represented in TS", ["MEETING","DEADLINE","TASK","INSPECTION","MILESTONE","REMINDER"].every((value) => types.includes(`"${value}"`))],
  ["Repository has no file fallback", !repository.includes("file-store") && !repository.includes("fallback")],
  ["Repository uses service role", repository.includes("SUPABASE_SERVICE_ROLE_KEY")],
  ["Repository maps stable schema error", repository.includes("PROJECT_CALENDAR_SCHEMA_NOT_READY")],
  ["Service requires expected version", service.includes("PROJECT_CALENDAR_EXPECTED_VERSION_REQUIRED")],
  ["Service requires interval pair", service.includes("PROJECT_CALENDAR_INTERVAL_PAIR_REQUIRED")],
  ["Service forces separate cancel route", service.includes("PROJECT_CALENDAR_CANCEL_ROUTE_REQUIRED")],
  ["calendar.read permission type", projectTypes.includes('"calendar.read"')],
  ["calendar.write permission type", projectTypes.includes('"calendar.write"')],
  ["calendar_event audit type", projectTypes.includes('"calendar_event"')],
  ["OWNER calendar read/write", roleBlock("OWNER").includes('"calendar.read"') && roleBlock("OWNER").includes('"calendar.write"')],
  ["PROJECT_MANAGER calendar read/write", roleBlock("PROJECT_MANAGER").includes('"calendar.read"') && roleBlock("PROJECT_MANAGER").includes('"calendar.write"')],
  ["CONTRIBUTOR calendar read/write", roleBlock("CONTRIBUTOR").includes('"calendar.read"') && roleBlock("CONTRIBUTOR").includes('"calendar.write"')],
  ["REVIEWER calendar read only", roleBlock("REVIEWER").includes('"calendar.read"') && !roleBlock("REVIEWER").includes('"calendar.write"')],
  ["VIEWER calendar read only", roleBlock("VIEWER").includes('"calendar.read"') && !roleBlock("VIEWER").includes('"calendar.write"')],
  ["Health API uses calendar.read", healthApi.includes('requireProjectPermission(request, projectId, "calendar.read")')],
  ["Events GET uses calendar.read", eventsApi.includes('requireProjectPermission(request, projectId, "calendar.read")')],
  ["Events POST uses calendar.write", eventsApi.includes('requireProjectPermission(request, projectId, "calendar.write")')],
  ["Event PATCH uses calendar.write", eventApi.includes('requireProjectPermission(request, projectId, "calendar.write")')],
  ["Event DELETE uses calendar.write", eventApi.includes('requireProjectPermission(request, projectId, "calendar.write")')],
  ["DOCK renders Project Calendar", shell.includes("<ProjectCalendarWorkspace") && shell.includes('activeModule.id === "dock"')],
  ["UI exposes weekly calendar", workspace.includes("Heti projektkép és közelgő határidők") && workspace.includes("weekGrid")],
  ["UI exposes create form", workspace.includes("Új projektesemény") && workspace.includes("submitEvent")],
  ["UI exposes complete and cancel", workspace.includes('updateStatus(event, "COMPLETED")') && workspace.includes("cancelEvent(event)")],
  ["UI exposes source filters", workspace.includes("Minden modul") && workspace.includes("sourceModule")],
  ["ISO week calculation present", workspace.includes("function getIsoWeekInfo") && workspace.includes("getUTCDay() || 7")],
  ["Unified calendar week range identity", workspace.includes("weekIdentity") && workspace.includes("formatWeekRange") && workspace.includes(". hét")],
  ["Calendar week label has no redundant text", !workspace.includes("NAPTÁRI HÉT") && workspaceCss.includes("font-size: 23px")],
  ["UI pre-SQL state names bootstrap", workspace.includes("DIMPRO_PROJEKTKAPU_PROJECT_CALENDAR_CORE_V050_BOOTSTRAP.sql")],
  ["CSS has no explicit font below 12px", explicitSmallFonts.length === 0],
];

const result = {
  pass: checks.filter(([, pass]) => pass).length,
  total: checks.length,
  checks: checks.map(([name, pass]) => ({ name, pass: Boolean(pass) })),
  sha256: actualSha,
  explicitSmallFonts,
};
console.log(JSON.stringify(result, null, 2));
if (checks.some(([, pass]) => !pass)) process.exit(1);
