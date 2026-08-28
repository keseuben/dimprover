import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "developer-grid-runtime-contract-"));
const out = path.join(tmp, "out");
await fs.mkdir(out, { recursive: true });

await execFileAsync("npx", [
  "tsc",
  "app/lib/developer-grid/types.ts",
  "app/lib/developer-grid/release-provenance.ts",
  "--outDir", out,
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--target", "ES2022",
  "--esModuleInterop",
  "--skipLibCheck",
  "--noEmit", "false",
], { cwd: root, maxBuffer: 8_000_000 });

const release = await import(`file://${path.join(out, "release-provenance.js")}?v=${Date.now()}`);
let n = 0;
const check = (ok, name) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${name}`);
};

const commit = "a".repeat(40);
const valid = {
  declaredRelease: ".next",
  activeReleasePointer: null,
  pm2NextDistDir: ".next",
  runtimeCwd: "/srv/dimpro-dev/worktrees/test/.next/standalone",
  runtimeRelease: ".next",
  buildId: "build-1",
  expectedBuildId: "build-1",
  metadataReady: true,
  sourceCommit: commit,
  expectedSourceCommit: commit,
  sourceBranch: "feature/test",
  expectedSourceBranch: "feature/test",
};

const verified = release.verifyReleaseRuntimeProvenance(valid);
check(verified.state === "VERIFIED" && verified.blockCode === null, "matching runtime is VERIFIED");
const buildMismatch = release.verifyReleaseRuntimeProvenance({ ...valid, buildId: "build-2" });
check(buildMismatch.state === "BLOCKED" && buildMismatch.blockCode === "RELEASE_STATE_MISMATCH", "BUILD_ID mismatch blocks");
const commitMismatch = release.verifyReleaseRuntimeProvenance({ ...valid, sourceCommit: "b".repeat(40) });
check(commitMismatch.state === "BLOCKED", "source commit mismatch blocks");
const branchMismatch = release.verifyReleaseRuntimeProvenance({ ...valid, sourceBranch: "feature/other" });
check(branchMismatch.state === "BLOCKED", "source branch mismatch blocks");
const metadataMismatch = release.verifyReleaseRuntimeProvenance({ ...valid, metadataReady: false });
check(metadataMismatch.state === "BLOCKED", "missing immutable metadata blocks");
const pointerMismatch = release.verifyReleaseRuntimeProvenance({ ...valid, runtimeRelease: ".next-other" });
check(pointerMismatch.state === "BLOCKED", "runtime release mismatch blocks");
let thrown = null;
try { release.assertReleaseRuntimeMatch(buildMismatch); } catch (error) { thrown = error; }
check(thrown?.code === "RELEASE_STATE_MISMATCH", "assertion throws release mismatch code");
const empty = release.verifyReleaseRuntimeProvenance({
  declaredRelease: null,
  activeReleasePointer: null,
  pm2NextDistDir: null,
  runtimeCwd: null,
  runtimeRelease: null,
  buildId: null,
  expectedBuildId: null,
  metadataReady: false,
  sourceCommit: null,
  expectedSourceCommit: null,
  sourceBranch: null,
  expectedSourceBranch: null,
});
check(empty.state === "NOT_CONFIGURED", "empty runtime is NOT_CONFIGURED");
const adapter = await fs.readFile(path.join(root, "app/lib/developer-grid/runtime-provenance.ts"), "utf8");
check(adapter.includes(".dimpro-release.json") && adapter.includes(".dimpro-assets-build-id"), "adapter reads immutable build metadata");
check(adapter.includes("active-next-release") && adapter.includes("NEXT_DIST_DIR"), "adapter resolves active release identity");

await fs.rm(tmp, { recursive: true, force: true });
console.log(`Developer Grid runtime provenance contract PASS · ${n}/10`);
