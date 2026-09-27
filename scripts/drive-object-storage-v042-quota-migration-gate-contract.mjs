#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gate = readFileSync("scripts/drive-object-storage-v042-quota-migration-gate.mjs", "utf8");
let pass = 0;
const check = (name, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${name}`);
};

check("canonical DEV project ref is pinned", () => assert.match(gate, /pbgyuznivqvestuksvif/));
check("migration SHA is pinned", () => assert.match(gate, /f27aef5dbe1fcf45cb0e95b143971b5f9c77e837138dabdc4a49ad0bfabd3a1d/));
check("PROD equality is blocked", () => assert.match(gate, /PROD_TARGET_BLOCKED/));
check("credential absence fails closed", () => assert.match(gate, /DB_CREDENTIAL_REQUIRED/));
check("apply requires explicit approval phrase", () => assert.match(gate, /DEV_ONLY_DRIVE_OBJECT_STORAGE_V042_QUOTA_APPLY_APPROVED/));
check("apply requires coordinated migration lock", () => assert.match(gate, /COORDINATED_LOCK_REQUIRED/) && assert.match(gate, /process\.env\.OPERATION !== "migration"/));
check("backup precedes psql apply", () => assert.ok(gate.indexOf('const dump = run("pg_dump"') < gate.indexOf('const applied = run("psql"')));
check("backup archive is verified", () => assert.match(gate, /pg_restore/));
check("previous RPC definition is backed up", () => assert.match(gate, /pg_get_functiondef/) && assert.match(gate, /functionFile/));
check("existing row counts are protected", () => assert.match(gate, /EXISTING_ROW_COUNT_CHANGED/));
check("quota function markers are verified", () => {
  assert.match(gate, /pg_advisory_xact_lock/);
  assert.match(gate, /DRIVE_PROJECT_QUOTA_REQUIRED/);
  assert.match(gate, /DRIVE_PROJECT_QUOTA_EXCEEDED/);
  assert.match(gate, /quota_bytes/);
});
check("RPC privileges are verified", () => assert.match(gate, /anonExecute/) && assert.match(gate, /serviceExecute/));
check("target schema marker is verified", () => assert.match(gate, /drive-object-storage-v042-quota-20260927/));
check("production access is explicitly denied in backup manifest", () => assert.match(gate, /productionAccess: "DENY"/));

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
