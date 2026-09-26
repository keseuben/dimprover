#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20260926_drive_drop_incoming_source_v010.sql","utf8");
const bootstrap=readFileSync("supabase/DIMPRO_PROJEKTKAPU_DRIVE_DROP_INCOMING_SOURCE_V010_BOOTSTRAP.sql","utf8");
const schema=readFileSync("app/lib/drive-core/dropIncomingSchema.ts","utf8");
const repo=readFileSync("app/lib/drive-core/storageRepository.ts","utf8");
const incoming=readFileSync("app/lib/drop/archive/dropDriveIncomingService.ts","utf8");
const preflight=readFileSync("scripts/projectkapu-drop-drive-pilot-preflight.mjs","utf8");
const gateRoute=readFileSync("app/api/projects/[projectId]/drop/submission-gates/route.ts","utf8");
const healthRoute=readFileSync("app/api/projects/[projectId]/drive/health/route.ts","utf8");
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

check("migration is mirrored by bootstrap",()=>assert.equal(migration,bootstrap));
check("constraint preserves first-class sources",()=>assert.match(migration,/source in \('WEB','DESKTOP','DROP','SYSTEM'\)/));
check("migration records dedicated marker",()=>assert.match(migration,/'drive-drop-incoming-source','0\.1\.0',1,'drive-drop-incoming-source-v010-20260926'/));
check("migration is additive and transaction wrapped",()=>assert.match(migration,/^begin;/)&&assert.match(migration,/drop constraint if exists drive_core_upload_source_check/)&&assert.match(migration,/commit;/));
check("schema constants match SQL marker",()=>assert.match(schema,/0\.1\.0/)&&assert.match(schema,/drive-drop-incoming-source-v010-20260926/));
check("repository exposes marker health",()=>assert.match(repo,/getDriveDropIncomingSourceDatabaseHealth/)&&assert.match(repo,/DRIVE_DROP_INCOMING_SOURCE_SCHEMA_VERSION/));
check("incoming import fails closed before DB write",()=>assert.match(incoming,/DROP_DRIVE_INCOMING_SOURCE_SCHEMA_NOT_READY/)&&assert.match(incoming,/getDriveDropIncomingSourceDatabaseHealth/));
check("preflight requires marker",()=>assert.match(preflight,/drive-drop-incoming-source/)&&assert.match(preflight,/DRIVE_DROP_INCOMING_SOURCE_SCHEMA_NOT_READY/));
check("gate creation requires source marker health",()=>assert.match(gateRoute,/getDriveDropIncomingSourceDatabaseHealth/)&&assert.match(gateRoute,/DRIVE_DROP_INCOMING_SOURCE_SCHEMA_NOT_READY/));
check("Drive health exposes source marker blocker",()=>assert.match(healthRoute,/getDriveDropIncomingSourceDatabaseHealth/)&&assert.match(healthRoute,/DRIVE_DROP_INCOMING_SOURCE_SCHEMA_NOT_READY/));
check("no PROD operation embedded",()=>assert.doesNotMatch(migration,/prod|production/i));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
