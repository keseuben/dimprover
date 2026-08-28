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

const baseline = nodesApi.listBuildNodes();
check(baseline.length === 2, "registry contains exactly two build nodes");
check(baseline[0].hostname === "build01.dimpro.hu" && baseline[1].hostname === "build02.dimpro.hu", "canonical build hostnames fixed");
check(baseline.every((node) => node.state === "NOT_CONNECTED"), "static registry starts fail-closed");
check(baseline.every((node) => node.lastVerifiedAt === null), "unprobed registry has no verified timestamp");

const mixed = await nodesApi.probeBuildNodes(async (node) => node.id === "build01"
  ? { ready: true, reason: "simulated ready" }
  : { ready: false, reason: "simulated offline" });
check(mixed.find((node) => node.id === "build01")?.state === "READY", "successful probe marks build01 READY");
check(mixed.find((node) => node.id === "build02")?.state === "NOT_CONNECTED", "failed probe keeps build02 NOT_CONNECTED");
check(mixed.every((node) => Boolean(node.lastVerifiedAt)), "probe stamps verification time");
check(mixed.find((node) => node.id === "build02")?.reason === "simulated offline", "probe reason preserved");

const remote = orchestrator.resolveBuildExecutor(mixed);
check(remote.kind === "REMOTE_BUILD_NODE" && remote.node?.id === "build01", "READY node becomes remote executor");
const offline = await nodesApi.probeBuildNodes(async () => ({ ready: false, reason: "offline" }));
const local = orchestrator.resolveBuildExecutor(offline);
check(local.kind === "CANONICAL_DEV_SERVER", "no READY node falls back to canonical DEV executor");
let blocked = null;
try { orchestrator.assertBuildExecutionAllowed(local, { exclusiveLockHeld: false, storagePreflightPassed: true, memoryPreflightPassed: true, productionAccess: "DENY" }); } catch (error) { blocked = error; }
check(blocked?.code === "BUILD_EXECUTION_BLOCKED", "canonical DEV build still requires exclusive lock");
check(orchestrator.assertBuildExecutionAllowed(local, { exclusiveLockHeld: true, storagePreflightPassed: true, memoryPreflightPassed: true, productionAccess: "DENY" }).kind === "CANONICAL_DEV_SERVER", "canonical DEV executor allowed after all gates");
let notReady = null;
try { nodesApi.assertBuildNodeReady(offline[0]); } catch (error) { notReady = error; }
check(notReady?.code === "BUILD_NODE_NOT_READY", "non-ready remote node rejected");
check(nodesApi.assertBuildNodeReady(mixed[0]).state === "READY", "READY remote node accepted");
const source = await fs.readFile(path.join(root, "app/lib/developer-grid/build-nodes.ts"), "utf8");
check(source.includes("BatchMode=yes") && source.includes("ConnectTimeout=3") && source.includes("StrictHostKeyChecking=yes"), "SSH probe is batch, bounded and strict-host-key");

await fs.rm(tmp, { recursive: true, force: true });
console.log(`Developer Grid build node contract PASS · ${n}/15`);
