import fs from 'node:fs';
import crypto from 'node:crypto';

const sqlPath = 'supabase/DIMPRO_PROJEKTKAPU_DRIVE_OBJECT_STORAGE_V040_BOOTSTRAP.sql';
const migrationPath = 'supabase/migrations/20260802_drive_object_storage_v040.sql';
const shaPath = `${sqlPath}.sha256`;
const sql = fs.readFileSync(sqlPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const expectedSha = fs.readFileSync(shaPath, 'utf8').trim();
const actualSha = crypto.createHash('sha256').update(sql).digest('hex');
const checks = [];
function check(name, pass) { checks.push({ name, pass: Boolean(pass) }); }

check('SQL begins with begin', sql.startsWith('begin;'));
check('SQL ends with commit', sql.trimEnd().endsWith('commit;'));
check('Migration copy identical', sql === migration);
check('SHA-256 matches', expectedSha === actualSha);
check('Storage schema meta table', sql.includes('create table if not exists public.drive_storage_schema_meta'));
check('Upload sessions table', sql.includes('create table if not exists public.drive_core_upload_sessions'));
check('Upload target constraint', sql.includes('drive_core_upload_target_check'));
check('Upload status constraint', sql.includes("'INITIATED','FINALIZED','ABORTED','EXPIRED','FAILED'"));
check('Active new document uniqueness', sql.includes('drive_core_upload_active_new_document_unique'));
check('Active new version uniqueness', sql.includes('drive_core_upload_active_new_version_unique'));
check('RLS schema meta', sql.includes('alter table public.drive_storage_schema_meta enable row level security'));
check('RLS upload sessions', sql.includes('alter table public.drive_core_upload_sessions enable row level security'));
check('Direct anon access revoked', sql.includes('revoke all on table public.drive_core_upload_sessions from public, anon, authenticated'));
check('Create session RPC', sql.includes('create or replace function public.drive_core_create_upload_session_atomic'));
check('Finalize upload RPC', sql.includes('create or replace function public.drive_core_finalize_upload_atomic'));
check('Abort upload RPC', sql.includes('create or replace function public.drive_core_abort_upload_session'));
check('Download audit RPC', sql.includes('create or replace function public.drive_core_log_download'));
check('Version conflict P0001', sql.includes("DRIVE_CORE_VERSION_CONFLICT' using errcode = 'P0001'"));
check('Expired sessions released', sql.includes("status = 'EXPIRED'") && sql.includes("metadata = metadata || jsonb_build_object('expiredAt',now())"));
check('S3 version finalization', sql.includes("v_session.storage_key, v_session.final_version_status"));
check('Project audit upload', sql.includes("'DRIVE_' || v_event_type"));
check('Download audit event', sql.includes("'DRIVE_DOCUMENT_DOWNLOADED'"));
check('Service role function grants', (sql.match(/grant execute on function public\.drive_core_/g) || []).length === 4);
check('Schema marker version', sql.includes("'drive-object-storage','0.4.0',1,'drive-object-storage-v040-20260802'"));

const routeFiles = [
  'app/api/projects/[projectId]/drive/uploads/init/route.ts',
  'app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts',
  'app/api/projects/[projectId]/drive/uploads/[uploadId]/abort/route.ts',
  'app/api/projects/[projectId]/drive/documents/[documentId]/download/route.ts',
];
check('All object storage routes exist', routeFiles.every((file) => fs.existsSync(file)));
check('All routes use project permissions', routeFiles.every((file) => fs.readFileSync(file, 'utf8').includes('requireProjectPermission')));
const storageConfig = fs.readFileSync('app/lib/drive-core/storageConfig.ts', 'utf8');
check('Secrets remain server-side', storageConfig.includes('DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY') && !storageConfig.includes('safePreview'));
const healthRoute = fs.readFileSync('app/api/projects/[projectId]/drive/health/route.ts', 'utf8');
check('Core health remains separate', healthRoute.includes('getDriveCoreDatabaseHealth') && healthRoute.includes('getDriveObjectStorageHealth'));
const coreSchema = fs.readFileSync('app/lib/drive-core/schema.ts', 'utf8');
check('Stable core stays 0.3.0', coreSchema.includes('DRIVE_CORE_SCHEMA_VERSION = "0.3.0"'));

const report = { pass: checks.filter((item) => item.pass).length, total: checks.length, checks, sha256: actualSha };
console.log(JSON.stringify(report, null, 2));
if (checks.some((item) => !item.pass)) process.exitCode = 1;
