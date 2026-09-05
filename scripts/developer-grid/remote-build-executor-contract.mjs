#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pool = read("app/lib/developer-grid/build-runner-pool.ts");
const poolContract = read("scripts/developer-grid/build-runner-pool-contract.mjs");
const refresh = read("scripts/developer-grid/refresh-build-gateway-snapshot.mjs");
const runner = read("scripts/developer-grid/build-runner-executor-v1.sh");
const dispatch = read("scripts/developer-grid/remote-build-dispatch.mjs");

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${label}`);
}

check("runner lock path matches hardened build nodes", () => {
  assert.match(pool, /\/srv\/dimpro-build\/state\/full-build\.lock/);
  assert.match(poolContract, /\/srv\/dimpro-build\/state\/full-build\.lock/);
  assert.doesNotMatch(pool, /\/var\/lock\/dimpro-build-runner/);
});
check("gateway snapshot is DEV and PROD DENY", () => {
  assert.match(refresh, /environment:\s*ENVIRONMENT/);
  assert.match(refresh, /productionAccess:\s*PRODUCTION_ACCESS/);
  assert.match(refresh, /DIMPRO_MCP_SSH_GATEWAY/);
});
check("gateway SSH is strict and non-interactive", () => {
  for (const marker of ["BatchMode=yes","ConnectTimeout=5","ConnectionAttempts=1","StrictHostKeyChecking=yes"]) assert.ok(refresh.includes(marker));
});
check("gateway only exports allowlisted health metrics", () => {
  for (const key of ["cpuPercent","memoryTotalBytes","swapTotalBytes","diskTotalBytes","buildLockHeld","currentRunId","storageGovernor","toolchainReady","nodeVersion","npmVersion","gitVersion"]) assert.ok(refresh.includes(key), `missing allowlisted metric: ${key}`);
  for (const forbidden of ["password","privateKey","authorization","apiKey","connectionString"]) assert.ok(!refresh.includes(`"${forbidden}"`));
});
check("gateway snapshot write is atomic and restrictive", () => {
  assert.match(refresh, /flag:\s*"wx"/);
  assert.match(refresh, /0o640/);
  assert.match(refresh, /renameSync/);
});
check("runner verifies exact execution identity", () => {
  for (const marker of ["dimproadmin","hostname -s","SOURCE_COMMIT_INVALID","SOURCE_BRANCH_INVALID","WORKER_CODE_INVALID"]) assert.ok(runner.includes(marker));
});
check("runner uses hardened host-local flock", () => {
  assert.match(runner, /STATE_ROOT.*full-build\.lock/);
  assert.match(runner, /flock -n 9/);
});
check("runner sources pinned toolchain", () => {
  assert.match(runner, /toolchains\/node\.env/);
  for (const marker of ["v22.23.2","10.9.8","2.43.0"]) assert.ok(runner.includes(marker));
});
check("runner verifies Git bundle provenance", () => {
  for (const marker of ["git bundle list-heads","git bundle verify","SOURCE_BUNDLE_HEAD_MISMATCH","SOURCE_PROVENANCE_MISMATCH"]) assert.ok(runner.includes(marker));
});
check("runner creates detached worktree from exact commit", () => {
  assert.match(runner, /worktree add --detach/);
  assert.match(runner, /\$\{source_commit\}/);
});
check("runner uses npm ci and canonical build:raw", () => {
  assert.match(runner, /npm ci --no-audit --no-fund/);
  assert.match(runner, /npm run build:raw/);
});
check("runner pins release provenance environment", () => {
  for (const marker of ["DIMPRO_RELEASE_SOURCE_COMMIT","DIMPRO_RELEASE_SOURCE_BRANCH","NEXT_SAFE_BUILD","NEXT_BUILD_CPUS"]) assert.ok(runner.includes(marker));
});
check("runner requires build id standalone and release metadata", () => {
  for (const marker of [".next/BUILD_ID",".next/standalone/server.js",".next/.dimpro-release.json","RELEASE_COMMIT_MISMATCH","RELEASE_BRANCH_MISMATCH"]) assert.ok(runner.includes(marker));
});
check("runner artifact has SHA-256 and runner metadata", () => {
  for (const marker of ["build-artifact.tar.gz","sha256sum","artifactSha256","runner:{id:$nodeId,hostname:$hostname}"]) assert.ok(runner.includes(marker));
});
check("runner exposes no deploy migration restart or cutover execution", () => {
  for (const forbidden of ["pm2 restart","systemctl restart","psql ","supabase db","DEPLOY_COMMAND","CUTOVER_COMMAND"]) assert.ok(!runner.includes(forbidden));
});
check("dispatcher validates canonical branch head before transfer", () => {
  assert.match(dispatch, /SOURCE_BASELINE_MISMATCH/);
  assert.match(dispatch, /rev-parse/);
  assert.match(dispatch, /refs\/heads/);
});
check("dispatcher refreshes gateway snapshot before scheduling", () => {
  assert.match(dispatch, /refresh-build-gateway-snapshot\.mjs/);
  assert.match(dispatch, /NO_READY_BUILD_RUNNER/);
});
check("dispatcher prioritizes BUILD-01 then BUILD-02", () => {
  assert.match(dispatch, /RUNNER_PRIORITY = \["build01", "build02"\]/);
});
check("dispatcher requires READY LIVE free safe runner", () => {
  for (const marker of ['node.quality !== "LIVE"','node.state !== "READY"','m.toolchainReady !== true','m.buildLockHeld !== false','m.currentRunId !== null','"SAFE","WATCH"']) assert.ok(dispatch.includes(marker));
});
check("dispatcher uses fixed SSH SCP Git binaries and strict host checks", () => {
  for (const marker of ["/usr/bin/ssh","/usr/bin/scp","/usr/bin/git","BatchMode=yes","StrictHostKeyChecking=yes"]) assert.ok(dispatch.includes(marker));
});
check("dispatcher validates returned artifact metadata and SHA", () => {
  for (const marker of ["ARTIFACT_METADATA_MISMATCH","ARTIFACT_RUNNER_MISMATCH","ARTIFACT_SHA256_MISMATCH","artifactSha256"]) assert.ok(dispatch.includes(marker));
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dimpro-build-gateway-contract-"));
const fakeSsh = path.join(tmp, "ssh");
const snapshot = path.join(tmp, "build-nodes.json");
fs.writeFileSync(fakeSsh, `#!/usr/bin/env bash
set -e
nodeId=""
for arg in "$@"; do
  if [[ "$arg" == "build01" || "$arg" == "build02" ]]; then nodeId="$arg"; fi
done
[[ -n "$nodeId" ]]
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat <<JSON
{"schemaVersion":1,"id":"$nodeId","hostname":"$nodeId.dimpro.hu","state":"READY","reason":"fixture","lastVerifiedAt":"$now","source":"DIMPRO_MCP_SSH_GATEWAY","quality":"LIVE","metrics":{"cpuPercent":1,"load1":0,"cores":6,"memoryTotalBytes":16000000000,"memoryUsedBytes":1000000000,"memoryAvailableBytes":15000000000,"memoryPercent":6.25,"swapTotalBytes":4800000000,"swapUsedBytes":0,"swapMinimumBytes":4294967296,"swapPercent":0,"diskTotalBytes":250000000000,"diskUsedBytes":10000000000,"diskAvailableBytes":240000000000,"diskPercent":4,"uptimeSeconds":1000,"buildLockHeld":false,"currentRunId":null,"queueDepth":null,"storageGovernor":"SAFE","toolchainReady":true,"nodeVersion":"v22.23.2","npmVersion":"10.9.8","gitVersion":"2.43.0","architecture":"x86_64","kernel":"fixture"}}
JSON
`, { mode: 0o755 });

check("gateway fixture writes two sanitized READY nodes", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/developer-grid/refresh-build-gateway-snapshot.mjs")], {
    env: { ...process.env, DIMPRO_BUILD_GATEWAY_SSH_BIN: fakeSsh, BENJADMIN_BUILD_NODE_SNAPSHOT_FILE: snapshot },
    stdio: "ignore",
  });
  const value = JSON.parse(fs.readFileSync(snapshot, "utf8"));
  assert.equal(value.environment, "DEV");
  assert.equal(value.productionAccess, "DENY");
  assert.deepEqual(value.nodes.map((node) => [node.id,node.state,node.quality]), [["build01","READY","LIVE"],["build02","READY","LIVE"]]);
  assert.equal(fs.statSync(snapshot).mode & 0o777, 0o640);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Developer Grid Remote Build Executor V1 contract PASS · ${n}/${n}`);
