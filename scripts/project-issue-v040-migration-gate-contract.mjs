import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("scripts/project-issue-v040-migration-gate.mjs", "utf8");
let pass = 0;
function check(name, condition) {
  assert.ok(condition, name);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${name}`);
}

check("closed modes", source.includes('new Set(["preflight", "apply", "verify"])'));
check("only argv mode is accepted", source.includes('process.argv[2]') && !source.includes('process.argv[3]'));
check("fixed V0.4 migration path", source.includes('supabase/migrations/20260815190500_project_issue_core_v040.sql'));
check("fixed V0.4 migration SHA", source.includes('7abd051a91c8cfc7450e7ad03670781bb2d08f4292255ff060dcfae1366ccffa'));
check("fixed DEV pooler host", source.includes('aws-0-eu-central-1.pooler.supabase.com'));
check("fixed DEV connection user", source.includes('postgres.pbgyuznivqvestuksvif'));
check("fixed DEV project ref", source.includes('pbgyuznivqvestuksvif'));
check("pooler PostgreSQL role checked", source.includes('role: "postgres"') && source.includes('identity.user !== db.role'));
check("passwordless pgpass path", source.includes('"-w"') && !source.includes('PGPASSWORD'));
check("ON_ERROR_STOP required", source.includes('"ON_ERROR_STOP=1"'));
check("DEV QA project sentinel", source.includes('project-drive-compare-rc1-qa'));
check("HJ-00001 sentinel", source.includes("serial='HJ-00001'"));
check("HJ-00002 sentinel", source.includes("serial='HJ-00002'"));
check("V0.3 exact baseline gate", source.includes('probe.markerVersion === "0.3.0"') && source.includes('Number(probe.migrationCount) === 3') && source.includes('project-issue-core-v030-20260815'));
check("V0.4 exact verify gate", source.includes('probe.markerVersion === "0.4.0"') && source.includes('Number(probe.migrationCount) === 4') && source.includes('project-issue-core-v040-20260815'));
check("attachment table required post apply", source.includes("to_regclass('public.project_issue_attachments') is not null"));
check("link RPC required post apply", source.includes("project_issue_attachment_link_atomic(text,text,jsonb,text,text)"));
check("unlink RPC required post apply", source.includes("project_issue_attachment_unlink_atomic(text,text,text,integer,text,text)"));
check("explicit DEV approval phrase", source.includes('DEV_ONLY_PROJECT_ISSUE_V040_APPLY_APPROVED'));
check("apply refuses missing approval", source.includes('PROJECT_ISSUE_V040_APPROVAL_REQUIRED'));
check("backup uses pg_dump", source.includes('run("pg_dump"'));
check("backup is full DB custom dump", source.includes('"--format=custom"') && !source.includes('"--table='));
check("backup listing uses pg_restore", source.includes('run("pg_restore", ["--list", backupFile])'));
check("backup permissions 0600", source.includes('chmodSync(backupFile, 0o600)'));
check("backup hash persisted", source.includes('backup.sha256'));
check("migration hash persisted", source.includes('migration.sha256'));
check("preflight snapshot persisted", source.includes('preflight.json'));
check("fixed migration apply only", source.includes('run("psql", psqlArgs(["-f", migration]))'));
check("no generic SQL file parameter", !source.includes('sqlFile') && !source.includes('migrationFile') && !source.includes('inputFile'));
check("QA issue snapshot before apply", source.includes('const beforeIssues = qaIssueSnapshot()'));
check("QA issue snapshot after apply", source.includes('const afterIssues = qaIssueSnapshot()'));
check("QA business state deep equality", source.includes('assert.deepEqual(afterIssues, beforeIssues'));
check("RLS security probe", source.includes("relrowsecurity"));
check("anon table privilege denied", source.includes("has_table_privilege('anon'"));
check("authenticated table privilege denied", source.includes("has_table_privilege('authenticated'"));
check("service role table CRUD verified", ["serviceSelect", "serviceInsert", "serviceUpdate", "serviceDelete"].every((token) => source.includes(token)));
check("anon RPC execute denied", source.includes('anonLinkExecute === false') && source.includes('anonUnlinkExecute === false'));
check("authenticated RPC execute denied", source.includes('authenticatedLinkExecute === false') && source.includes('authenticatedUnlinkExecute === false'));
check("service role RPC execute required", source.includes('serviceLinkExecute === true') && source.includes('serviceUnlinkExecute === true'));
check("post schema acceptance required", source.includes('PROJECT_ISSUE_V040_POST_SCHEMA_FAILED'));
check("security acceptance required", source.includes('PROJECT_ISSUE_V040_SECURITY_NOT_READY'));
check("migration report persisted 0600", source.includes('migration-report.json') && source.includes('{ mode: 0o600 }'));
check("no generic service role SQL executor", !source.includes('SUPABASE_SERVICE_ROLE_KEY') && !source.includes('execSql'));

console.log(`\nProject Issue V0.4 migration gate contract: ${pass}/${pass} PASS`);
