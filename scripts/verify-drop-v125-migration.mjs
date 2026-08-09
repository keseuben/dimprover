import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const url=process.env.SUPABASE_DB_URL?.trim(); const password=process.env.SUPABASE_DB_PASSWORD?.trim();
assert.ok(url&&password,'DB kapcsolat hiányzik');
const query=`select table_name||'.'||column_name||'|'||is_nullable||'|'||coalesce(column_default,'') from information_schema.columns where table_schema='public' and ((table_name='dimpro_send_entitlements' and column_name in ('max_saved_contacts','upload_rules_acceptance_count','upload_rules_version','upload_rules_last_accepted_at')) or (table_name='drop_public_package_workflows' and column_name in ('export_groups_as_folders','append_group_name_to_filename'))) order by table_name,column_name;`;
const r=spawnSync('psql',[url,'-X','-v','ON_ERROR_STOP=1','-Atc',query],{env:{...process.env,PGPASSWORD:password},encoding:'utf8'});
if(r.error) throw r.error; if(r.status!==0){process.stderr.write(r.stderr||'');process.exit(r.status??1);} process.stdout.write(r.stdout);
const rows=r.stdout.trim().split('\n').filter(Boolean); if(rows.length!==6) throw new Error(`Várt 6 oszlop, kapott ${rows.length}`);
