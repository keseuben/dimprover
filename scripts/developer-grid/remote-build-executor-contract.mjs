#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pool = read("app/lib/developer-grid/build-runner-pool.ts");
const poolContract = read("scripts/developer-grid/build-runner-pool-contract.mjs");
const client = read("scripts/developer-grid/build-gateway-client.mjs");
const refresh = read("scripts/developer-grid/refresh-build-gateway-snapshot.mjs");
const runner = read("scripts/developer-grid/build-runner-executor-v1.sh");
const dispatch = read("scripts/developer-grid/remote-build-dispatch.mjs");
const gatewayServer = read("ops/developer-grid/build-gateway/server.mjs");
const gatewayWorker = read("ops/developer-grid/build-gateway/worker.mjs");
const healthRefreshService = read("ops/developer-grid/build-gateway/dimpro-build-health-refresh.service");
const healthRefreshTimer = read("ops/developer-grid/build-gateway/dimpro-build-health-refresh.timer");

let n = 0;
function check(label, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${label}`); }

check("runner lock path matches hardened build nodes",()=>{assert.match(pool,/\/srv\/dimpro-build\/state\/full-build\.lock/);assert.match(poolContract,/\/srv\/dimpro-build\/state\/full-build\.lock/);assert.doesNotMatch(pool,/\/var\/lock\/dimpro-build-runner/);});
check("DEV client routes build transport through MCP gateway HTTPS",()=>{assert.match(client,/https:\/\/mcp\.dimprover\.hu\/build-gateway\/v1/);assert.match(client,/BUILD_GATEWAY_URL_INSECURE/);assert.doesNotMatch(client,/rejectUnauthorized:\s*false/);});
check("DEV health refresh has no direct BUILD SSH",()=>{assert.match(refresh,/getBuildGatewayNodes/);assert.doesNotMatch(refresh,/execFile|\/usr\/bin\/ssh|BatchMode=yes/);assert.match(refresh,/DIMPRO_MCP_SSH_GATEWAY/);});
check("gateway snapshot remains DEV and PROD DENY",()=>{assert.match(refresh,/environment:ENVIRONMENT/);assert.match(refresh,/productionAccess:PRODUCTION_ACCESS/);assert.match(gatewayServer,/environment:\"DEV\"/);assert.match(gatewayServer,/productionAccess:\"DENY\"/);});
check("gateway only exports allowlisted health metrics",()=>{for(const key of ["cpuPercent","memoryTotalBytes","swapTotalBytes","diskTotalBytes","buildLockHeld","currentRunId","storageGovernor","toolchainReady","nodeVersion","npmVersion","gitVersion"])assert.ok(gatewayServer.includes(key));for(const forbidden of ["privateKey","apiKey","connectionString"])assert.ok(!gatewayServer.includes(forbidden));});
check("gateway snapshot write is atomic and restrictive",()=>{assert.match(refresh,/flag:\"wx\"/);assert.match(refresh,/0o640/);assert.match(refresh,/renameSync/);});
check("gateway service has narrow route surface",()=>{for(const route of ['"/health"','"/nodes"','"/dispatch"'])assert.ok(gatewayServer.includes(route));assert.match(gatewayServer,/^\s*const runMatch = url\.pathname\.match/m);assert.doesNotMatch(gatewayServer,/exec\(|shell:\s*true|\/command|\/terminal/);});
check("gateway service authenticates proxy or bearer without exposing token",()=>{assert.match(gatewayServer,/timingSafeEqual/);assert.match(gatewayServer,/x-dimpro-build-gateway-proxy/);assert.match(gatewayServer,/127\.0\.0\.1/);assert.doesNotMatch(gatewayServer,/console\.log\([^\n]*token/i);});
check("gateway validates exact Git bundle HEAD before worker spawn",()=>{assert.match(gatewayServer,/bundle\", \"verify/);assert.match(gatewayServer,/bundle\", \"list-heads/);assert.match(gatewayServer,/SOURCE_BUNDLE_HEAD_MISMATCH/);assert.ok(gatewayServer.indexOf("verifyBundle(bundle") < gatewayServer.indexOf("spawn(process.execPath"));});
check("gateway revalidates assigned runner immediately before execution",()=>{assert.match(gatewayServer,/ASSIGNED_BUILD_RUNNER_NOT_READY/);assert.match(gatewayWorker,/ASSIGNED_BUILD_RUNNER_NOT_READY/);assert.match(gatewayWorker,/queryRunner\(runnerId\)/);});
check("gateway worker uses only build01/build02 SSH aliases",()=>{assert.match(gatewayWorker,/dimpro-build01/);assert.match(gatewayWorker,/dimpro-build02/);assert.match(gatewayWorker,/\^\(build01\|build02\)\$/);});
check("gateway worker returns artifact to canonical DEV store",()=>{assert.match(gatewayWorker,/\/srv\/dimpro-dev\/artifacts\/build-runs/);assert.match(gatewayWorker,/copyToDev/);assert.match(gatewayWorker,/build-artifact\.tar\.gz/);assert.match(gatewayWorker,/metadata\.json/);});
check("DEV BUILD health snapshot has a 30 second systemd refresh timer",()=>{assert.match(healthRefreshTimer,/OnUnitActiveSec=30s/);assert.match(healthRefreshTimer,/dimpro-build-health-refresh\.service/);assert.match(healthRefreshService,/refresh-build-gateway-snapshot\.mjs/);assert.match(healthRefreshService,/mcp\.dimprover\.hu\/build-gateway\/v1/);assert.match(healthRefreshService,/ReadWritePaths=\/srv\/dimpro-dev\/coordination\/health-snapshots/);assert.doesNotMatch(healthRefreshService,/\/usr\/bin\/ssh|BatchMode=yes/);});
check("runner verifies exact execution identity",()=>{for(const marker of ["dimproadmin","hostname -s","SOURCE_COMMIT_INVALID","SOURCE_BRANCH_INVALID","WORKER_CODE_INVALID"])assert.ok(runner.includes(marker));});
check("runner uses hardened host-local flock",()=>{assert.match(runner,/STATE_ROOT.*full-build\.lock/);assert.match(runner,/flock -n 9/);});
check("runner sources pinned toolchain",()=>{assert.match(runner,/toolchains\/node\.env/);for(const marker of ["v22.23.2","10.9.8","2.43.0"])assert.ok(runner.includes(marker));});
check("runner imports only allowlisted public build environment",()=>{assert.match(runner,/build-public-env\.json/);assert.ok(runner.includes("NEXT_PUBLIC_SUPABASE_URL"));assert.ok(runner.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"));assert.match(runner,/BUILD_PUBLIC_ENV_KEYS_INVALID/);assert.match(runner,/unset SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD SUPABASE_DB_URL/);});
check("runner verifies Git bundle provenance in runner repository",()=>{for(const marker of ["git bundle list-heads","SOURCE_BUNDLE_HEAD_MISMATCH","SOURCE_PROVENANCE_MISMATCH"])assert.ok(runner.includes(marker));assert.match(runner,/git --git-dir="\$\{REPO\}" bundle verify/);});
check("runner installs cleanup trap before bundle validation",()=>{assert.ok(runner.indexOf("trap cleanup EXIT")<runner.indexOf("SOURCE_BUNDLE_MISSING"));assert.ok(runner.indexOf("trap cleanup EXIT")<runner.indexOf("SOURCE_BUNDLE_VERIFY_FAILED"));});
check("runner creates detached worktree from exact commit",()=>{assert.match(runner,/worktree add --detach/);assert.match(runner,/\$\{source_commit\}/);});
check("runner uses npm ci and canonical build:raw",()=>{assert.match(runner,/npm ci --no-audit --no-fund/);assert.match(runner,/npm run build:raw/);});
check("runner requires build id standalone release metadata and SHA",()=>{for(const marker of [".next/BUILD_ID",".next/standalone/server.js",".next/.dimpro-release.json","build-artifact.tar.gz","sha256sum","artifactSha256"])assert.ok(runner.includes(marker));});
check("runner exposes no deploy migration restart or cutover execution",()=>{for(const forbidden of ["pm2 restart","systemctl restart","psql ","supabase db","DEPLOY_COMMAND","CUTOVER_COMMAND"])assert.ok(!runner.includes(forbidden));});
check("DEV dispatcher validates canonical branch HEAD and creates bundle",()=>{assert.match(dispatch,/SOURCE_BASELINE_MISMATCH/);assert.match(dispatch,/rev-parse/);assert.match(dispatch,/bundle\",\"create/);assert.match(dispatch,/SOURCE_BUNDLE_HEAD_MISMATCH/);});
check("DEV dispatcher has no direct BUILD SSH or SCP transport",()=>{assert.match(dispatch,/dispatchBuildGatewayRun/);assert.match(dispatch,/getBuildGatewayRun/);assert.doesNotMatch(dispatch,/\/usr\/bin\/ssh|\/usr\/bin\/scp|BatchMode=yes|StrictHostKeyChecking=yes/);});
check("DEV dispatcher requires READY LIVE free safe runner and validates artifact",()=>{for(const marker of ['node.quality!=="LIVE"','node.state!=="READY"','m.toolchainReady!==true','m.buildLockHeld!==false','m.currentRunId!==null','"SAFE","WATCH"',"ARTIFACT_METADATA_MISMATCH","ARTIFACT_RUNNER_MISMATCH","ARTIFACT_SHA256_MISMATCH"])assert.ok(dispatch.includes(marker),marker);});
check("gateway client allows bearer only from server-side token file",()=>{assert.match(client,/DEFAULT_TOKEN_FILE/);assert.match(client,/authorization:`Bearer \$\{token\}`/);assert.doesNotMatch(client,/NEXT_PUBLIC/);});

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"dimpro-build-gateway-contract-"));
const tokenFile=path.join(tmp,"token");
const snapshotFile=path.join(tmp,"snapshot.json");
const portFile=path.join(tmp,"port");
const fixtureFile=path.join(tmp,"fixture.mjs");
const token="fixture-token-0123456789abcdef0123456789abcdef0123456789abcdef";
fs.writeFileSync(tokenFile,`${token}\n`,{mode:0o600});
fs.writeFileSync(fixtureFile,`import http from "node:http";import fs from "node:fs";const token=${JSON.stringify(token)};const now=()=>new Date().toISOString();const metrics={cpuPercent:1,load1:0,cores:6,memoryTotalBytes:16000000000,memoryUsedBytes:1000000000,memoryAvailableBytes:15000000000,memoryPercent:6.25,swapTotalBytes:4800000000,swapUsedBytes:0,swapMinimumBytes:4294967296,swapPercent:0,diskTotalBytes:250000000000,diskUsedBytes:10000000000,diskAvailableBytes:240000000000,diskPercent:4,uptimeSeconds:1000,buildLockHeld:false,currentRunId:null,queueDepth:null,storageGovernor:"SAFE",toolchainReady:true,nodeVersion:"v22.23.2",npmVersion:"10.9.8",gitVersion:"2.43.0",architecture:"x86_64",kernel:"fixture"};const server=http.createServer((req,res)=>{if(req.headers.authorization!=="Bearer "+token){res.writeHead(401,{"content-type":"application/json"});return res.end(JSON.stringify({ok:false}));}const sampledAt=now();const nodes=["build01","build02"].map(id=>({schemaVersion:1,id,hostname:id+".dimpro.hu",state:"READY",reason:"fixture",lastVerifiedAt:sampledAt,source:"DIMPRO_MCP_SSH_GATEWAY",quality:"LIVE",metrics}));res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,snapshot:{schemaVersion:1,environment:"DEV",productionAccess:"DENY",source:"DIMPRO_MCP_SSH_GATEWAY",sampledAt,nodes}}));});server.listen(0,"127.0.0.1",()=>fs.writeFileSync(${JSON.stringify(portFile)},String(server.address().port)));`);
const child=spawn(process.execPath,[fixtureFile],{stdio:"ignore"});
let port="";for(let i=0;i<100&&!port;i+=1){try{port=fs.readFileSync(portFile,"utf8").trim();}catch{}if(!port)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}
check("gateway client fixture is available",()=>assert.match(port,/^\d+$/));
check("health refresh consumes authenticated gateway fixture and writes two READY nodes",()=>{execFileSync(process.execPath,[path.join(root,"scripts/developer-grid/refresh-build-gateway-snapshot.mjs")],{env:{...process.env,DIMPRO_BUILD_GATEWAY_BASE_URL:`http://127.0.0.1:${port}`,DIMPRO_BUILD_GATEWAY_TOKEN_FILE:tokenFile,BENJADMIN_BUILD_NODE_SNAPSHOT_FILE:snapshotFile},stdio:"ignore"});const value=JSON.parse(fs.readFileSync(snapshotFile,"utf8"));assert.equal(value.environment,"DEV");assert.equal(value.productionAccess,"DENY");assert.deepEqual(value.nodes.map((node)=>[node.id,node.state,node.quality]),[["build01","READY","LIVE"],["build02","READY","LIVE"]]);assert.equal(fs.statSync(snapshotFile).mode&0o777,0o640);});
child.kill("SIGTERM");
fs.rmSync(tmp,{recursive:true,force:true});
console.log(`Developer Grid Remote Build Executor V2 MCP transport contract PASS · ${n}/${n}`);
