import fs from 'node:fs';
import crypto from 'node:crypto';

const migrationPath='supabase/migrations/20260802_project_core_v020.sql';
const bootstrapPath='supabase/project_core_v020_bootstrap.sql';
const hashPath='supabase/project_core_v020_bootstrap.sql.sha256';
const migration=fs.readFileSync(migrationPath,'utf8');
const bootstrap=fs.readFileSync(bootstrapPath,'utf8');
const expectedHash=fs.readFileSync(hashPath,'utf8').trim().split(/\s+/)[0];
const actualHash=crypto.createHash('sha256').update(bootstrap).digest('hex');
const required=[
 'project_core_schema_meta','project_core_projects','project_core_memberships','project_core_audit_events','project_core_entity_links',
 'project_core_create_project_atomic','project_core_update_project_atomic','project_core_add_membership_atomic',
 'project_core_change_lifecycle_atomic','project_core_bootstrap_state',
 "'project-core','0.2.0',1,'project-core-v020-20260802'",
 'enable row level security','revoke all on function','grant execute on function',
];
const checks=[
 {name:'bootstrap equals migration',pass:bootstrap===migration},
 {name:'bootstrap sha256',pass:actualHash===expectedHash,expectedHash,actualHash},
 ...required.map(value=>({name:`contains ${value}`,pass:migration.includes(value)})),
 {name:'transaction begin',pass:/^begin;/mi.test(migration)},
 {name:'transaction commit',pass:/commit;\s*$/mi.test(migration)},
 {name:'no service secret literal',pass:!/(SUPABASE_SERVICE_ROLE_KEY\s*=|eyJ[a-zA-Z0-9_-]{50,})/.test(migration)},
];
const result={pass:checks.filter(x=>x.pass).length,total:checks.length,checks};
console.log(JSON.stringify(result,null,2));
if(checks.some(x=>!x.pass)) process.exit(1);
