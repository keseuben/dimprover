import type { BuildNodeSnapshot } from "./build-nodes";
import { listBuildRunnerRegistry, runnerSnapshotUsability } from "./build-runner-pool";

export type BuildExecutor =
  | { kind: "REMOTE_BUILD_NODE"; node: BuildNodeSnapshot; reason: string }
  | { kind: "BUILD_QUEUE"; node: null; reason: string };

export function resolveBuildExecutor(nodes: BuildNodeSnapshot[]): BuildExecutor {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const runner of listBuildRunnerRegistry()) {
    const node = nodeMap.get(runner.id);
    if (!node) continue;
    const usability = runnerSnapshotUsability(node);
    if (usability.usable) return { kind: "REMOTE_BUILD_NODE", node, reason: `${runner.hostname} READY és FREE build runner.` };
  }
  return { kind: "BUILD_QUEUE", node: null, reason: "Nincs READY és FREE remote build runner; FULL BUILD csak QUEUED lehet." };
}

export function assertBuildExecutionAllowed(executor: BuildExecutor, input: {
  runnerLocalLockHeld: boolean;
  storagePreflightPassed: boolean;
  memoryPreflightPassed: boolean;
  productionAccess: "DENY";
}) {
  const reasons: string[] = [];
  if (executor.kind !== "REMOTE_BUILD_NODE") reasons.push("REMOTE_BUILD_RUNNER_REQUIRED");
  if (!input.runnerLocalLockHeld) reasons.push("RUNNER_LOCAL_FLOCK_REQUIRED");
  if (!input.storagePreflightPassed) reasons.push("STORAGE_PREFLIGHT_REQUIRED");
  if (!input.memoryPreflightPassed) reasons.push("MEMORY_PREFLIGHT_REQUIRED");
  if (input.productionAccess !== "DENY") reasons.push("PROD_DENY_REQUIRED");
  if (reasons.length) {
    const error = new Error(`Build execution BLOCKED · ${reasons.join(" · ")}`);
    Object.assign(error, { code: "BUILD_EXECUTION_BLOCKED", reasons, executor });
    throw error;
  }
  return executor;
}
