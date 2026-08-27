import type { BuildNodeDefinition } from "./types";

const DEFAULT_BUILD_NODES: readonly BuildNodeDefinition[] = [
  {
    id: "build01",
    hostname: "build01.dimpro.hu",
    state: "NOT_CONNECTED",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: null,
    reason: "Build node abstraction előkészítve; a node még nincs hitelesítve a Developer Gridben.",
  },
  {
    id: "build02",
    hostname: "build02.dimpro.hu",
    state: "NOT_CONNECTED",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: null,
    reason: "Build node abstraction előkészítve; a node még nincs hitelesítve a Developer Gridben.",
  },
] as const;

export function listBuildNodes(): BuildNodeDefinition[] {
  return DEFAULT_BUILD_NODES.map((node) => ({ ...node, capabilities: [...node.capabilities] }));
}

export function selectBuildNode(nodes: BuildNodeDefinition[]) {
  return nodes.find((node) => node.state === "READY") || null;
}

export function assertBuildNodeReady(node: BuildNodeDefinition | null) {
  if (!node || node.state !== "READY") {
    const error = new Error("Nincs READY állapotú hitelesített build node. Veszélyes kerülő build tilos.");
    Object.assign(error, { code: "BUILD_NODE_NOT_READY" });
    throw error;
  }
  return node;
}
