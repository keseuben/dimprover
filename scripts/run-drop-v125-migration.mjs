import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const url=process.env.SUPABASE_DB_URL?.trim();
const password=process.env.SUPABASE_DB_PASSWORD?.trim();
assert.ok(url,'SUPABASE_DB_URL hiányzik'); assert.ok(password,'SUPABASE_DB_PASSWORD hiányzik');
const result=spawnSync('psql',[url,'-X','-v','ON_ERROR_STOP=1','-f','supabase/DIMPRO_DROP_125_SEND_UX_REPORTS.sql'],{cwd:process.cwd(),env:{...process.env,PGPASSWORD:password},stdio:'inherit'});
if(result.error) throw result.error;
process.exit(result.status ?? 1);
