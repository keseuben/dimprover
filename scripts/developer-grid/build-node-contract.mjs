import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "developer-grid-build-node-contract-"));
const out = path.join(tmp, "out");
await fs.mkdir(out, { recursive: true });
await execFileAsync("npx", [
  "tsc",
  "app/lib/developer-grid/types.ts",
  "app/lib/developer-grid/build-nodes.ts",
  "app/lib/developer-grid/build-orchestrator.ts",
  "--outDir", out,
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--target", "ES2022",
  "--esModuleInterop",
  "--skipLibCheck",
  "--noEmit", "false",
], { cwd: root, maxBuffer: 8_000_000 });

const nodesApi = await import(`file://${path.join(out, "build-nodes.js")}?v=${Date.now()}`);
const orchestrator = await import(`file://${path.join(out, "build-orchestrator.js")}?v=${Date.now()}`);
let n = 0;
function check(ok, name) {
  if (!ok) throw new Error(`FAIL ${name}`);
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${name}`);
}

const snapshotFile = path.join(tmp, "build-nodes.json");
const nowMs = Date.now();
const sampledAt = new Date(nowMs).toISOString();
const metrics = {
  cpuPercent: 1.2,
  load1: 0.02,
  cores: 6,
  memoryTotalBytes: 16_769_310_720,
  memoryUsedBytes: 500_000_000,
  memoryAvailableBytes: 16_269_310_720,
  memoryPercent: 3,
  swapTotalBytes: 8_589_934_592,
  swapUsedBytes: 0,
  swapMinimumBytes: 4_294_967_296,
  swapPercent: 0,
  diskTotalBytes: 251_987_718_144,
  diskUsedBytes: 4_000_000_000,
  diskAvailableBytes: 247_987_718_144,
  diskPercent: 2,
  uptimeSeconds: 3600,
  buildLockHeld: false,
  currentRunId: null,
  queueDepth: null,
  storageGovernor: "SAFE",
  toolchainReady: true,
  nodeVersion: "v22.23.2",
  npmVersion: "10.9.8",
  gitVersion: "2.43.0",
  architecture: "x86_64",
  kernel: "6.8.0-139-generic",
};
const validSnapshot = {
  schemaVersion: 1,
  environment: "DEV",
  productionAccess: "DENY",
  sampledAt,
  source: "DIMPRO_MCP_SSH_GATEWAY",
  nodes: [
    {
      schemaVersion: 1,
      id: "build01",
      hostname: "build01.dimpro.hu",
      state: "READY",
      reason: "ready",
      lastVerifiedAt: sampledAt,
      source: "DIMPRO_MCP_SSH_GATEWAY",
      quality: "LIVE",
      metrics,
    },
    {
      schemaVersion: 1,
      id: "build02",
      hostname: "build02.dimpro.hu",
      state: "BLOCKED",
      reason: "swap below minimum",
      lastVerifiedAt: sampledAt,
      source: "DIMPRO_MCP_SSH_GATEWAY",
      quality: "LIVE",
      metrics: { ...metrics, swapTotalBytes: 534_769_664 },
    },
  ],
};
const writeSnapshot = (value) => fs.writeFile(snapshotFile, JSON.stringify(value), "utf8");

const baseline = nodesApi.listBuildNodes();
check(baseline.length === 2, "registry contains exactly two build nodes");
check(baseline[0].hostname === "build01.dimpro.hu" && baseline[1].hostname === "build02.dimpro.hu", "canonical build hostnames fixed");
check(baseline.every((node) => node.state === "NOT_CONNECTED"), "static registry starts fail-closed");
check(baseline.every((node) => node.lastVerifiedAt === null), "unverified registry has no timestamp");

await writeSnapshot(validSnapshot);
const live = await nodesApi.probeBuildNodes({ snapshotFile, nowMs });
check(live.find((node) => node.id === "build01")?.state === "READY", "valid gateway sample marks build01 READY");
check(live.find((node) => node.id === "build02")?.state === "DISABLED", "BLOCKED sample cannot become an executor");
check(live.find((node) => node.id === "build02")?.healthState === "BLOCKED", "BLOCKED health state is preserved");
check(live.every((node) => node.source === "DIMPRO_MCP_SSH_GATEWAY"), "MCP gateway source is preserved");
check(live.every((node) => node.quality === "LIVE"), "fresh sample quality is LIVE");
check(live[0].metrics?.buildLockHeld === false, "false local lock value is preserved");
check(live[0].metrics?.swapMinimumBytes === 4_294_967_296, "4 GB swap minimum is preserved");
check(nodesApi.selectBuildNode(live)?.id === "build01", "first READY node is selected");
check(orchestrator.resolveBuildExecutor(live).node?.id === "build01", "READY gateway node becomes remote executor");
check(nodesApi.assertBuildNodeReady(live[0]).state === "READY", "READY remote node is accepted");

const stale = await nodesApi.probeBuildNodes({ snapshotFile, nowMs: nowMs + 61_000 });
check(stale.every((node) => node.state === "NOT_CONNECTED" && node.quality === "STALE"), "sample older than 60 seconds fails closed");

await writeSnapshot({ ...validSnapshot, source: "DIRECT_SSH" });
const wrongSource = await nodesApi.probeBuildNodes({ snapshotFile, nowMs });
check(wrongSource.every((node) => node.state === "NOT_CONNECTED" && node.quality === "UNKNOWN"), "non-gateway source fails closed");

await writeSnapshot({ ...validSnapshot, apiToken: "forbidden" });
const secretBearing = await nodesApi.probeBuildNodes({ snapshotFile, nowMs });
check(secretBearing.every((node) => node.state === "NOT_CONNECTED"), "secret-bearing snapshot fails closed");

await writeSnapshot({ ...validSnapshot, nodes: [validSnapshot.nodes[0], validSnapshot.nodes[0]] });
const duplicate = await nodesApi.probeBuildNodes({ snapshotFile, nowMs });
check(duplicate.every((node) => node.state === "NOT_CONNECTED"), "duplicate node identifiers fail closed");

await fs.writeFile(snapshotFile, "{invalid", "utf8");
const malformed = await nodesApi.probeBuildNodes({ snapshotFile, nowMs });
check(malformed.every((node) => node.state === "NOT_CONNECTED"), "malformed JSON fails closed");

const missing = await nodesApi.probeBuildNodes({ snapshotFile: path.join(tmp, "missing.json"), nowMs });
check(missing.every((node) => node.state === "NOT_CONNECTED" && node.metrics === null), "missing snapshot fails closed without invented metrics");

const source = await fs.readFile(path.join(root, "app/lib/developer-grid/build-nodes.ts"), "utf8");
check(source.includes("BENJADMIN_BUILD_NODE_SNAPSHOT_FILE") && source.includes("DIMPRO_MCP_SSH_GATEWAY"), "adapter reads the configured gateway snapshot");
check(!source.includes("execFile") && !source.includes('"/usr/bin/ssh"'), "DEV adapter performs no direct SSH");

await fs.rm(tmp, { recursive: true, force: true });
console.log(`Developer Grid build node gateway contract PASS · ${n}/${n}`);
