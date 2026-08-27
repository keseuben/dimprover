import type { BuildNodeDefinition } from "./types";

export type BuildExecutor =
  | { kind: "REMOTE_BUILD_NODE"; node: BuildNodeDefinition; reason: string }
  | { kind: "CANONICAL_DEV_SERVER"; node: null; reason: string };

export function resolveBuildExecutor(nodes: BuildNodeDefinition[]): BuildExecutor {
  const remote = nodes.find((node) => node.state === "READY") || null;
  if (remote) return { kind: "REMOTE_BUILD_NODE", node: remote, reason: `${remote.hostname} hitelesített READY build node.` };
  return { kind: "CANONICAL_DEV_SERVER", node: null, reason: "build01/build02 még nem READY; a canonical DEV szerver a hivatalos build executor központi exclusive lock alatt." };
}

export function assertBuildExecutionAllowed(executor: BuildExecutor, input: { exclusiveLockHeld: boolean; storagePreflightPassed: boolean; memoryPreflightPassed: boolean; productionAccess: "DENY" }) {
  const reasons: string[] = [];
  if (!input.exclusiveLockHeld) reasons.push("EXCLUSIVE_COORDINATION_LOCK_REQUIRED");
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
