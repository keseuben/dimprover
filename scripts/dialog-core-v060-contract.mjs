import fs from 'node:fs';
import crypto from 'node:crypto';

const read = (path) => fs.readFileSync(path, 'utf8');
const sqlPath = 'supabase/DIMPRO_PROJEKTKAPU_DIALOG_CORE_V060_BOOTSTRAP.sql';
const sql = read(sqlPath);
const repository = read('app/lib/dialog-core/repository.ts');
const service = read('app/lib/dialog-core/service.ts');
const types = read('app/lib/dialog-core/types.ts');
const schema = read('app/lib/dialog-core/schema.ts');
const permissions = read('app/lib/project-core/permissions.ts');
const projectTypes = read('app/lib/project-core/types.ts');
const workspace = read('components/project-gate/DialogWorkspace.tsx');
const workspaceCss = read('components/project-gate/DialogWorkspace.module.css');
const shell = read('components/project-gate/ProjectGateShell.tsx');
const modules = read('app/lib/project-gate/d6Modules.ts');
const calendarWorkspace = read('components/project-gate/ProjectCalendarWorkspace.tsx');
const calendarCss = read('components/project-gate/ProjectCalendarWorkspace.module.css');
const routes = [
  'app/api/projects/[projectId]/dialog/health/route.ts',
  'app/api/projects/[projectId]/dialog/threads/route.ts',
  'app/api/projects/[projectId]/dialog/threads/[threadId]/route.ts',
  'app/api/projects/[projectId]/dialog/threads/[threadId]/messages/route.ts',
].map(read).join('\n');

const checks = [
  ['SQL starts with transaction', sql.trimStart().startsWith('begin;')],
  ['SQL ends with commit', sql.trimEnd().endsWith('commit;')],
  ['Project Core prerequisite', sql.includes('PROJECT_CORE_V020_REQUIRED')],
  ['Calendar Core prerequisite', sql.includes('PROJECT_CALENDAR_V050_REQUIRED')],
  ['Schema meta table', sql.includes('create table if not exists public.dialog_core_schema_meta')],
  ['Sequence table', sql.includes('create table if not exists public.dialog_core_sequences')],
  ['Thread table', sql.includes('create table if not exists public.dialog_core_threads')],
  ['Message table', sql.includes('create table if not exists public.dialog_core_messages')],
  ['Project cascade FK', (sql.match(/references public\.project_core_projects\(id\) on delete cascade/g) || []).length >= 3],
  ['Thread message cascade FK', sql.includes('references public.dialog_core_threads(id) on delete cascade')],
  ['Calendar event FK', sql.includes('references public.project_calendar_events(id) on delete set null')],
  ['Project code uniqueness', sql.includes('unique (project_id, code)')],
  ['Thread type constraint', sql.includes("thread_type in ('RFI','DATA_REQUEST','DESIGN_COMMENT','COORDINATION','DECISION_LOG')")],
  ['Thread status constraint', sql.includes("status in ('OPEN','WAITING_RESPONSE','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')")],
  ['Priority constraint', sql.includes("priority in ('LOW','MEDIUM','HIGH','CRITICAL')")],
  ['Message type constraint', sql.includes("message_type in ('COMMENT','QUESTION','ANSWER','STATUS_NOTE')")],
  ['RLS enabled for four tables', (sql.match(/enable row level security/g) || []).length === 4],
  ['Anon and authenticated revoked', (sql.match(/revoke all on table public\.dialog_core_/g) || []).length === 4],
  ['Service role table grants', (sql.match(/grant select, insert, update, delete on table public\.dialog_core_/g) || []).length === 4],
  ['Audit entity types extended', sql.includes("'dialog_thread','dialog_message'")],
  ['Atomic create RPC', sql.includes('function public.dialog_core_create_thread_atomic')],
  ['Atomic update RPC', sql.includes('function public.dialog_core_update_thread_atomic')],
  ['Atomic message RPC', sql.includes('function public.dialog_core_add_message_atomic')],
  ['Security definer on RPCs', (sql.match(/security definer/g) || []).length >= 3],
  ['RPC public execution revoked', (sql.match(/revoke all on function public\.dialog_core_/g) || []).length === 3],
  ['RPC service role grants', (sql.match(/grant execute on function public\.dialog_core_/g) || []).length === 3],
  ['Automatic sequence allocation', sql.includes('dialog_core_sequences.next_number + 1')],
  ['Human readable yearly code', sql.includes("extract(year from now())") && sql.includes("lpad(v_number::text,4,'0')")],
  ['Thread type code prefixes', ['RFI','ADR','TER','EGY','DNT'].every((code) => sql.includes(`then '${code}'`))],
  ['Initial message in same transaction', sql.includes('p_initial_message is not null') && sql.includes('dialog_core_messages')],
  ['Calendar deadline created', sql.includes("'DEADLINE', 'DIALOG'") && sql.includes("'dialog_thread',v_thread.id")],
  ['Calendar ID stored on thread', sql.includes('set calendar_event_id = v_calendar.id')],
  ['Calendar status synchronized', sql.includes("v_calendar_status := case") && sql.includes("when v_thread.status in ('RESOLVED','CLOSED') then 'COMPLETED'")],
  ['Calendar deadline synchronized', sql.includes('starts_at = coalesce(v_thread.due_at,starts_at)')],
  ['Optimistic version conflict', sql.includes('DIALOG_THREAD_VERSION_CONFLICT') && sql.includes('version = version + 1')],
  ['Closed thread write protection', sql.includes('DIALOG_THREAD_CLOSED')],
  ['Status transition guard', sql.includes('DIALOG_INVALID_STATUS_TRANSITION')],
  ['Create audit', sql.includes("'DIALOG_THREAD_CREATED'")],
  ['Update audit', sql.includes("'DIALOG_THREAD_UPDATED'")],
  ['Resolve and close audit', sql.includes("'DIALOG_THREAD_RESOLVED'") && sql.includes("'DIALOG_THREAD_CLOSED'")],
  ['Message audit', sql.includes("'DIALOG_MESSAGE_CREATED'")],
  ['Schema marker 0.6.0', sql.includes("'dialog-core','0.6.0',1,'dialog-core-v060-20260802'")],
  ['Schema constants 0.6.0', schema.includes('DIALOG_CORE_SCHEMA_VERSION = "0.6.0"')],
  ['All four schema tables listed', ['dialog_core_schema_meta','dialog_core_sequences','dialog_core_threads','dialog_core_messages'].every((table) => schema.includes(table))],
  ['Repository service role only', repository.includes('SUPABASE_SERVICE_ROLE_KEY') && !workspace.includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['Repository stable schema error', repository.includes('DIALOG_CORE_SCHEMA_NOT_READY')],
  ['Repository maps conflict errors', repository.includes('DIALOG_THREAD_VERSION_CONFLICT') && repository.includes('DIALOG_THREAD_CLOSED')],
  ['Service supports five thread types', ['RFI','DATA_REQUEST','DESIGN_COMMENT','COORDINATION','DECISION_LOG'].every((type) => service.includes(`"${type}"`))],
  ['Service supports four message types', ['COMMENT','QUESTION','ANSWER','STATUS_NOTE'].every((type) => service.includes(`"${type}"`))],
  ['Service validates title', service.includes('DIALOG_TITLE_REQUIRED')],
  ['Service validates due date', service.includes('DIALOG_DUE_DATE_INVALID')],
  ['Service validates expected version', service.includes('DIALOG_EXPECTED_VERSION_REQUIRED')],
  ['Service sanitizes participant lists', service.includes('stringList(input.body.participantNames, 30, 240)')],
  ['Types include thread and message models', types.includes('export type DialogThread') && types.includes('export type DialogMessage')],
  ['Project permissions include dialog read/write', permissions.includes('"dialog.read"') && permissions.includes('"dialog.write"')],
  ['Viewer remains read only', /VIEWER:[\s\S]*?"dialog\.read"[\s\S]*?\],/.test(permissions)],
  ['Audit TS types extended', projectTypes.includes('"dialog_thread"') && projectTypes.includes('"dialog_message"')],
  ['Health API protected', routes.includes('requireProjectPermission(request, projectId, "dialog.read")')],
  ['Write APIs protected', (routes.match(/requireProjectPermission\(request, projectId, "dialog\.write"\)/g) || []).length >= 3],
  ['Thread list and create API', routes.includes('listDialogThreads') && routes.includes('createDialogThread')],
  ['Thread detail and update API', routes.includes('getDialogThread') && routes.includes('updateDialogThread')],
  ['Message API', routes.includes('addDialogMessage')],
  ['DIALOG workspace integrated', shell.includes('import DialogWorkspace') && shell.includes('activeModule.id === "dialog"')],
  ['DIALOG module active', /id: "dialog"[\s\S]*?state: "active"/.test(modules)],
  ['UI exposes RFI and topic types', workspace.includes('RFI / szakági kérdés') && workspace.includes('Kooperációs pont')],
  ['UI exposes due date and calendar link', workspace.includes('Válaszadási határidő') && workspace.includes('Projekt-naptár')],
  ['UI exposes filters and search', workspace.includes('DIALOG státuszszűrő') && workspace.includes('Keresés kód, cím, szakág')],
  ['UI exposes status actions', workspace.includes('Válaszra vár') && workspace.includes('Megoldva') && workspace.includes('Lezárás')],
  ['UI exposes message flow', workspace.includes('Hozzászólásfolyam') && workspace.includes('messageType')],
  ['UI pre-SQL bootstrap state', workspace.includes('DIMPRO_PROJEKTKAPU_DIALOG_CORE_V060_BOOTSTRAP.sql')],
  ['Responsive two-panel layout', workspaceCss.includes('grid-template-columns: minmax(280px, 34%) minmax(0, 1fr)') && workspaceCss.includes('.dialogLayout { grid-template-columns: 1fr; }')],
  ['UI minimum explicit font size 12', !/font-size:\s*(?:[0-9]|1[01])px/.test(workspaceCss)],
  ['Unified week and date range', calendarWorkspace.includes('<b>{isoWeek.week}. hét</b>') && calendarWorkspace.includes('formatWeekRange')],
  ['No redundant calendar week caption', !calendarWorkspace.includes('NAPTÁRI HÉT')],
  ['Week range in one frame', calendarWorkspace.includes('className={styles.weekIdentity}') && calendarCss.includes('.weekIdentity > strong')],
  ['Calendar week emphasis is balanced', calendarCss.includes('font-size: 23px') && calendarCss.includes('font-size: 20px')],
];

const result = {
  pass: checks.filter(([, ok]) => ok).length,
  total: checks.length,
  failures: checks.filter(([, ok]) => !ok).map(([name]) => name),
  sha256: crypto.createHash('sha256').update(sql).digest('hex'),
};
console.log(JSON.stringify(result, null, 2));
if (result.failures.length) process.exit(1);
