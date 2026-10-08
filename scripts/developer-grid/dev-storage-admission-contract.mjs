#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "scripts/developer-grid/build-runner-executor-v1.sh"), "utf8");
const runtime = fs.readFileSync(path.join(root, "ops/developer-grid/build-runner/dimpro-build-runner-executor-v1"), "utf8");
const probe = fs.readFileSync(path.join(root, "ops/developer-grid/build-runner/dimpro-dev-storage-probe-v1"), "utf8");
assert.equal(source, runtime, "source and runtime files must be identical");
for (const literal of [
  "dev-storage-freeze.json", "check_dev_storage_admission", "DEV_STORAGE_ADMISSION_UNKNOWN_DENY",
  "DEV_STORAGE_ADMISSION_BLOCKED", 'DEV_STORAGE_HOST="dev.dimpro.hu"',
  "BatchMode=yes", "IdentitiesOnly=yes", "StrictHostKeyChecking=yes",
  "dev-storage-probe_ed25519", "dimpro-storage-probe-v1"
]) assert.ok(runtime.includes(literal), literal);
assert.ok(runtime.indexOf("check_dev_storage_admission\n") < runtime.indexOf("SOURCE_BUNDLE_MISSING"));
assert.ok(runtime.indexOf("check_dev_storage_admission\n") < runtime.indexOf("npm ci --no-audit"));
assert.match(probe, /SSH_ORIGINAL_COMMAND/);
assert.match(probe, /df -B1 --output=size,used,avail,pcent/);

const fn = runtime.match(/^dev_storage_policy\(\) \{[\s\S]*?^\}/m);
assert.ok(fn, "pure Bash capacity policy must exist");
const prefix = ["DEV_STORAGE_MIN_FREE_BYTES=16106127360", "DEV_STORAGE_MAX_USED_PERCENT=90",fn[0],'dev_storage_policy "$1"'].join("\n");
const fixtures = [
  ["healthy", "200000000000 150000000000 30000000000 84%",0],
  ["exact limit", "200000000000 160000000000 16106127360 89%",0],
  ["one below", "200000000000 160000000000 16106127359 89%",10],
  ["90 percent", "200000000000 175000000000 20000000000 90%",10],
  ["critical", "125697622016 123000000000 2200000000 99%",10],
  ["empty", "",11],
  ["zero size", "0 0 0 0%",11],
  ["excess used", "100 101 0 90%",11],
  ["bad sum", "100 90 20 90%",11],
  ["bad percent", "100 80 20 BAD",11],
  ["over percent", "100 80 20 101%",11],
  ["negative", "100 80 -20 80%",11],
  ["extra field", "100 80 20 80% EXTRA",11],
  ["two lines", "100 80 20 80%\n100 80 20 80%",11]
];
for(const [label,line,expected] of fixtures) {
  const result=spawnSync("bash",["-c",prefix,"policy-test",line],{encoding:"utf8"});
  assert.equal(result.status,expected, label+": "+result.stderr);
  console.log("PASS storage fixture: "+label);
}
console.log("DIMPRO DEV storage admission contract PASS: "+fixtures.length+"/"+fixtures.length+" fixtures");
